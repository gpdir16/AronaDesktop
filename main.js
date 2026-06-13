import { app, BrowserWindow, Menu } from "electron";
import { initAgent, shutdownAgent } from "./agent/index.js";
import { registerIpcHandlers } from "./main/ipc-handlers.js";
import { startStaticServer } from "./main/static-server.js";
import { createMainWindow } from "./main/window.js";

let staticServer;

async function ensureStaticServer() {
    if (staticServer?.listening) {
        return staticServer;
    }

    staticServer = await startStaticServer();
    return staticServer;
}

app.whenReady()
    .then(async () => {
        await initAgent();
        registerIpcHandlers();
        Menu.setApplicationMenu(null);

        const server = await ensureStaticServer();
        await createMainWindow(server);
    })
    .catch((error) => {
        console.error("Failed to start application:", error);
        app.exit(1);
    });

app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        const server = await ensureStaticServer();
        await createMainWindow(server);
    }
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("before-quit", async () => {
    if (staticServer) {
        staticServer.close();
    }
    await shutdownAgent();
});
