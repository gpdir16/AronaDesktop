// Keep in sync with shared/ipc-channels.cjs
const IPC_CHANNELS = {
    sendMessage: "agent:sendMessage",
    textDelta: "agent:textDelta",
    getWindowPosition: "window:getPosition",
    moveWindow: "window:move",
};

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    sendMessage: (message) => ipcRenderer.invoke(IPC_CHANNELS.sendMessage, message),
    onAgentDelta: (callback) => ipcRenderer.on(IPC_CHANNELS.textDelta, (_event, value) => callback(value)),
    getWindowPosition: () => ipcRenderer.invoke(IPC_CHANNELS.getWindowPosition),
    moveWindow: (x, y) => ipcRenderer.send(IPC_CHANNELS.moveWindow, { x, y }),
});
