import OpenAI from "openai";
import { sanitizeMessagesForApi } from "./sanitize-messages.js";

export function createOpenAIClient({ baseURL, apiKey, extraHeaders = {} }) {
    return new OpenAI({
        apiKey,
        baseURL,
        defaultHeaders: extraHeaders,
    });
}

/** Chat Completions response shape used by the agent loop. */
function completionPayload(completion) {
    const choice = completion.choices?.[0];
    if (!choice) throw new Error("Empty LLM response");
    return {
        choices: [
            {
                message: choice.message,
                finish_reason: choice.finish_reason,
            },
        ],
        usage: completion.usage ?? null,
    };
}

function isAbortError(err) {
    return err?.name === "AbortError" || err?.code === "ABORT_ERR";
}

function mergeToolCallDelta(toolCalls, deltaToolCalls) {
    if (!deltaToolCalls?.length) return;

    for (const delta of deltaToolCalls) {
        const index = delta.index ?? 0;
        if (!toolCalls[index]) {
            toolCalls[index] = {
                id: delta.id,
                type: delta.type || "function",
                function: { name: "", arguments: "" },
            };
        }

        const current = toolCalls[index];
        if (delta.id) current.id = delta.id;
        if (delta.type) current.type = delta.type;
        if (delta.function?.name) current.function.name += delta.function.name;
        if (delta.function?.arguments) current.function.arguments += delta.function.arguments;
    }
}

function buildStreamMessage(content, toolCalls) {
    const message = { role: "assistant", content: content || null };
    const finished = toolCalls.filter(Boolean);
    if (finished.length) {
        message.tool_calls = finished;
    }
    return message;
}

export async function chatCompletions({
    client,
    model,
    messages,
    tools,
    tool_choice,
    stream = false,
    onTextDelta,
    signal,
    reasoning_effort,
    max_tokens = 8192,
}) {
    const includeTools = Boolean(tools?.length) && tool_choice !== "none";
    const params = { model, messages: sanitizeMessagesForApi(messages), max_tokens };

    if (reasoning_effort) {
        params.reasoning_effort = reasoning_effort;
    }

    if (includeTools) {
        params.tools = tools;
        params.tool_choice = tool_choice ?? "auto";
    }

    const useStream = Boolean(stream && onTextDelta);

    if (signal?.aborted) {
        const err = new Error("Stopped by user.");
        err.name = "AbortError";
        throw err;
    }

    const requestOptions = signal ? { signal } : undefined;

    if (useStream) {
        const streamResp = await client.chat.completions.create(
            {
                ...params,
                stream: true,
                stream_options: { include_usage: true },
            },
            requestOptions,
        );

        let content = "";
        let usage = null;
        let finishReason = "stop";
        const toolCalls = [];

        try {
            for await (const chunk of streamResp) {
                if (signal?.aborted) {
                    const err = new Error("Stopped by user.");
                    err.name = "AbortError";
                    throw err;
                }

                if (chunk.usage) usage = chunk.usage;

                const choice = chunk.choices?.[0];
                if (!choice) continue;
                if (choice.finish_reason) finishReason = choice.finish_reason;

                const delta = choice.delta;
                if (delta?.tool_calls) {
                    mergeToolCallDelta(toolCalls, delta.tool_calls);
                }

                if (choice.message?.content && typeof choice.message.content === "string") {
                    const finalContent = choice.message.content;
                    if (finalContent.length > content.length) {
                        const extra = finalContent.slice(content.length);
                        content = finalContent;
                        if (extra) onTextDelta(extra, content);
                    }
                }

                if (delta?.content) {
                    content += delta.content;
                    onTextDelta(delta.content, content);
                }
            }
        } catch (err) {
            if (signal?.aborted || isAbortError(err)) {
                const abortErr = new Error("Stopped by user.");
                abortErr.name = "AbortError";
                abortErr.partialText = content;
                throw abortErr;
            }
            throw err;
        }

        return {
            choices: [
                {
                    message: buildStreamMessage(content, toolCalls),
                    finish_reason: finishReason,
                },
            ],
            usage,
        };
    }

    try {
        const completion = await client.chat.completions.create(
            {
                ...params,
                stream: false,
            },
            requestOptions,
        );
        const payload = completionPayload(completion);
        emitTextOnce(onTextDelta, payload.choices[0]?.message?.content);
        return payload;
    } catch (err) {
        if (signal?.aborted || isAbortError(err)) {
            const abortErr = new Error("Stopped by user.");
            abortErr.name = "AbortError";
            throw abortErr;
        }
        throw err;
    }
}

function emitTextOnce(onTextDelta, content) {
    if (!onTextDelta || !content) return;
    onTextDelta(content, content);
}
