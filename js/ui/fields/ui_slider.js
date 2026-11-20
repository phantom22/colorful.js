"use strict";
class UI_SLIDER extends UI_FIELD {
    o;
    in_range = document.createElement("input");
    in_number = document.createElement("input");
    decimals() {
        return this.o.int ? 0
            : Math.max(0, Math.ceil(-Math.log10(this.o.step ?? ((this.o.max() - this.o.min()) / 200 || 1))));
    }
    constructor(parent, label, key, io, o) {
        super(parent, label, key, io);
        this.o = o;
        this.in_range.type = "range";
        this.in_range.min = "0";
        this.in_range.max = "1000";
        this.in_number.type = "number";
        this.root.append(this.in_range, this.in_number);
        this.in_range.addEventListener("input", () => this.apply(this.from_t(+this.in_range.value / 1000)));
        // leave the slider after a mouse drag, so the global arrow hotkeys work again.
        // keyboard focus (Tab) keeps it, so arrows can still move the slider.
        this.in_range.addEventListener("pointerup", () => this.in_range.blur());
        this.in_number.addEventListener("change", () => {
            const v = parseFloat(this.in_number.value);
            Number.isNaN(v) ? this.refresh_value() : this.apply(v);
        });
        this.root.addEventListener("dblclick", e => { if (e.target !== this.in_number)
            this.reset(); });
        this.refresh_value();
        scrub_number(this.in_number, {
            get: () => this.io.get(), apply: v => this.apply(v), frozen: () => this.is_frozen,
            base: () => this.o.int ? 1 : this.o.step ?? 10 ** -this.decimals(),
            text: () => this.io.get().toFixed(this.decimals()),
            log: this.o.log,
        });
    }
    to_t(v) {
        const min = this.o.min(), max = this.o.max();
        if (max <= min)
            return 0;
        return this.o.log ? (Math.log(Math.max(v, min)) - Math.log(min)) / (Math.log(max) - Math.log(min))
            : (v - min) / (max - min);
    }
    from_t(t) {
        const min = this.o.min(), max = this.o.max();
        return this.o.log ? Math.exp(Math.log(min) + t * (Math.log(max) - Math.log(min)))
            : min + t * (max - min);
    }
    apply(v) {
        if (this.is_frozen)
            return this.refresh_value();
        const { log, int, step } = this.o;
        const min = this.o.min(), max = this.o.max();
        if (int)
            v = Math.round(v);
        if (step && !log)
            v = Math.round(v / step) * step;
        v = Math.min(max, Math.max(min, v));
        this.io.set(v);
        this.io.onChange?.(v);
        this.refresh_value();
    }
    refresh_value() {
        const max = this.o.max(), min = this.o.min();
        const cur = this.io.get();
        if (!this.is_frozen && (cur > max || cur < min))
            this.io.set(Math.min(max, Math.max(min, cur)));
        const forced = this.io.frozen?.();
        const v = forced ?? this.io.get();
        const { int, step } = this.o;
        const decimals = int ? 0
            : Math.max(0, Math.ceil(-Math.log10(step ?? ((this.o.max() - this.o.min()) / 200 || 1))));
        this.in_range.value = String(Math.min(1, Math.max(0, this.to_t(v))) * 1000);
        this.in_number.step = String(10 ** -decimals); // arrow keys step by the displayed precision
        if (document.activeElement !== this.in_number)
            this.in_number.value = v.toFixed(decimals);
        this.lock(forced !== undefined);
    }
}
