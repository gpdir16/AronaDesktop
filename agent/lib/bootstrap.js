import fs from "node:fs";
import path from "node:path";
import { USER_DIR, DOWNLOAD_DIR, TEMPLATES_USER_DIR, WORKSPACE_DIR, isWorkspaceEnabled } from "./paths.js";
function copyDirRecursive(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

/** Copy missing files/dirs from codes/templates/user — sole default source in the repo. */
function seedUserFromTemplates() {
    if (!fs.existsSync(TEMPLATES_USER_DIR)) return;

    for (const entry of fs.readdirSync(TEMPLATES_USER_DIR, { withFileTypes: true })) {
        const srcPath = path.join(TEMPLATES_USER_DIR, entry.name);
        const destPath = path.join(USER_DIR, entry.name);
        if (fs.existsSync(destPath)) continue;

        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

export function ensureUserDir() {
    fs.mkdirSync(USER_DIR, { recursive: true });
    fs.mkdirSync(path.join(USER_DIR, "skills"), { recursive: true });
    fs.mkdirSync(path.join(USER_DIR, "temp"), { recursive: true });
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

    seedUserFromTemplates();

    const mcpPath = path.join(USER_DIR, "mcp.json");
    if (!fs.existsSync(mcpPath)) {
        fs.writeFileSync(mcpPath, '{\n  "servers": []\n}\n', "utf8");
    }

    if (isWorkspaceEnabled()) {
        console.log(`arona: workspace enabled at ${WORKSPACE_DIR}`);
    }
}
