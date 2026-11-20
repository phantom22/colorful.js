class UI_STATUS {
    private readonly root = $("status");
    private readonly $cursor = $("st-cursor");
    private readonly $tool = $("st-tool");
    private readonly $fps = $("st-fps");
    private fps_smooth = 60;

    constructor() { isolate(this.root); }

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