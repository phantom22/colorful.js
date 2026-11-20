"use strict";
class UI_STATUS {
    root = $("status");
    $cursor = $("st-cursor");
    $tool = $("st-tool");
    $fps = $("st-fps");
    fps_smooth = 60;
    constructor() { isolate(this.root); }
    cursor(x, y) {
        this.$cursor.textContent = `x ${x.toFixed(3)}  y ${y.toFixed(3)}`;
    }
    tool(name) { this.$tool.textContent = name; }
    /** pass the frame time in seconds, the display is smoothed. */
    fps(dt) {
        if (dt > 0 && dt < 1)
            this.fps_smooth += (1 / dt - this.fps_smooth) * 0.05;
        this.$fps.textContent = `${this.fps_smooth.toFixed(0)} fps`;
    }
    toggle_visibility() {
        this.root.hidden = !this.root.hidden;
    }
}
