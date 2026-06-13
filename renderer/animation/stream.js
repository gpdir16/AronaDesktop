/** Strip `{name}` tags from text without playing animations. */
export function stripAnimationTags(text) {
    const handler = createAnimationStreamHandler(null);
    const visible = handler.feed(text);
    return visible + handler.flush();
}

/** Strip tags and play at most the first animation tag (one per reply). */
export function parseAnimationTags(text, animator) {
    const handler = createAnimationStreamHandler(animator);
    const visible = handler.feed(text);
    return visible + handler.flush();
}

/** Strip `{name}` animation tags from streamed text; invoke animator for the first tag only. */
export function createAnimationStreamHandler(animator) {
    let pending = "";
    let tagUsed = false;

    function feed(chunk) {
        const input = pending + chunk;
        pending = "";
        let visible = "";
        let index = 0;

        while (index < input.length) {
            const open = input.indexOf("{", index);
            if (open === -1) {
                visible += input.slice(index);
                break;
            }

            visible += input.slice(index, open);
            const close = input.indexOf("}", open + 1);
            if (close === -1) {
                pending = input.slice(open);
                break;
            }

            if (animator && !tagUsed) {
                const name = input.slice(open + 1, close);
                animator.handleCommand(name);
                tagUsed = true;
            }

            index = close + 1;
        }

        return visible;
    }

    function flush() {
        const tail = pending;
        pending = "";
        return tail;
    }

    return { feed, flush };
}
