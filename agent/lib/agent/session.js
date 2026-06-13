/** Per-session active agent turn: stop signal. */

export const STOP_BY_USER_HINT = "Stop immediately. Do not call more tools. Reply briefly with progress and what remains.";

const sessions = new Map();

export class AgentSession {
    constructor(sessionId) {
        this.sessionId = String(sessionId);
        this.abortController = new AbortController();
        this.running = true;
    }

    get signal() {
        return this.abortController.signal;
    }

    isAborted() {
        return this.signal.aborted;
    }
}

export function beginAgentSession(sessionId) {
    const key = String(sessionId);
    const session = new AgentSession(key);
    sessions.set(key, session);
    return session;
}

export function endAgentSession(sessionId) {
    sessions.delete(String(sessionId));
}
