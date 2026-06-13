/**
 * Shared animation catalog helpers (renderer + agent).
 */

export function collectExpressionNames(expressions = []) {
    return expressions.map((clip) => clip?.name).filter(Boolean);
}

export function normalizeAnimationConfig(raw) {
    return {
        ...raw,
        expressionNames: collectExpressionNames(raw.expressions),
    };
}

export function formatAnimationPromptBlock(config) {
    const lines = [
        "Use inline `{name}` tags to change your on-screen expression. Tags are **hidden** from the user.",
        "Blinking and mouth movement while you speak are automatic — **never** tag talk or blink.",
        "",
        "**Usage rules (important)**",
        "- Use expression tags **very actively** — in almost every reply, pick the face or sequence that best matches your tone. Skipping a tag should be rare.",
        "- **Exactly one emotion tag per output** — each assistant message allows **only one** `{name}` or one sequence (`{look}`, `{pat}`). A second tag in the same message is **forbidden**.",
        "- Never stack, list, or showcase multiple tags in one reply (e.g. `{06}` … `{18}` … `{12}`). Choose one.",
        "- Place that single tag where the emotion fits naturally in the sentence.",
        "",
        "**Expressions**",
    ];

    for (const clip of config.expressions ?? []) {
        const label = clip.label ? ` — ${clip.label}` : "";
        lines.push(`- \`{${clip.name}}\`${label}`);
    }

    const seqEntries = Object.entries(config.sequences ?? {});
    if (seqEntries.length) {
        lines.push("", "**Sequences**");
        for (const [key, seq] of seqEntries) {
            const label = seq.label ? ` — ${seq.label}` : "";
            lines.push(`- \`{${key}}\`${label}`);
        }
    }

    lines.push("", 'Example: "알겠어요 {12} 그건 내일 해볼게요." (one tag only)');
    return lines.join("\n");
}
