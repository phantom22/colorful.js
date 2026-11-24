class UI_STATUS {
    private readonly root = $("status");
    private readonly $cursor = $("st-cursor");
    private readonly $tool = $("st-tool");
    private readonly $fps = $("st-fps");

    constructor() {
        isolate(this.root);
        this.$fps.textContent = "– fps";    // until the first second has been measured
    }

    cursor(x: number, y: number) {
        this.$cursor.textContent = `x ${x.toFixed(3)}  y ${y.toFixed(3)}`;
    }
    /** the x / y readout: world coordinates, so only shown with the force field on. */
    show_cursor(on: boolean) { this.$cursor.hidden = !on; }
    tool(name: string) { this.$tool.textContent = name; }

    /** steps per second of the last second. Called a few times a second
     * (see pacing.stepped), each call is one DOM write. */
    fps(rate: number) {
        this.$fps.textContent = `${rate.toFixed(0)} fps`;
    }

    toggle_visibility() {
        this.root.hidden = !this.root.hidden;
    }
}