"use strict";

const IPC_CHANNELS = {
    sendMessage: "agent:sendMessage",
    textDelta: "agent:textDelta",
    getWindowPosition: "window:getPosition",
    moveWindow: "window:move",
};

module.exports = { IPC_CHANNELS };
