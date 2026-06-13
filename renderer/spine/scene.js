import { spine } from "/renderer/vendor/spine-webgl.js";
import { AronaAnimator } from "/renderer/animation/animator.js";
import { loadAnimationConfig } from "/renderer/animation/load.js";

export class SpineScene {
    constructor(elements) {
        this.canvas = elements.canvas;
        this.onAnimatorReady = elements.onAnimatorReady;
        this.atlasPath = "/assets/arona_spr.atlas";
        this.skelPath = "/assets/arona_spr.skel";

        this.gl = null;
        this.shader = null;
        this.batcher = null;
        this.skeletonRenderer = null;
        this.assetManager = null;
        this.mvp = null;
        this.skeleton = null;
        this.animationState = null;
        this.animationStateData = null;
        this.bounds = null;
        this.camera = null;
        this.hitBounds = null;
        this.animator = null;
        this.lastFrameTime = 0;
        this.onAfterRender = null;
    }

    calculateSetupPoseBounds(loadedSkeleton) {
        loadedSkeleton.setToSetupPose();
        loadedSkeleton.updateWorldTransform();
        const offset = new spine.Vector2();
        const size = new spine.Vector2();
        loadedSkeleton.getBounds(offset, size, []);
        return { offset, size };
    }

    resizeCanvas() {
        if (!this.canvas || !this.bounds) return;

        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }

        const centerX = this.bounds.offset.x + this.bounds.size.x / 2;
        const centerY = this.bounds.offset.y + this.bounds.size.y / 2;
        const scaleX = this.bounds.size.x / this.canvas.width;
        const scaleY = this.bounds.size.y / this.canvas.height;
        const scale = Math.max(scaleX, scaleY);
        const viewWidth = this.canvas.width * Math.max(scale, 1);
        const viewHeight = this.canvas.height * Math.max(scale, 1);
        const left = centerX - viewWidth / 2;
        const bottom = centerY - viewHeight / 2;

        this.camera = { left, right: left + viewWidth, bottom, top: bottom + viewHeight };
        this.mvp.ortho2d(left, bottom, viewWidth, viewHeight);
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    clientToWorld(clientX, clientY) {
        if (!this.canvas || !this.camera) return null;

        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;

        const u = (clientX - rect.left) / rect.width;
        const v = (clientY - rect.top) / rect.height;
        const { left, right, bottom, top } = this.camera;

        return {
            x: left + u * (right - left),
            y: top - v * (top - bottom),
        };
    }

    isInCharacterBounds(clientX, clientY) {
        if (!this.hitBounds) return false;

        const world = this.clientToWorld(clientX, clientY);
        if (!world) return false;

        const { offset, size } = this.hitBounds;
        const pad = Math.max(size.x, size.y) * 0.02;

        return world.x >= offset.x - pad && world.x <= offset.x + size.x + pad && world.y >= offset.y - pad && world.y <= offset.y + size.y + pad;
    }

    getMaxAlphaAround(clientX, clientY, radiusPx = 2) {
        const offsets = [
            [0, 0],
            [radiusPx, 0],
            [-radiusPx, 0],
            [0, radiusPx],
            [0, -radiusPx],
        ];

        let max = 0;
        for (const [dx, dy] of offsets) {
            max = Math.max(max, this.getAlphaAt(clientX + dx, clientY + dy));
        }
        return max;
    }

    isOverCharacter(clientX, clientY, alphaThreshold = 12) {
        if (!this.isInCharacterBounds(clientX, clientY)) return false;
        return this.getMaxAlphaAround(clientX, clientY) >= alphaThreshold;
    }

    updateHitBounds() {
        if (!this.skeleton) return;

        const offset = new spine.Vector2();
        const size = new spine.Vector2();
        this.skeleton.getBounds(offset, size, []);
        this.hitBounds = {
            offset: { x: offset.x, y: offset.y },
            size: { x: size.x, y: size.y },
        };
    }

    worldToClient(worldX, worldY) {
        if (!this.canvas || !this.camera) return null;

        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;

        const { left, right, bottom, top } = this.camera;
        const u = (worldX - left) / (right - left);
        const v = (top - worldY) / (top - bottom);

        return {
            x: rect.left + u * rect.width,
            y: rect.top + v * rect.height,
        };
    }

