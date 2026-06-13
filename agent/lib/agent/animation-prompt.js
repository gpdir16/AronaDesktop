import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatAnimationPromptBlock } from "../../../shared/animation-catalog.js";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ANIMATIONS_PATH = path.join(APP_ROOT, "renderer", "animation", "animations.json");

let cachedBlock = null;

export function buildAnimationPromptBlock() {
    if (cachedBlock) return cachedBlock;

    const config = JSON.parse(fs.readFileSync(ANIMATIONS_PATH, "utf8"));
    cachedBlock = formatAnimationPromptBlock(config);
    return cachedBlock;
}
