import { fileToolDefinitions, executeFileRead, executeFilePatch } from "../tools/file.js";
import { configToolDefinitions, executeConfigTool } from "../tools/config-tool.js";
import { skillsToolDefinitions, executeSkillsTool } from "../tools/skills.js";
import { terminalToolDefinitions, executeTerminalTool } from "../tools/terminal.js";
import { screenshotToolDefinitions, executeScreenshotCapture } from "../tools/screenshot.js";
import { getMcpToolDefinitions, executeMcpTool } from "../tools/mcp.js";
import { connectMcpServers, disconnectMcpServers } from "../mcp/servers.js";
import { sanitizeTextForLlm } from "../llm/sanitize-messages.js";

export async function initTools() {
    await connectMcpServers();
}

export async function shutdownTools() {
    await disconnectMcpServers();
}

export function getAllToolDefinitions() {
    return [
        ...fileToolDefinitions,
        ...configToolDefinitions,
        ...skillsToolDefinitions,
        ...terminalToolDefinitions,
        ...screenshotToolDefinitions,
        ...getMcpToolDefinitions(),
    ];
}

export async function executeTool(name, args, ctx = {}) {
    try {
        if (name === "file_read") return await executeFileRead(args, ctx);
        if (name === "file_patch") return await executeFilePatch(args, ctx);
        if (name === "config_set") return await executeConfigTool(name, args);
        if (name.startsWith("skills_")) return await executeSkillsTool(name, args);
        if (name === "terminal_run") return await executeTerminalTool(name, args, ctx);
        if (name === "screenshot_capture") return await executeScreenshotCapture(args, ctx);
        if (name === "mcp_reload" || name.startsWith("mcp__")) return await executeMcpTool(name, args);
        return { error: `Unknown tool: ${name}` };
    } catch (err) {
        return { error: err?.message || String(err) };
    }
}

export function toolResultContent(result) {
    return sanitizeTextForLlm(JSON.stringify(result));
}
