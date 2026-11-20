"use strict";
class UI_COLOR extends UI_FIELD {
    inputs = [];
    picker = document.createElement("input");
    swatch = document.createElement("label");
    constructor(parent, label, key, io) {
        super(parent, label, key, io, "color");
        // native color dialog, behind the square swatch
        this.swatch.className = "swatch";
        this.picker.type = "color";
        this.swatch.appendChild(this.picker);
        this.picker.addEventListener("input", () => {
            const n = parseInt(this.picker.value.slice(1), 16);
            this.apply([((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]);
        });
        // numeric view, 0..1
        const comps = document.createElement("div");
        comps.className = "comps";
        comps.style.setProperty("--n", "3");
        "rgb".split("").forEach((axis, i) => {
            const c = document.createElement("span");
            c.className = "c";
            const a = document.createElement("i");
            a.textContent = axis;
            const input = document.createElement("input");
            input.type = "number";
            input.step = "0.01";
            scrub_number(input, {
                get: () => this.io.get()[i],
                apply: x => { const v = this.io.get(); v[i] = x; this.apply(v); },
                frozen: () => this.is_frozen,
                base: () => 0.005, // channel units per pixel (0..1 range)
                text: () => this.io.get()[i].toFixed(2),
            });
            c.append(a, input);
            comps.appendChild(c);
            this.inputs.push(input);
        });
        this.root.append(comps, this.swatch);
        this.root.addEventListener("dblclick", e => {
            if (!(e.target instanceof HTMLInputElement))
                this.reset();
        });
        this.refresh_value();
    }
    static hex(v) {
        return "#" + [0, 1, 2].map(i => Math.round(Math.min(1, Math.max(0, v[i])) * 255).toString(16).padStart(2, "0")).join("");
    }
    apply(v) {
        if (this.is_frozen)
            return this.refresh_value();
        const out = v.slice(0, 3).map(x => Math.min(1, Math.max(0, x)));
        this.io.set(out);
        this.io.onChange?.(out);
        this.refresh_value();
    }
    refresh_value() {
        const forced = this.io.frozen?.();
        const v = forced ?? this.io.get();
        this.inputs.forEach((inp, i) => {
            if (document.activeElement !== inp)
                inp.value = v[i].toFixed(2);
        });
        const hex = UI_COLOR.hex(v);
        // only write when it differs, so a live drag isn't fought by the 8-bit round trip
        if (this.picker.value !== hex)
            this.picker.value = hex;
        this.swatch.style.setProperty("--c", hex);
        this.lock(forced !== undefined);
    }
}
