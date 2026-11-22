class UI_STATUS {
    private readonly root = $("status");
    private readonly $cursor = $("st-cursor");
    private readonly $tool = $("st-tool");
    private readonly $fps = $("st-fps");
    private readonly $fullscreen = $("st-fullscreen");
    private fps_smooth = 60;

    constructor() {
        isolate(this.root);
        // hidden where the page can't go fullscreen (e.g. iPhone Safari)
        this.$fullscreen.hidden = !document.fullscreenEnabled;
        this.$fullscreen.title = "In fullscreen, H hides / shows the UI (Esc usually leaves fullscreen)";
        this.$fullscreen.addEventListener("click", async () => {
            this.$fullscreen.blur();    // so Space doesn't click it again
            const kb = (navigator as any).keyboard;
            try {
                if (document.fullscreenElement) {
                    kb?.unlock?.();
                    await document.exitFullscreen();
                } else {
                    // claim Esc before going fullscreen (Chromium's documented
                    // order), so Esc toggles the UI instead of leaving
                    try { await kb?.lock?.(["Escape"]); } catch {}
                    await document.documentElement.requestFullscreen();
                }
            } catch {}                  // refused: the label just stays as it is
        });
        // also follows exits via Esc / F11
        document.addEventListener("fullscreenchange", () => {
            const on = !!document.fullscreenElement;
            this.$fullscreen.textContent = on ? "exit fullscreen" : "enter fullscreen";
            // Esc toggles the UI, so in fullscreen claim it from the browser where
            // the Keyboard Lock API exists (Chromium, secure origins): a short Esc
            // then reaches the page and holding Esc leaves fullscreen. Elsewhere
            // the browser keeps Esc for leaving fullscreen.
            const kb = (navigator as any).keyboard;
            if (on) kb?.lock?.(["Escape"]).catch(() => {});
            else kb?.unlock?.();
        });
    }

    cursor(x: number, y: number) {
        this.$cursor.textContent = `x ${x.toFixed(3)}  y ${y.toFixed(3)}`;
    }
    tool(name: string) { this.$tool.textContent = name; }

    /** pass the frame time in seconds, the display is smoothed. */
    fps(dt: number) {
        if (dt > 0 && dt < 1) this.fps_smooth += (1 / dt - this.fps_smooth) * 0.05;
        this.$fps.textContent = `${this.fps_smooth.toFixed(0)} fps`;
    }

    toggle_visibility() {
        this.root.hidden = !this.root.hidden;
    }
}