class UI_BOUNDS {
    private readonly tl = $("c-tl");
    private readonly tr = $("c-tr");
    private readonly bl = $("c-bl");
    private readonly br = $("c-br");

    private static fmt(el: HTMLElement, x: number, y: number) {
        const f = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);
        el.textContent = `${f(x)}, ${f(y)}`;
    }

    /** window centered at (cx, cy) with half extents (hw, hh).
     *  Uses the force shader's convention, p = (0.5 - uv) * ... + center, so x and y
     *  decrease toward the right and the top. */
    update(cx: number, cy: number, hw: number, hh: number) {
        const x0 = cx - hw, x1 = cx + hw, y0 = cy - hh, y1 = cy + hh;
        UI_BOUNDS.fmt(this.tl, x0, y1);   // quadrant II  (-, +)
        UI_BOUNDS.fmt(this.tr, x1, y1);   // quadrant I   (+, +)
        UI_BOUNDS.fmt(this.bl, x0, y0);   // quadrant III (-, -)
        UI_BOUNDS.fmt(this.br, x1, y0);   // quadrant IV  (+, -)
    }

    toggle_visibility() {
        this.tl.hidden = this.tr.hidden = this.bl.hidden = this.br.hidden = !this.tl.hidden;
    }
}