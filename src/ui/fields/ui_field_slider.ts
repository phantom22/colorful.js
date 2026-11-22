class UI_FIELD_SLIDER extends UI_FIELD<number> {
    private readonly range_input = document.createElement("input");
    private readonly number_input = document.createElement("input");

    private decimals() {
        return this.o.int ? 0
            : Math.max(0, Math.ceil(-Math.log10(this.o.step ?? ((this.o.max() - this.o.min()) / 200 || 1))));
    }

    constructor(
        parent: HTMLElement, label: string, key: string, io: FieldIO<number>,
        private readonly o: { min: () => number; max: () => number; step?: number; log: boolean; int: boolean; unit?: UnitDef }
    ) {
        super(parent, label, key, io);
        this.range_input.type = "range";
        this.range_input.min = "0";
        this.range_input.max = "1000";
        this.number_input.type = "number";
        this.root.append(this.range_input, with_unit(this.root, this.number_input, o.unit));

        this.range_input.addEventListener("input", () => this.apply(this.from_t(+this.range_input.value / 1000)));
        // leave the slider after a mouse drag, so the global arrow hotkeys work again.
        // keyboard focus (Tab) keeps it, so arrows can still move the slider.
        this.range_input.addEventListener("pointerup", () => this.range_input.blur());
        this.number_input.addEventListener("change", () => {
            const v = parseFloat(this.number_input.value);
            Number.isNaN(v) ? this.refresh_value() : this.apply(v);
        });
        this.root.addEventListener("dblclick", e => { if (e.target !== this.number_input) this.reset(); });
        this.refresh_value();

        scrub_number(this.number_input, {
            get: () => this.io.get(), apply: v => this.apply(v), frozen: () => this.is_frozen,
            base: () => this.o.int ? 1 : this.o.step ?? 10 ** -this.decimals(),
            text: () => this.io.get().toFixed(this.decimals()),
            log: this.o.log,
        });
    }

    private to_t(v: number) {
        const min = this.o.min(), max = this.o.max();
        if (max <= min) return 0;
        return this.o.log ? (Math.log(Math.max(v, min)) - Math.log(min)) / (Math.log(max) - Math.log(min))
                          : (v - min) / (max - min);
    }
    private from_t(t: number) {
        const min = this.o.min(), max = this.o.max();
        return this.o.log ? Math.exp(Math.log(min) + t * (Math.log(max) - Math.log(min)))
                          : min + t * (max - min);
    }

    apply(v: number) {
        if (this.is_frozen) return this.refresh_value();
        const { log, int, step } = this.o;
        const min = this.o.min(), max = this.o.max();
        if (int) v = Math.round(v);
        if (step && !log) v = Math.round(v / step) * step;
        v = Math.min(max, Math.max(min, v));
        this.io.set(v);
        this.io.onChange?.(v);
        this.refresh_value();
    }

    refresh_value() {
        const max = this.o.max(), min = this.o.min();
        const cur = this.io.get();
        if (!this.is_frozen && (cur > max || cur < min)) this.io.set(Math.min(max, Math.max(min, cur)));

        const forced = this.io.frozen?.();
        const v = forced ?? this.io.get();
        const { int, step } = this.o;
        const decimals = int ? 0
            : Math.max(0, Math.ceil(-Math.log10(step ?? ((this.o.max() - this.o.min()) / 200 || 1))));
        this.range_input.value = String(Math.min(1, Math.max(0, this.to_t(v))) * 1000);
        this.number_input.step = String(10 ** -decimals);       // arrow keys step by the displayed precision
        if (document.activeElement !== this.number_input) this.number_input.value = v.toFixed(decimals);
        this.lock(forced !== undefined);
    }
}