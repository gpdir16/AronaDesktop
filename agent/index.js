import { ensureUserDir } from "./lib/bootstrap.js";
import { initTools, shutdownTools } from "./lib/agent/tool-registry.js";
import { runAgent } from "./lib/agent/loop.js";
import { beginAgentSession, endAgentSession } from "./lib/agent/session.js";
import { appendChatTurn } from "./lib/agent/chat-history.js";

let initialized = false;

export async function initAgent() {
    if (initialized) return;
    ensureUserDir();
    await initTools();
    initialized = true;
}

export async function shutdownAgent() {
    await shutdownTools();
    initialized = false;
}

export async function sendMessage(message, options = {}) {
    if (!initialized) await initAgent();

    const sessionId = options.sessionId || "desktop";
    const session = beginAgentSession(sessionId);

    try {
        const result = await runAgent(message, {
            sessionId,
            onTextDelta: options.onTextDelta,
            onTextSync: options.onTextSync,
            onSegmentStart: options.onSegmentStart,
            onStatusPhase: options.onStatusPhase,
            session,
        });

        if (result.turnMessages?.length) {
            appendChatTurn(sessionId, result.turnMessages);
        }

        return result;
    } finally {
        endAgentSession(sessionId);
    }
}
