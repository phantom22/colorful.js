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
        this.$fullscreen.title = "In fullscreen, H hides / shows the UI, Esc leaves fullscreen";
        this.$fullscreen.addEventListener("click", async () => {
            this.$fullscreen.blur();    // so Space doesn't click it again
            try {
                if (document.fullscreenElement) await document.exitFullscreen();
                else await document.documentElement.requestFullscreen();
            } catch {}                  // refused: the label just stays as it is
        });
        // also follows exits via Esc / F11
        document.addEventListener("fullscreenchange", () => {
            this.$fullscreen.textContent = document.fullscreenElement ? "exit fullscreen" : "enter fullscreen";
        });
    }

    cursor(x: number, y: number) {
        this.$cursor.textContent = `x ${x.toFixed(3)}  y ${y.toFixed(3)}`;
    }
    tool(name: string) { this.$tool.textContent = name; }

    private fps_shown = 0;

    /** pass the sim steps of the last second. The text is only rewritten 4
     * times a second (a DOM write per frame costs layout). */
    fps(rate: number) {
        this.fps_smooth = rate;
        const now = performance.now();
        if (now - this.fps_shown < 250) return;
        this.fps_shown = now;
        this.show_fps();
    }

    private show_fps() {
        this.$fps.textContent = `${this.fps_smooth.toFixed(0)} fps`;
    }

    toggle_visibility() {
        this.root.hidden = !this.root.hidden;
    }
}