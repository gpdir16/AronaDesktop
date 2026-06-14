/** `{NN}`, `{look}`, `{pat}` — first match only for playback. */
const EMOTION_TAG_RE = /\{(\d{2}|look|pat)\}/;

export function findFirstEmotionTag(text) {
    if (!text) return null;
    const match = text.match(EMOTION_TAG_RE);
    return match ? match[1] : null;
}

export function stripEmotionTags(text) {
    if (!text) return "";
    return text.replace(/\{(\d{2}|look|pat)\}/g, "");
}

export function playFirstEmotionTag(text, animator) {
    const tag = findFirstEmotionTag(text);
    if (!tag || !animator) return false;
    animator.handleCommand(tag);
    return true;
}
