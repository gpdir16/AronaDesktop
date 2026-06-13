export class AronaAnimator {
    constructor(animationState, animationStateData, availableAnimations, config) {
        this.state = animationState;
        this.data = animationStateData;
        this.available = availableAnimations;
        this.config = config;
        this.isTalking = false;
        this.blinkTimer = null;
        this.idleResetTimer = null;
        this.sequenceTimer = null;
        this.activeSequenceKey = null;
        this.activeExpression = null;
        this.expressionPlaying = false;
        this.talkStartTimer = null;

        this.expressionSet = new Set(config.expressionNames ?? []);
        this.sequenceStartClips = new Set();
        this.sequenceEndClips = new Set();
        for (const seq of Object.values(config.sequences ?? {})) {
            if (seq.start?.overlay) this.sequenceStartClips.add(seq.start.overlay);
            if (seq.end?.overlay) this.sequenceEndClips.add(seq.end.overlay);
        }

        this.setupMixing();
        this.bindListeners();
        this.startIdle();
        this.scheduleBlink();
    }

    get overlayTrack() {
        return this.config.tracks.overlay;
    }

    get faceTrack() {
        return this.config.tracks.face;
    }

    get moveTrack() {
        return this.config.tracks.move;
    }

    get mixDuration() {
        return this.config.mixDuration;
    }

    setupMixing() {
        for (const from of this.available) {
            for (const to of this.available) {
                this.data.setMix(from, to, this.mixDuration);
            }
        }
    }

    bindListeners() {
        const blinkName = this.config.blink.name;
        const idleFace = this.config.idle.face;

        this.state.addListener({
            complete: (entry) => {
                const animName = entry.animation?.name;
                if (!animName) return;

                if (entry.trackIndex === this.faceTrack) {
                    if (this.expressionSet.has(animName) && animName !== idleFace) {
                        this.onExpressionComplete(entry);
                    }
                    return;
                }

                if (this.isTalking) return;

                if (entry.trackIndex === this.overlayTrack) {
                    if (animName === blinkName) {
                        this.state.setEmptyAnimation(this.overlayTrack, this.mixDuration);
                        this.scheduleBlink();
                        return;
                    }

                    if (this.activeSequenceKey && this.sequenceStartClips.has(animName)) {
                        this.scheduleSequenceEnd(this.activeSequenceKey);
                        return;
                    }

                    if (this.sequenceEndClips.has(animName)) {
                        this.clearSequence();
                        this.state.setEmptyAnimation(this.overlayTrack, this.mixDuration);
                        this.state.setEmptyAnimation(this.moveTrack, this.mixDuration);
                        this.scheduleBlink();
                    }
                }
            },
        });
    }

    freezeFaceEntry(entry) {
        entry.trackTime = entry.animationEnd;
        entry.animationLast = entry.animationEnd;
        entry.timeScale = 0;
        entry.trackEnd = Number.MAX_VALUE;
    }

    onExpressionComplete(entry) {
        this.expressionPlaying = false;
        this.freezeFaceEntry(entry);
        if (this.isTalking) {
            this.startTalkOverlay();
        }
    }

    clearTalkStartTimer() {
        clearTimeout(this.talkStartTimer);
        this.talkStartTimer = null;
    }

    startTalkOverlay() {
        const talkName = this.config.talk.name;
        if (!this.isTalking || !this.hasAnim(talkName)) return;

        this.state.setAnimation(this.overlayTrack, talkName, true);
    }

    hasAnim(name) {
        return this.available.has(name);
    }

    startIdle() {
        const { tracks, idle } = this.config;

        if (this.hasAnim(idle.body)) {
            this.state.setAnimation(tracks.body, idle.body, true);
        }
        this.resetFaceToIdle();
    }

    resetFaceToIdle() {
        const face = this.config.idle.face;
        if (!this.hasAnim(face)) return;

        this.activeExpression = null;
        this.expressionPlaying = false;
        const entry = this.state.setAnimation(this.faceTrack, face, true);
        if (entry) entry.timeScale = 1;
    }

    clearIdleReset() {
        clearTimeout(this.idleResetTimer);
        this.idleResetTimer = null;
    }

    scheduleIdleReset() {
        this.clearIdleReset();
        const delay = this.config.idle.resetAfterMs ?? 2500;
        this.idleResetTimer = setTimeout(() => this.resetFaceToIdle(), delay);
    }

    clearSequence() {
        this.activeSequenceKey = null;
        clearTimeout(this.sequenceTimer);
        this.sequenceTimer = null;
    }

    scheduleSequenceEnd(key) {
        const seq = this.config.sequences?.[key];
        if (!seq || this.activeSequenceKey !== key) return;

        clearTimeout(this.sequenceTimer);
        const holdMs = seq.holdMs ?? 0;
        this.sequenceTimer = setTimeout(() => {
            if (this.isTalking || this.activeSequenceKey !== key) return;
            this.playSequenceEnd(key);
        }, holdMs);
    }

    playSequenceEnd(key) {
        const seq = this.config.sequences?.[key];
        if (!seq) return;

        const { end } = seq;

        if (end?.overlay && this.hasAnim(end.overlay)) {
            this.state.setAnimation(this.overlayTrack, end.overlay, false);
        }
        if (end?.move && this.hasAnim(end.move)) {
            this.state.setAnimation(this.moveTrack, end.move, false);
        }
    }

    scheduleBlink() {
        clearTimeout(this.blinkTimer);

        const { blink } = this.config;
        if (this.isTalking || !this.hasAnim(blink.name)) return;

        const { min, max } = blink.intervalMs;
        const waitMs = min + Math.random() * (max - min);
        this.blinkTimer = setTimeout(() => this.playBlink(), waitMs);
    }

    playBlink() {
        if (this.isTalking) return;
        this.state.setAnimation(this.overlayTrack, this.config.blink.name, false);
    }

    startTalking() {
        this.isTalking = true;
        this.clearIdleReset();
        clearTimeout(this.blinkTimer);
        this.clearSequence();
        this.state.setEmptyAnimation(this.overlayTrack, this.mixDuration);

        this.clearTalkStartTimer();
        this.talkStartTimer = setTimeout(() => {
            this.talkStartTimer = null;
            if (this.isTalking && !this.expressionPlaying) {
                this.startTalkOverlay();
            }
        }, 100);
    }

    stopTalking() {
        if (!this.isTalking) return;

        this.isTalking = false;
        this.expressionPlaying = false;
        this.clearTalkStartTimer();
        this.state.setEmptyAnimation(this.overlayTrack, this.mixDuration);
        this.scheduleBlink();
    }

    onResponseEnd() {
        this.stopTalking();
        this.scheduleIdleReset();
    }

    handleCommand(name) {
        const trimmed = String(name || "").trim();
        if (!trimmed) return;

        if (trimmed === this.config.talk.name || trimmed === this.config.blink.name) return;

        if (this.config.sequences?.[trimmed]) {
            this.playSequence(trimmed);
            return;
        }

        if (this.expressionSet.has(trimmed) && this.hasAnim(trimmed)) {
            this.playExpression(trimmed);
        }
    }

    playExpression(name) {
        if (this.activeExpression === name && this.expressionPlaying) return;

        this.clearIdleReset();
        this.clearSequence();
        this.clearTalkStartTimer();
        this.activeExpression = name;
        this.expressionPlaying = true;

        if (this.isTalking) {
            this.state.setEmptyAnimation(this.overlayTrack, this.mixDuration);
        }

        const entry = this.state.setAnimation(this.faceTrack, name, false);
        if (entry) entry.timeScale = 1;
    }

    playSequence(key) {
        if (this.isTalking) return;

        const seq = this.config.sequences?.[key];
        if (!seq) return;

        this.clearIdleReset();
        this.clearSequence();
        this.activeExpression = null;
        clearTimeout(this.blinkTimer);

        this.activeSequenceKey = key;
        const { start } = seq;

        if (start?.overlay && this.hasAnim(start.overlay)) {
            this.state.setAnimation(this.overlayTrack, start.overlay, false);
        }
        if (start?.move && this.hasAnim(start.move)) {
            this.state.setAnimation(this.moveTrack, start.move, false);
        }

        if (!start?.overlay || !this.hasAnim(start.overlay)) {
            this.scheduleSequenceEnd(key);
        }
    }
}
