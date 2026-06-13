import { $ } from "/renderer/lib/dom.js";
import { SpineScene } from "/renderer/spine/scene.js";
import { mountChatPanel } from "/renderer/ui/chat-panel.js";
import { mountWindowInteraction } from "/renderer/window-interaction.js";

async function boot() {
    document.title = "AronaDesktop";

    let animator = null;

    const scene = new SpineScene({
        canvas: $("scene-canvas"),
        onAnimatorReady: (readyAnimator) => {
            animator = readyAnimator;
        },
    });

    try {
        await scene.boot();
    } catch (error) {
        console.error(error);
        return;
    }

    mountWindowInteraction(scene);
    mountChatPanel(() => animator);
}

boot().catch(console.error);
