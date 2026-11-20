"use strict";
class UI_FIELD_PALETTE extends UI_FIELD {
    colors;
    onAdd;
    grid = document.createElement("div");
    constructor(parent, label, key, io, colors, onAdd) {
        super(parent, label, key, io, "palette");
        this.colors = colors;
        this.onAdd = onAdd;
        this.grid.className = "palette-grid";
        this.root.appendChild(this.grid);
        this.render();
    }
    static hex(c) {
        return "#" + [c[0], c[1], c[2]].map(v => v.toString(16).padStart(2, "0")).join("");
    }
    /** rebuilds the swatches, call after changing the colors array. */
    render() {
        const colors = this.colors();
        this.grid.replaceChildren();
        colors.forEach((c, i) => {
            const b = document.createElement("button");
            b.className = "sw";
            b.style.setProperty("--c", UI_FIELD_PALETTE.hex(c.color));
            b.title = UI_FIELD_PALETTE.hex(c.color);
            b.addEventListener("click", () => this.apply(i));
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
                this.apply(this.colors().length - 1);
            });
            this.grid.appendChild(add);
        }
        this.refresh_value();
    }
    /** selects a swatch and notifies. */
    apply(v) {
        if (this.is_frozen)
            return this.refresh_value();
        v = Math.min(this.colors().length - 1, Math.max(0, Math.round(v)));
        this.io.set(v);
        this.io.onChange?.(v);
        this.refresh_value();
    }
    /** moves the highlight only (use it when code changed the color). */
    refresh_value() {
        const forced = this.io.frozen?.();
        const cur = forced ?? this.io.get();
        this.grid.querySelectorAll(".sw:not(.add)")
            .forEach((b, k) => b.classList.toggle("picked", k === cur));
        this.lock(forced !== undefined);
    }
}
