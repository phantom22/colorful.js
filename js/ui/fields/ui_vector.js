"use strict";
class UI_VECTOR extends UI_FIELD {
    n;
    o;
    inputs = [];
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
            this.scrub(axis, i);
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
            c.append(axis, input);
            comps.appendChild(c);
            this.inputs.push(input);
        }
        this.root.appendChild(comps);
        this.root.addEventListener("dblclick", e => {
            if (!(e.target instanceof HTMLInputElement))
                this.reset();
        });
        this.refresh_value();
    }
    scrub(axis, i) {
        let x0 = 0, v0 = 0;
        axis.addEventListener("pointerdown", e => {
            if (this.is_frozen)
                return;
            axis.setPointerCapture(e.pointerId);
            x0 = e.clientX;
            v0 = this.io.get()[i];
            e.preventDefault();
        });
        axis.addEventListener("pointermove", e => {
            if (!axis.hasPointerCapture(e.pointerId))
                return;
            const speed = (this.o.step ?? 0.01) * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1);
            const v = this.io.get();
            v[i] = v0 + (e.clientX - x0) * speed;
            this.apply(v);
        });
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
        this.inputs.forEach((inp, i) => {
            if (document.activeElement !== inp)
                inp.value = v[i].toFixed(this.decimals);
        });
        this.lock(forced !== undefined);
    }
}
