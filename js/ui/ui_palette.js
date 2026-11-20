"use strict";
class UI_PALETTE {
    palette;
    onPick;
    onAdd;
    section;
    grid = document.createElement("div");
    current;
    constructor(section, palette, picked, onPick, onAdd) {
        this.palette = palette;
        this.onPick = onPick;
        this.onAdd = onAdd;
        this.section = section;
        this.current = picked;
        this.grid.id = "color-picker";
        section.body.appendChild(this.grid);
        this.render();
    }
    static hex(c) {
        return "#" + [c[0], c[1], c[2]].map(v => v.toString(16).padStart(2, "0")).join("");
    }
    /** rebuilds the swatches, call after changing the palette array. */
    render() {
        this.grid.replaceChildren();
        this.palette.forEach((c, i) => {
            const b = document.createElement("button");
            b.className = "sw";
            b.style.setProperty("--c", UI_PALETTE.hex(c.color));
            b.title = UI_PALETTE.hex(c.color);
            b.addEventListener("click", () => this.pick(i));
            this.grid.appendChild(b);
        });
        if (this.onAdd) {
            const add = document.createElement("label");
            add.className = "sw add";
            add.title = "Add color";
            add.innerHTML = `<span>+</span><input type="color" value="#ffffff">`;
            const inp = add.querySelector("input");
            inp.addEventListener("change", () => {
                const n = parseInt(inp.value.slice(1), 16);
                this.onAdd(get_color_data(new Uint8Array([(n >> 16) & 255, (n >> 8) & 255, n & 255, 255])));
                this.render();
                this.pick(this.palette.length - 1);
            });
            this.grid.appendChild(add);
        }
        this.highlight(Math.min(this.current, this.palette.length - 1));
    }
    highlight(i) {
        this.current = i;
        this.grid.querySelectorAll(".sw:not(.add)")
            .forEach((b, k) => b.classList.toggle("picked", k === i));
    }
    /** selects a swatch; notify=false only moves the highlight (use it when code changed the color). */
    pick(i, notify = true) {
        this.highlight(i);
        if (notify)
            this.onPick(i);
    }
    get picked() { return this.current; }
    toggle_visibility() {
        this.section.toggle_visibility();
    }
}
