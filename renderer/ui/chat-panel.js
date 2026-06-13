import { $ } from "/renderer/lib/dom.js";
import { renderMarkdown } from "/renderer/lib/markdown.js";
import { createAnimationStreamHandler, parseAnimationTags } from "/renderer/animation/stream.js";

function getElectronAPI() {
    return window.electronAPI ?? null;
}

export function mountChatPanel(getAnimator) {
    const electronAPI = getElectronAPI();
    const chatMessages = $("chat-messages");
    const chatInput = $("chat-input");
    const chatForm = $("chat-form");

    chatInput.placeholder = "메시지를 입력하세요...";

    let currentAssistantMessage = null;
    let currentAssistantRaw = "";
    let isRunning = false;
    let streamHandler = null;

    function renderMessageContent(element, text, asMarkdown) {
        if (asMarkdown) {
            element.innerHTML = renderMarkdown(text);
        } else {
            element.textContent = text;
        }
    }

    function addChatMessage(text, role) {
        const row = document.createElement("div");
        row.className = `message ${role}`;

        const bubble = document.createElement("div");
        bubble.className = "message-bubble";
        renderMessageContent(bubble, text, role === "assistant");
        row.appendChild(bubble);

        chatMessages.appendChild(row);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return bubble;
    }

    function setAssistantContent(text) {
        if (!currentAssistantMessage) return;
        currentAssistantRaw = text;
        renderMessageContent(currentAssistantMessage, text, true);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function appendToAssistantMessage(text) {
        if (!currentAssistantMessage || !text) return;
        setAssistantContent(currentAssistantRaw + text);
    }

    function setInputEnabled(enabled) {
        chatInput.disabled = !enabled;
    }

    function beginAssistantReply() {
        if (isRunning) return;
        currentAssistantRaw = "";
        currentAssistantMessage = addChatMessage("", "assistant");
        streamHandler = createAnimationStreamHandler(getAnimator());
        isRunning = true;
        setInputEnabled(false);
        getAnimator()?.startTalking();
    }

    function finishAssistantReply() {
        if (streamHandler) {
            const tail = streamHandler.flush();
            if (tail) appendToAssistantMessage(tail);
            streamHandler = null;
        }

        isRunning = false;
        setInputEnabled(true);
        getAnimator()?.onResponseEnd();
        currentAssistantMessage = null;
        currentAssistantRaw = "";
        chatInput.focus();
    }

    async function sendChatMessage() {
        if (!electronAPI) return;

        const text = chatInput.value.trim();
        if (!text || isRunning) return;

        chatInput.value = "";
        addChatMessage(text, "user");
        beginAssistantReply();

        try {
            const result = await electronAPI.sendMessage(text);
            if (result?.error) {
                addChatMessage(`Error: ${result.error}`, "system");
                finishAssistantReply();
            }
        } catch (err) {
            addChatMessage(`Error: ${err.message || err}`, "system");
            finishAssistantReply();
        }
    }

    chatForm.addEventListener("submit", (event) => {
        event.preventDefault();
        sendChatMessage();
    });

    if (!electronAPI) {
        setInputEnabled(false);
        return;
    }

    electronAPI.onAgentDelta((data) => {
        if (data?.done) {
            if (data.text && currentAssistantMessage && !currentAssistantRaw) {
                const visible = parseAnimationTags(data.text, getAnimator());
                setAssistantContent(visible);
            }
            if (data.error) {
                addChatMessage(`Error: ${data.error}`, "system");
            }
            finishAssistantReply();
            return;
        }

        if (!data?.delta) return;

        if (!isRunning) {
            beginAssistantReply();
        }

        if (!streamHandler) {
            streamHandler = createAnimationStreamHandler(getAnimator());
        }

        const visible = streamHandler.feed(data.delta);
        appendToAssistantMessage(visible);
    });
}
