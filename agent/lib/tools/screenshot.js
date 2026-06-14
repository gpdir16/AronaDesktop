import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { USER_DIR } from "../paths.js";

const execFileAsync = promisify(execFile);

function screenshotDir() {
    const dir = path.join(USER_DIR, "temp", "screenshots");
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function nextScreenshotPath() {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return path.join(screenshotDir(), `screenshot-${stamp}.png`);
}

async function captureScreenToFile(outPath, { signal } = {}) {
    if (process.platform === "darwin") {
        await execFileAsync("screencapture", ["-x", "-m", outPath], { signal });
        return;
    }

    if (process.platform === "linux") {
        try {
            await execFileAsync("import", ["-window", "root", outPath], { signal });
            return;
        } catch {
            await execFileAsync("gnome-screenshot", ["-f", outPath], { signal });
            return;
        }
    }

    if (process.platform === "win32") {
        const ps =
            `Add-Type -AssemblyName System.Windows.Forms; ` +
            `[void][Reflection.Assembly]::LoadWithPartialName('System.Drawing'); ` +
            `$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; ` +
            `$bmp=New-Object Drawing.Bitmap $b.Width,$b.Height; ` +
            `$g=[Drawing.Graphics]::FromImage($bmp); ` +
            `$g.CopyFromScreen($b.Location,[Drawing.Point]::Empty,$b.Size); ` +
            `$bmp.Save('${outPath.replace(/'/g, "''")}'); ` +
            `$g.Dispose(); $bmp.Dispose()`;
        await execFileAsync("powershell", ["-NoProfile", "-Command", ps], { signal });
        return;
    }

    throw new Error(`Screen capture is not supported on ${process.platform}`);
}

export const screenshotToolDefinitions = [
    {
        type: "function",
        function: {
            name: "screenshot_capture",
            description:
                "Capture the main display for vision analysis on the next step. Use proactively whenever seeing the screen would help — do not wait for the user to ask. Requires a vision-capable model.",
            parameters: {
                type: "object",
                properties: {},
            },
        },
    },
];

export async function executeScreenshotCapture(_args, { modelMeta, signal } = {}) {
    if (!modelMeta?.supportsVision) {
        return {
            error: "Current model does not support vision. Use a vision-capable model in config.json.",
        };
    }

    const outPath = nextScreenshotPath();

    try {
        await captureScreenToFile(outPath, { signal });
    } catch (err) {
        if (signal?.aborted || err?.name === "AbortError") {
            return { ok: false, aborted: true, error: "Stopped by user." };
        }
        return { error: err?.message || String(err) };
    }

    if (!fs.existsSync(outPath)) {
        return { error: "Screenshot file was not created" };
    }

    const stat = fs.statSync(outPath);
    return {
        ok: true,
        path: outPath,
        mimeType: "image/png",
        bytes: stat.size,
        visionImage: { path: outPath, mimeType: "image/png" },
        visionCaption: "Desktop screenshot:",
    };
}
