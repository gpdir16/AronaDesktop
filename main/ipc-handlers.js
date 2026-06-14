import { BrowserWindow, ipcMain } from "electron";
import { createRequire } from "node:module";
import { sendMessage } from "../agent/index.js";

const { IPC_CHANNELS } = createRequire(import.meta.url)("../shared/ipc-channels.cjs");

function getPrimaryWindow() {
    return BrowserWindow.getAllWindows()[0] ?? null;
}

export function registerIpcHandlers() {
    ipcMain.handle(IPC_CHANNELS.sendMessage, async (_event, message) => {
        const window = getPrimaryWindow();

        try {
            const result = await sendMessage(message, {
                onTextDelta: (delta, full) => {
                    if (window && !window.isDestroyed()) {
                        window.webContents.send(IPC_CHANNELS.textDelta, { delta, full });
                    }
                },
                onTextSync: (full) => {
                    if (window && !window.isDestroyed()) {
                        window.webContents.send(IPC_CHANNELS.textDelta, { sync: true, full });
                    }
                },
                onSegmentStart: () => {
                    if (window && !window.isDestroyed()) {
                        window.webContents.send(IPC_CHANNELS.textDelta, { segmentStart: true });
                    }
                },
            });

            if (window && !window.isDestroyed()) {
                window.webContents.send(IPC_CHANNELS.textDelta, { done: true, text: result?.text ?? null });
            }

            return result;
        } catch (error) {
            if (window && !window.isDestroyed()) {
                window.webContents.send(IPC_CHANNELS.textDelta, {
                    done: true,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
            throw error;
        }
    });

    ipcMain.handle(IPC_CHANNELS.getWindowPosition, (event) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (!window || window.isDestroyed()) return { x: 0, y: 0 };
        const [x, y] = window.getPosition();
        return { x, y };
    });

    ipcMain.on(IPC_CHANNELS.moveWindow, (event, { x, y }) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (!window || window.isDestroyed()) return;
        window.setPosition(Math.round(x), Math.round(y));
    });
}