    getCharacterClientRect() {
        if (!this.hitBounds) return null;

        const { offset, size } = this.hitBounds;
        const topLeft = this.worldToClient(offset.x, offset.y + size.y);
        const bottomRight = this.worldToClient(offset.x + size.x, offset.y);
        if (!topLeft || !bottomRight) return null;

        const x = Math.min(topLeft.x, bottomRight.x);
        const y = Math.min(topLeft.y, bottomRight.y);
        const width = Math.abs(bottomRight.x - topLeft.x);
        const height = Math.abs(bottomRight.y - topLeft.y);

        if (width <= 0 || height <= 0) return null;

        return { x, y, width, height };
    }

    getAlphaAt(clientX, clientY) {
        if (!this.gl || !this.canvas) return 0;

        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return 0;

        const x = Math.min(this.canvas.width - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * this.canvas.width)));
        const y = Math.min(this.canvas.height - 1, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * this.canvas.height)));
        const glY = this.canvas.height - y - 1;
        const pixel = new Uint8Array(4);

        this.gl.readPixels(x, glY, 1, 1, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixel);
        return pixel[3];
    }

    renderFrame = (now) => {
        const delta = Math.min((now - this.lastFrameTime) / 1000, 0.1);
        this.lastFrameTime = now;

        this.resizeCanvas();

        this.gl.clearColor(0, 0, 0, 0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        this.animationState.update(delta);
        this.animationState.apply(this.skeleton);
        this.skeleton.updateWorldTransform();
        this.updateHitBounds();

        this.shader.bind();
        this.shader.setUniformi(spine.webgl.Shader.SAMPLER, 0);
        this.shader.setUniform4x4f(spine.webgl.Shader.MVP_MATRIX, this.mvp.values);

        this.batcher.begin(this.shader);
        this.skeletonRenderer.premultipliedAlpha = false;
        this.skeletonRenderer.draw(this.batcher, this.skeleton);
        this.batcher.end();
        this.shader.unbind();

        this.onAfterRender?.();

        requestAnimationFrame(this.renderFrame);
    };

    async waitForAssets() {
        return new Promise((resolve, reject) => {
            const check = () => {
                if (this.assetManager.isLoadingComplete()) {
                    resolve();
                    return;
                }

                if (this.assetManager.hasErrors()) {
                    reject(new Error(this.assetManager.getErrors().join(", ")));
                    return;
                }

                requestAnimationFrame(check);
            };

            check();
        });
    }

    async createSkeleton() {
        const animationConfig = await loadAnimationConfig();
        const atlas = this.assetManager.get(this.atlasPath);
        const atlasLoader = new spine.AtlasAttachmentLoader(atlas);
        const skeletonBinary = new spine.SkeletonBinary(atlasLoader);
        const skeletonData = skeletonBinary.readSkeletonData(this.assetManager.get(this.skelPath));

        const availableAnimations = new Set(skeletonData.animations.map((anim) => anim.name));

        this.skeleton = new spine.Skeleton(skeletonData);
        this.bounds = this.calculateSetupPoseBounds(this.skeleton);
        this.animationStateData = new spine.AnimationStateData(this.skeleton.data);
        this.animationState = new spine.AnimationState(this.animationStateData);
        this.animator = new AronaAnimator(this.animationState, this.animationStateData, availableAnimations, animationConfig);
        this.onAnimatorReady(this.animator);
    }

    async boot() {
        const webgl = { alpha: true, antialias: true, preserveDrawingBuffer: true };
        this.gl = this.canvas.getContext("webgl", webgl) || this.canvas.getContext("experimental-webgl", webgl);
        if (!this.gl) {
            throw new Error("WebGL을 사용할 수 없습니다.");
        }

        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

        this.shader = spine.webgl.Shader.newTwoColoredTextured(this.gl);
        this.batcher = new spine.webgl.PolygonBatcher(this.gl);
        this.mvp = new spine.webgl.Matrix4();
        this.skeletonRenderer = new spine.webgl.SkeletonRenderer(this.gl);
        this.assetManager = new spine.webgl.AssetManager(this.gl);

        this.assetManager.loadBinary(this.skelPath);
        this.assetManager.loadTextureAtlas(this.atlasPath);

        await this.waitForAssets();

        await this.createSkeleton();
        window.addEventListener("resize", () => this.resizeCanvas());

        this.lastFrameTime = performance.now();
        requestAnimationFrame(this.renderFrame);
    }
}
