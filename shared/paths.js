import path from "node:path";
import { fileURLToPath } from "node:url";

const STATIC_ROUTES = [
    { prefix: "/renderer/", dir: "renderer" },
    { prefix: "/assets/", dir: "assets" },
    { prefix: "/shared/", dir: "shared" },
];

const INDEX_FILE = "renderer/index.html";

export function getAppRoot() {
    return fileURLToPath(new URL("../", import.meta.url));
}

export function resolveAppPath(...segments) {
    return path.join(getAppRoot(), ...segments);
}

export function resolveRouteDirs() {
    const root = getAppRoot();
    return STATIC_ROUTES.map((route) => ({
        prefix: route.prefix,
        dir: path.join(root, route.dir),
    }));
}

export function resolveIndexPath() {
    return path.join(getAppRoot(), INDEX_FILE);
}
