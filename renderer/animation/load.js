import { normalizeAnimationConfig } from "/shared/animation-catalog.js";

let cachedConfig = null;

export async function loadAnimationConfig() {
    if (cachedConfig) {
        return cachedConfig;
    }

    const response = await fetch("/renderer/animation/animations.json");
    if (!response.ok) {
        throw new Error(`Failed to load animations.json: ${response.status}`);
    }

    cachedConfig = normalizeAnimationConfig(await response.json());
    return cachedConfig;
}
