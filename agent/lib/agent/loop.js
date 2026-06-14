import { loadAgentConfig } from "../config-loader.js";
import { createLlmClient } from "../llm/client.js";
import { assistantMessageToPlain, reconcileAssistantContent } from "../llm/messages.js";
import { executeTool, getAllToolDefinitions, toolResultContent } from "./tool-registry.js";
import { extractTurnMessages } from "./chat-history.js";
import { ensureWithinContextLimit } from "./summarize.js";
import { countMessagesTokens } from "./context.js";
import { buildVisionInjectionMessage } from "../llm/vision.js";
function parseToolArgs(raw) {
    try {
        return JSON.parse(raw || "{}");
    } catch {
        return {};
    }
}

function buildStats(llm, messages, contextBaseLength, toolCallCount, modelCallCount) {
    const model = llm.provider.model;
    const contextWindow = llm.modelMeta?.contextWindow ?? 128000;
    const loadedContext = countMessagesTokens(messages.slice(0, contextBaseLength), model);
    const peakContext = countMessagesTokens(messages, model);
    return {
        toolCallCount,
        modelCallCount,
        tokensUsed: Math.max(loadedContext, peakContext),
        contextWindow,
    };
}

function buildResult(llm, messages, contextBaseLength, toolCallCount, modelCallCount, extra = {}) {
    return {
        ...extra,
        stats: buildStats(llm, messages, contextBaseLength, toolCallCount, modelCallCount),
        turnMessages: extractTurnMessages(messages, contextBaseLength),
    };
}

function toolSignature(name, args) {
    return `${name}:${JSON.stringify(args)}`;
}

const FORCE_REPLY_HINT =
    "You have enough tool output. Do not repeat the same tool call. Continue with different tools if more work is needed, reply briefly only if the user needs an update, or finish silently if the task is complete.";
const EMPTY_REPLY_HINT =
    "Your previous assistant reply was empty. Reply to the user in plain text now. Summarize what you accomplished and answer their request.";

function pushToolResult(messages, toolCallId, result) {
    messages.push({
        role: "tool",
        tool_call_id: toolCallId,
        content: toolResultContent(result),
    });
}

function maybeInjectVisionMessage(messages, result, modelMeta) {
    if (!result?.visionImage || !modelMeta?.supportsVision) return;
    messages.push(buildVisionInjectionMessage(result.visionImage, result.visionCaption));
}

function pushSkippedToolResults(messages, toolCalls, startIndex = 0) {
    for (let i = startIndex; i < toolCalls.length; i += 1) {
        pushToolResult(messages, toolCalls[i].id, { ok: false, aborted: true, error: "Stopped by user." });
    }
}

function finishStoppedTurn(llm, messages, contextBaseLength, toolCallCount, modelCallCountRef, { partialText = null } = {}) {
    return buildResult(llm, messages, contextBaseLength, toolCallCount, modelCallCountRef.value, {
        text: partialText?.trim() || null,
        error: "stopped_by_user",
    });
}

function isStoppedError(err, session) {
    return Boolean(session?.isAborted?.() || err?.name === "AbortError");
}

function shouldStop(session) {
    return Boolean(session?.isAborted?.());
}

function consumeNewSegment(needsNewSegmentRef, onSegmentStart, partialTextRef) {
    if (!needsNewSegmentRef?.value) return;
    needsNewSegmentRef.value = false;
    if (partialTextRef) partialTextRef.value = null;
    onSegmentStart?.();
}

function makeStreamDelta({ onTextDelta, onSegmentStart, setStatus, partialTextRef, needsNewSegmentRef }) {
    if (!onTextDelta) return undefined;

    return (_delta, full) => {
        consumeNewSegment(needsNewSegmentRef, onSegmentStart, partialTextRef);
        if (partialTextRef) partialTextRef.value = full;
        setStatus("streaming");
        onTextDelta(_delta, full);
    };
}

async function completeTextReply(
    llm,
    messages,
    { onTextDelta, onTextSync, onSegmentStart, setStatus, maxRetries, modelCallCount, session, partialTextRef, needsNewSegmentRef },
) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        if (shouldStop(session)) return null;

        if (attempt > 0) {
            messages.push({ role: "user", content: EMPTY_REPLY_HINT });
        }

        setStatus("thinking");
        const streamDelta = makeStreamDelta({
            onTextDelta,
            onSegmentStart,
            setStatus,
            partialTextRef,
            needsNewSegmentRef,
        });

        modelCallCount.value += 1;
        let response;
        try {
            response = await llm.complete({
                messages,
                tool_choice: "none",
                stream: Boolean(onTextDelta),
                onTextDelta: streamDelta,
                signal: session?.signal,
            });
        } catch (err) {
            if (isStoppedError(err, session)) {
                if (partialTextRef && err.partialText) partialTextRef.value = err.partialText;
                return null;
            }
            throw err;
        }

        if (shouldStop(session)) return null;

        const raw = response.choices?.[0]?.message;
        if (!raw) continue;

        consumeNewSegment(needsNewSegmentRef, onSegmentStart, partialTextRef);
        const msg = assistantMessageToPlain(raw);
        const streamedText = partialTextRef.value;
        const reconciled = reconcileAssistantContent(msg, streamedText);
        if (onTextSync && reconciled.content) {
            onTextSync(reconciled.content);
        }
        partialTextRef.value = null;

        if (reconciled.content?.trim()) {
            messages.push(reconciled);
            return { text: reconciled.content, usage: response.usage };
        }
    }

    return null;
}

