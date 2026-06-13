/**
 * Renders codes/lib/prompts/system.txt by replacing {{PLACEHOLDER}} tokens.
 *
 * Placeholders:
 *   {{LOCAL_DATETIME}} — current local time (container TZ)
 *   {{UTC_DATETIME}}   — current UTC time
 *   {{ISO_UTC}}        — ISO 8601 UTC timestamp
 *   {{TIMEZONE}}       — active time zone name
 *   {{ANIMATION_BLOCK}} — face/sequence tags the model may emit as {name}
 *   {{SKILLS_LIST}}    — built-in + user skill names and summaries
 *   {{MEMORY}}         — memory.md contents (may be truncated)
 *   {{FILESYSTEM_BLOCK}} — agent home vs workspace map (always present)
 */

import { USER_DIR, WORKSPACE_DIR, isWorkspaceEnabled } from "../paths.js";

const PLACEHOLDER_RE = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

export function renderSystemPrompt(template, vars) {
    return template.replace(PLACEHOLDER_RE, (match, key) => {
        if (!Object.prototype.hasOwnProperty.call(vars, key)) {
            console.warn(`arona: unknown system prompt placeholder ${match}`);
            return match;
        }
        const value = vars[key];
        return value == null ? "" : String(value);
    });
}

function localeForLanguage(lang) {
    if (lang === "ko") return "ko-KR";
    if (lang === "ja") return "ja-JP";
    return "en-US";
}

/** Filesystem explanation for desktop environment. */
export function buildFilesystemPromptBlock() {
    const lines = [
        "### Filesystem map",
        "",
        `| Path | Role |`,
        `|------|------|`,
        `| \`${USER_DIR}\` | **Main home.** \`config.json\`, \`memory.md\`, \`skills/\`, \`mcp.json\`, \`download/\`, chat temp, and **most work**. Default \`terminal_run\` cwd. Relative \`file_*\` paths resolve here. |`,
        `| \`/tmp\` | Ephemeral scratch space. |`,
    ];

    if (isWorkspaceEnabled()) {
        lines.push(
            `| \`${WORKSPACE_DIR}\` | **Workspace folder** — use when working on local projects. Paths: \`workspace/...\` or \`${WORKSPACE_DIR}/...\`. |`,
        );
    }

    return lines.join("\n");
}

export function buildDateTimePromptVars(lang = "en") {
    const now = new Date();
    const timeZone = (typeof process.env.TZ === "string" && process.env.TZ.trim()) || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const locale = localeForLanguage(lang);
    const localFormatted = new Intl.DateTimeFormat(locale, {
        dateStyle: "full",
        timeStyle: "long",
        timeZone,
    }).format(now);
    const utcFormatted = new Intl.DateTimeFormat("en-US", {
        dateStyle: "full",
        timeStyle: "long",
        timeZone: "UTC",
    }).format(now);

    return {
        LOCAL_DATETIME: localFormatted,
        UTC_DATETIME: utcFormatted,
        ISO_UTC: now.toISOString(),
        TIMEZONE: timeZone,
    };
}
