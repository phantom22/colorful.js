"use strict";
class UI_FIELD_VECTOR extends UI_FIELD {
    n;
    o;
    number_inputs = [];
    decimals;
    constructor(parent, label, key, io, n, o) {
        super(parent, label, key, io, "vec");
        this.n = n;
        this.o = o;
        this.decimals = o.step ? Math.max(0, Math.ceil(-Math.log10(o.step))) : 3;
        const comps = document.createElement("div");
        comps.className = "comps";
        comps.style.setProperty("--n", String(n));
        for (let i = 0; i < n; ++i) {
            const c = document.createElement("span");
            c.className = "c";
            const axis = document.createElement("i");
            axis.textContent = o.labels[i] ?? "xyzw"[i];
            const input = document.createElement("input");
            input.type = "number";
            input.step = String(o.step ?? 10 ** -this.decimals);
            input.addEventListener("change", () => {
                const x = parseFloat(input.value);
                if (Number.isNaN(x))
                    return this.refresh_value();
                const v = this.io.get();
                v[i] = x;
                this.apply(v);
            });
            scrub_number(input, {
                get: () => this.io.get()[i],
                apply: x => { const v = this.io.get(); v[i] = x; this.apply(v); },
                frozen: () => this.is_frozen,
                base: () => 0.005, // channel units per pixel (0..1 range)
                text: () => this.io.get()[i].toFixed(2),
            });
            c.append(axis, input);
            comps.appendChild(c);
            this.number_inputs.push(input);
        }
        this.root.appendChild(comps);
        this.root.addEventListener("dblclick", e => {
            if (!(e.target instanceof HTMLInputElement))
                this.reset();
        });
        this.refresh_value();
    }
    apply(v) {
        if (this.is_frozen)
            return this.refresh_value();
        const { min, max, step } = this.o;
        const out = v.slice(0, this.n).map(x => {
            if (step)
                x = Math.round(x / step) * step;
            return Math.min(max, Math.max(min, x));
        });
        this.io.set(out);
        this.io.onChange?.(out);
        this.refresh_value();
    }
    refresh_value() {
        const forced = this.io.frozen?.();
        const v = forced ?? this.io.get();
        this.number_inputs.forEach((inp, i) => {
            if (document.activeElement !== inp)
                inp.value = v[i].toFixed(this.decimals);
        });
        this.lock(forced !== undefined);
    }
}