export async function runAgent(userMessage, options = {}) {
    try {
        return await runAgentTurn(userMessage, options);
    } catch (err) {
        if (isStoppedError(err, options.session)) {
            return {
                text: err.partialText?.trim() || null,
                error: "stopped_by_user",
                stats: { toolCallCount: 0, modelCallCount: 0, tokensUsed: 0, contextWindow: 128000 },
                turnMessages: [],
            };
        }
        console.error("Agent loop error:", err?.stack || err);
        return {
            text: null,
            error: "agent_error",
            errorDetail: err?.message || String(err),
            stats: { toolCallCount: 0, modelCallCount: 0, tokensUsed: 0, contextWindow: 128000 },
            turnMessages: [],
        };
    }
}

async function runAgentTurn(
    userMessage,
    { sessionId, onTextDelta, onTextSync, onSegmentStart, onStatusPhase, visionAttachment = null, session = null } = {},
) {
    const llm = await createLlmClient();
    const agentConfig = loadAgentConfig();
    const setStatus = (phase, detail = null) => onStatusPhase?.(phase, detail);
    const maxRounds = agentConfig.maxToolRoundsPerTurn ?? agentConfig.maxToolRounds ?? 16;
    const maxToolCalls = agentConfig.maxToolCallsPerTurn ?? 20;
    const maxSameToolRepeat = agentConfig.maxSameToolRepeat ?? 2;
    const maxEmptyReplyRetries = agentConfig.maxEmptyReplyRetries ?? 8;
    const modelCallCountRef = { value: 0 };

    setStatus("generating");
    let messages = await ensureWithinContextLimit(llm, userMessage, llm.modelMeta, {
        sessionId,
        onStatusPhase: setStatus,
        visionAttachment,
        session,
    });

    if (shouldStop(session)) {
        return finishStoppedTurn(llm, messages, messages.length, 0, modelCallCountRef, { partialText: null });
    }
    const tools = getAllToolDefinitions();
    const contextBaseLength = messages.length;

    let toolCallCount = 0;
    const toolSigCounts = new Map();
    const fileSnapshots = new Map();
    let forceReplyNext = false;

    const partialTextRef = { value: null };
    const needsNewSegmentRef = { value: false };

    for (let round = 0; round < maxRounds; round++) {
        if (shouldStop(session)) {
            return finishStoppedTurn(llm, messages, contextBaseLength, toolCallCount, modelCallCountRef, {
                partialText: partialTextRef.value,
            });
        }

        const toolsEnabled = !forceReplyNext;
        const useStream = Boolean(onTextDelta) && !toolsEnabled;

        setStatus("thinking");

        const streamDelta =
            useStream && onTextDelta
                ? makeStreamDelta({
                      onTextDelta,
                      onSegmentStart,
                      setStatus,
                      partialTextRef,
                      needsNewSegmentRef,
                  })
                : undefined;

        modelCallCountRef.value += 1;
        let response;
        try {
            response = await llm.complete({
                messages,
                tools: toolsEnabled ? tools : undefined,
                tool_choice: toolsEnabled ? "auto" : "none",
                stream: useStream,
                onTextDelta: streamDelta,
                signal: session?.signal,
            });
        } catch (err) {
            if (isStoppedError(err, session)) {
                if (err.partialText) partialTextRef.value = err.partialText;
                return finishStoppedTurn(llm, messages, contextBaseLength, toolCallCount, modelCallCountRef, {
                    partialText: partialTextRef.value,
                });
            }
            throw err;
        }

        if (shouldStop(session)) {
            return finishStoppedTurn(llm, messages, contextBaseLength, toolCallCount, modelCallCountRef, {
                partialText: partialTextRef.value,
            });
        }

        forceReplyNext = false;

        const raw = response.choices?.[0]?.message;
        if (!raw) throw new Error("Empty LLM response");

        consumeNewSegment(needsNewSegmentRef, onSegmentStart, partialTextRef);
        const streamedText = partialTextRef.value;
        let choice = reconcileAssistantContent(assistantMessageToPlain(raw), streamedText);
        if (onTextSync && choice.content) {
            onTextSync(choice.content);
        }
        partialTextRef.value = null;

        const toolCalls = choice.tool_calls;
        if (!toolCalls?.length) {
            if (choice.content?.trim()) {
                messages.push(choice);
                return buildResult(llm, messages, contextBaseLength, toolCallCount, modelCallCountRef.value, {
                    text: choice.content,
                    usage: response.usage,
                });
            }

            if (toolCallCount > 0) {
                messages.push(choice);
                return buildResult(llm, messages, contextBaseLength, toolCallCount, modelCallCountRef.value, {
                    text: null,
                    usage: response.usage,
                });
            }

            if (shouldStop(session)) {
                return finishStoppedTurn(llm, messages, contextBaseLength, toolCallCount, modelCallCountRef, {
                    partialText: partialTextRef.value,
                });
            }

            const recovered = await completeTextReply(llm, messages, {
                onTextDelta,
                onTextSync,
                onSegmentStart,
                setStatus,
                maxRetries: maxEmptyReplyRetries,
                modelCallCount: modelCallCountRef,
                session,
                partialTextRef,
                needsNewSegmentRef,
            });
            if (shouldStop(session)) {
                return finishStoppedTurn(llm, messages, contextBaseLength, toolCallCount, modelCallCountRef, {
                    partialText: partialTextRef.value || recovered?.text,
                });
            }
            if (recovered) {
                return buildResult(llm, messages, contextBaseLength, toolCallCount, modelCallCountRef.value, {
                    text: recovered.text,
                    usage: recovered.usage,
                });
            }

            return buildResult(llm, messages, contextBaseLength, toolCallCount, modelCallCountRef.value, {
                text: null,
                error: "empty_reply_exhausted",
            });
        }

        messages.push(choice);

        if (toolCallCount >= maxToolCalls) {
            messages.push({ role: "user", content: FORCE_REPLY_HINT });
            forceReplyNext = true;
            continue;
        }

        for (const tc of toolCalls) {
            if (toolCallCount >= maxToolCalls) break;

            if (shouldStop(session)) {
                pushSkippedToolResults(messages, toolCalls, toolCalls.indexOf(tc));
                return finishStoppedTurn(llm, messages, contextBaseLength, toolCallCount, modelCallCountRef, {
                    partialText: partialTextRef.value,
                });
            }

            setStatus("tools", tc.function.name);

            const args = parseToolArgs(tc.function.arguments);
            const sig = toolSignature(tc.function.name, args);
            const seen = (toolSigCounts.get(sig) || 0) + 1;
            toolSigCounts.set(sig, seen);
            toolCallCount += 1;

            if (seen > maxSameToolRepeat) {
                messages.push({
                    role: "tool",
                    tool_call_id: tc.id,
                    content: toolResultContent({
                        error: "Duplicate tool call skipped. Use the previous result and answer the user without calling this again.",
                    }),
                });
                forceReplyNext = true;
                continue;
            }

            const result = await executeTool(tc.function.name, args, {
                sessionId,
                messages,
                model: llm.provider.model,
                modelMeta: llm.modelMeta,
                fileSnapshots,
                signal: session?.signal,
            });

            if (shouldStop(session)) {
                pushToolResult(messages, tc.id, result);
                pushSkippedToolResults(messages, toolCalls, toolCalls.indexOf(tc) + 1);
                return finishStoppedTurn(llm, messages, contextBaseLength, toolCallCount, modelCallCountRef, {
                    partialText: partialTextRef.value,
                });
            }
            pushToolResult(messages, tc.id, result);
            maybeInjectVisionMessage(messages, result, llm.modelMeta);
        }

        needsNewSegmentRef.value = true;

        if (forceReplyNext || toolCallCount >= maxToolCalls) {
            messages.push({ role: "user", content: FORCE_REPLY_HINT });
            forceReplyNext = true;
        }
    }

    messages.push({ role: "user", content: FORCE_REPLY_HINT });

    if (shouldStop(session)) {
        return finishStoppedTurn(llm, messages, contextBaseLength, toolCallCount, modelCallCountRef, {
            partialText: partialTextRef.value,
        });
    }

    const recovered = await completeTextReply(llm, messages, {
        onTextDelta,
        onTextSync,
        onSegmentStart,
        setStatus,
        maxRetries: maxEmptyReplyRetries,
        modelCallCount: modelCallCountRef,
        session,
        partialTextRef,
        needsNewSegmentRef,
    });
    if (shouldStop(session)) {
        return finishStoppedTurn(llm, messages, contextBaseLength, toolCallCount, modelCallCountRef, {
            partialText: partialTextRef.value || recovered?.text,
        });
    }
    if (recovered) {
        return buildResult(llm, messages, contextBaseLength, toolCallCount, modelCallCountRef.value, {
            text: recovered.text,
            usage: recovered.usage,
        });
    }

    if (toolCallCount > 0) {
        return buildResult(llm, messages, contextBaseLength, toolCallCount, modelCallCountRef.value, {
            text: null,
        });
    }

    return buildResult(llm, messages, contextBaseLength, toolCallCount, modelCallCountRef.value, {
        text: null,
        error: "tool_rounds_exceeded",
    });
}
