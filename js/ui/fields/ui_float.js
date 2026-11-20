"use strict";
class UI_FLOAT extends UI_FIELD {
    o;
    input = document.createElement("input");
    decimals;
    constructor(parent, label, key, io, o) {
        super(parent, label, key, io, "float");
        this.o = o;
        this.decimals = o.int ? 0
            : o.decimals ?? (o.step ? Math.max(0, Math.ceil(-Math.log10(o.step))) : 3);
        this.input.type = "number";
        this.input.step = String(o.step ?? 10 ** -this.decimals);
        this.root.appendChild(this.input);
        this.input.addEventListener("change", () => {
            const v = parseFloat(this.input.value);
            Number.isNaN(v) ? this.refresh_value() : this.apply(v);
        });
        this.root.addEventListener("dblclick", e => { if (e.target !== this.input)
            this.reset(); });
        this.refresh_value();
        scrub_number(this.input, {
            get: () => this.io.get(), apply: v => this.apply(v), frozen: () => this.is_frozen,
            base: () => this.o.speed ?? (this.o.int ? 1 : this.o.step ?? 10 ** -this.decimals),
            text: () => this.io.get().toFixed(this.decimals),
        });
    }
    apply(v) {
        if (this.is_frozen)
            return this.refresh_value();
        const { min, max, step, int } = this.o;
        if (int)
            v = Math.round(v);
        if (step)
            v = Math.round(v / step) * step;
        v = Math.min(max, Math.max(min, v));
        this.io.set(v);
        this.io.onChange?.(v);
        this.refresh_value();
    }
    refresh_value() {
        const forced = this.io.frozen?.();
        const v = forced ?? this.io.get();
        if (document.activeElement !== this.input)
            this.input.value = v.toFixed(this.decimals);
        this.lock(forced !== undefined);
    }
}
