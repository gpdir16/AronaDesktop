import { BrowserWindow, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mainDir = path.dirname(fileURLToPath(import.meta.url));

function isDevToolsShortcut(input) {
    if (input.type !== "keyDown") return false;
    const key = String(input.key || "").toLowerCase();
    return key === "f12" || (input.control && input.shift && key === "i") || (input.meta && input.alt && key === "i");
}

function registerDevToolsPopup(window) {
    window.webContents.on("before-input-event", (event, input) => {
        if (!isDevToolsShortcut(input)) return;

        event.preventDefault();
        if (window.webContents.isDevToolsOpened()) {
            window.webContents.closeDevTools();
            return;
        }
        window.webContents.openDevTools({ mode: "detach" });
    });
}

export async function createMainWindow(staticServer) {
    const address = staticServer.address();
    const port = typeof address === "object" && address ? address.port : 0;

    const window = new BrowserWindow({
        width: 360,
        height: 640,
        minWidth: 320,
        minHeight: 480,
        frame: false,
        transparent: true,
        hasShadow: false,
        backgroundColor: "#00000000",
        title: "AronaDesktop",
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            preload: path.join(mainDir, "..", "preload.cjs"),
        },
    });

    registerDevToolsPopup(window);

    window.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: "deny" };
    });

    window.webContents.on("console-message", (_event, level, message) => {
        const prefix = level === 0 ? "[VERBOSE]" : level === 1 ? "[INFO]" : level === 2 ? "[WARN]" : "[ERROR]";
        console.log(`${prefix} ${message}`);
    });

    await window.loadURL(`http://127.0.0.1:${port}/`);
    return window;
}
