class UI_STATUS {
    private readonly root = $("status");
    private readonly $cursor = $("st-cursor");
    private readonly $tool = $("st-tool");
    private readonly $fps = $("st-fps");
    /** the rate readout: frames per second, or the average frame time in ms.
     * A click (tap) switches; the choice is remembered. */
    private mode: "fps" | "ms" = "fps";
    private last: { rate: number, ms: number } | null = null;
    private idling = false;

    constructor() {
        isolate(this.root);
        try { if (localStorage.getItem("status_rate") === "ms") this.mode = "ms"; } catch {}
        this.$fps.title = "Click to switch between fps and frame time";
        this.$fps.addEventListener("click", () => {
            this.mode = this.mode === "fps" ? "ms" : "fps";
            try { localStorage.setItem("status_rate", this.mode); } catch {}
            this.render();
        });
        this.render();                      // "– fps" until the first second has been measured
    }

    private render() {
        const l = this.last;
        this.$fps.textContent = this.idling ? "idle"
            : this.mode === "fps" ? `${l ? l.rate.toFixed(0) : "–"} fps`
            : `${l && l.ms > 0 ? l.ms.toFixed(1) : "–"} ms`;
    }

    cursor(x: number, y: number) {
        this.$cursor.textContent = `x ${x.toFixed(3)}  y ${y.toFixed(3)}`;
    }
    /** the x / y readout: world coordinates, so only shown with the force field on. */
    show_cursor(on: boolean) { this.$cursor.hidden = !on; }
    tool(name: string) { this.$tool.textContent = name; }

    /** frames per second and average frame time (ms) over the last second.
     * Called a few times a second (see pacing.stepped), one DOM write each. */
    fps(rate: number, frame_ms: number) {
        this.last = { rate, ms: frame_ms };
        this.idling = false;
        this.render();
    }
    /** the sim has stopped stepping, see idle in draw.ts. */
    idle() {
        this.idling = true;
        this.render();
    }

    toggle_visibility() {
        this.root.hidden = !this.root.hidden;
    }
}