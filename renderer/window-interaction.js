function getElectronAPI() {
    return window.electronAPI ?? null;
}

function blocksDrag(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest(".conversation-compose, .message-bubble"));
}

export function mountWindowInteraction(scene) {
    const electronAPI = getElectronAPI();
    if (!electronAPI?.moveWindow) return;

    const canvas = scene.canvas;
    let dragging = false;
    let dragOrigin = null;

    function setCursor(value) {
        document.body.style.cursor = value;
        canvas.style.cursor = value;
    }

    function updateCursor(target) {
        if (dragging) {
            setCursor("grabbing");
            return;
        }
        setCursor(blocksDrag(target) ? "" : "grab");
    }

    window.addEventListener(
        "mousemove",
        (event) => {
            if (dragging && dragOrigin) {
                const dx = event.screenX - dragOrigin.screenX;
                const dy = event.screenY - dragOrigin.screenY;
                electronAPI.moveWindow(dragOrigin.winX + dx, dragOrigin.winY + dy);
                return;
            }

            updateCursor(event.target);
        },
        { passive: true },
    );

    window.addEventListener("mousedown", async (event) => {
        if (event.button !== 0) return;
        if (blocksDrag(event.target)) return;

        event.preventDefault();
        const position = await electronAPI.getWindowPosition();
        dragOrigin = {
            screenX: event.screenX,
            screenY: event.screenY,
            winX: position.x,
            winY: position.y,
        };
        dragging = true;
        updateCursor(event.target);
    });

    window.addEventListener("mouseup", (event) => {
        dragging = false;
        dragOrigin = null;
        updateCursor(event.target);
    });

    window.addEventListener("blur", () => {
        dragging = false;
        dragOrigin = null;
        setCursor("");
    });
}
