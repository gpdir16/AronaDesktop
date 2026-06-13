import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { resolveIndexPath, resolveRouteDirs } from "../shared/paths.js";

const STATIC_HOST = "127.0.0.1";
const STATIC_INDEX_PATH = "/";
const STATIC_CACHE_CONTROL = "no-store";

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".atlas": "text/plain; charset=utf-8",
    ".skel": "application/octet-stream",
};

function isInside(baseDir, candidatePath) {
    const relative = path.relative(baseDir, candidatePath);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeResolve(baseDir, requestPath) {
    const decoded = decodeURIComponent(requestPath);
    const resolved = path.resolve(baseDir, decoded.replace(/^\/+/, ""));
    return isInside(baseDir, resolved) ? resolved : null;
}

async function fileExists(filePath) {
    try {
        const info = await stat(filePath);
        return info.isFile();
    } catch {
        return false;
    }
}

function contentType(filePath) {
    return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

const routes = resolveRouteDirs();
const indexPath = resolveIndexPath();

async function resolveRequest(urlPathname) {
    if (urlPathname === STATIC_INDEX_PATH) {
        return { filePath: indexPath };
    }

    for (const route of routes) {
        if (!urlPathname.startsWith(route.prefix)) continue;

        const relative = urlPathname.slice(route.prefix.length);
        const filePath = safeResolve(route.dir, relative);
        if (filePath && (await fileExists(filePath))) {
            return { filePath };
        }
        return null;
    }

    return null;
}

export function startStaticServer() {
    return new Promise((resolve, reject) => {
        const server = http.createServer(async (request, response) => {
            try {
                const requestUrl = new URL(request.url || "/", `http://${STATIC_HOST}`);
                const resolved = await resolveRequest(requestUrl.pathname);

                if (!resolved) {
                    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
                    response.end("Not found");
                    return;
                }

                response.writeHead(200, {
                    "Content-Type": contentType(resolved.filePath),
                    "Cache-Control": STATIC_CACHE_CONTROL,
                });
                createReadStream(resolved.filePath).pipe(response);
            } catch (error) {
                response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
                response.end(error instanceof Error ? error.message : "Server error");
            }
        });

        server.on("error", reject);
        server.listen(0, STATIC_HOST, () => resolve(server));
    });
}
