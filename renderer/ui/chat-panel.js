import { $ } from "/renderer/lib/dom.js";
import { renderMarkdown } from "/renderer/lib/markdown.js";
import { playFirstEmotionTag, stripEmotionTags } from "/renderer/animation/stream.js";

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
    let segmentTagPlayed = false;

    function resetSegmentTagState() {
        segmentTagPlayed = false;
    }

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

    function tryPlayEmotionTag(text) {
        if (segmentTagPlayed || !text) return;
        if (playFirstEmotionTag(text, getAnimator())) {
            segmentTagPlayed = true;
        }
    }

    function renderAssistantFromFull(full) {
        if (!currentAssistantMessage || full == null) return;
        tryPlayEmotionTag(full);
        setAssistantContent(stripEmotionTags(full));
    }

    function setInputEnabled(enabled) {
        chatInput.disabled = !enabled;
    }

    function removeCurrentAssistantBubbleIfEmpty() {
        if (!currentAssistantMessage || currentAssistantRaw.trim()) return;
        currentAssistantMessage.parentElement?.remove();
        currentAssistantMessage = null;
        currentAssistantRaw = "";
    }

    function beginNewAssistantSegment() {
        if (currentAssistantMessage && !currentAssistantRaw.trim()) {
            currentAssistantMessage.parentElement?.remove();
        }

        resetSegmentTagState();
        currentAssistantRaw = "";
        currentAssistantMessage = addChatMessage("", "assistant");
    }

    function beginAssistantReply() {
        if (isRunning) return;
        resetSegmentTagState();
        currentAssistantRaw = "";
        currentAssistantMessage = addChatMessage("", "assistant");
        isRunning = true;
        setInputEnabled(false);
        getAnimator()?.startTalking();
    }

    function finishAssistantReply() {
        removeCurrentAssistantBubbleIfEmpty();

        isRunning = false;
        resetSegmentTagState();
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
        if (data?.segmentStart) {
            if (!isRunning) {
                beginAssistantReply();
            } else {
                beginNewAssistantSegment();
            }
            return;
        }

        const full = data?.full;
        if (full != null) {
            if (!isRunning) {
                beginAssistantReply();
            }
            renderAssistantFromFull(full);
        }

        if (data?.sync) return;

        if (data?.done) {
            if (data.text && currentAssistantMessage) {
                renderAssistantFromFull(data.text);
            }
            if (data.error) {
                addChatMessage(`Error: ${data.error}`, "system");
            }
            finishAssistantReply();
            return;
        }
    });
}
