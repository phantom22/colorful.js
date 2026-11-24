class UI_FIELD_COLOR extends UI_FIELD<number[]> {
    private readonly number_inputs: HTMLInputElement[] = [];
    private readonly color_input = document.createElement("input");
    private readonly color_swatch = document.createElement("label");

    constructor(parent: HTMLElement, label: string, key: string, io: FieldIO<number[]>) {
        super(parent, label, key, io, "color");

        // native color dialog, behind the square swatch
        this.color_swatch.className = "swatch";
        this.color_input.type = "color";
        this.color_swatch.appendChild(this.color_input);
        this.color_input.addEventListener("input", () => {
            const n = parseInt(this.color_input.value.slice(1), 16);
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
                base: () => 0.005,                         // channel units per pixel (0..1 range)
                text: () => this.io.get()[i].toFixed(2),
                def: () => this.io.def()[i],
            });

            // typed values (Enter / leaving the box); drag and wheel go through scrub_number
            input.addEventListener("change", () => {
                const x = parseFloat(input.value);
                if (Number.isNaN(x)) return this.refresh_value();
                const v = this.io.get(); v[i] = x; this.apply(v);
            });

            c.append(a, input);
            comps.appendChild(c);
            this.number_inputs.push(input);
        });

        this.root.append(comps, this.color_swatch);
        this.root.addEventListener("dblclick", e => {
            if (!(e.target instanceof HTMLInputElement)) this.reset();
        });
        this.refresh_value();
    }

    private static hex(v: ArrayLike<number>) {
        return "#" + [0, 1, 2].map(i =>
            Math.round(Math.min(1, Math.max(0, v[i])) * 255).toString(16).padStart(2, "0")).join("");
    }

    apply(v: number[]) {
        if (this.is_frozen) return this.refresh_value();
        const out = v.slice(0, 3).map(x => Math.min(1, Math.max(0, x)));
        this.io.set(out);
        this.io.onChange?.(out);
        this.refresh_value();
    }

    refresh_value() {
        const forced = this.io.frozen?.();
        const v = forced ?? this.io.get();
        this.number_inputs.forEach((inp, i) => {
            if (document.activeElement !== inp) inp.value = v[i].toFixed(2);
        });
        const hex = UI_FIELD_COLOR.hex(v);
        // only write when it differs, so a live drag isn't fought by the 8-bit round trip
        if (this.color_input.value !== hex) this.color_input.value = hex;
        this.color_swatch.style.setProperty("--c", hex);
        this.lock(forced !== undefined);
    }
}