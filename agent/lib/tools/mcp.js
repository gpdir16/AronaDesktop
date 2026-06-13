import { getDynamicMcpToolDefinitions, invokeMcpTool, reloadMcpServers } from "../mcp/servers.js";

const mcpReloadToolDefinition = [
    {
        type: "function",
        function: {
            name: "mcp_reload",
            description: "Reload all MCP servers from user/mcp.json (disconnect and reconnect). Call after you edit mcp.json.",
            parameters: { type: "object", properties: {} },
        },
    },
];

export function getMcpToolDefinitions() {
    return [...mcpReloadToolDefinition, ...getDynamicMcpToolDefinitions()];
}

export async function executeMcpTool(name, args) {
    if (name === "mcp_reload") return reloadMcpServers();
    return invokeMcpTool(name, args);
}
