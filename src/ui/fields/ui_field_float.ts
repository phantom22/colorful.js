class UI_FIELD_FLOAT extends UI_FIELD<number> {
    private readonly number_input = document.createElement("input");
    private readonly decimals: number;

    constructor(
        parent: HTMLElement, label: string, key: string, io: FieldIO<number>,
        private readonly o: { min: number; max: number; step?: number; int: boolean; decimals?: number; speed?: number; unit?: UnitDef; scrub?: boolean }
    ) {
        super(parent, label, key, io, "float");
        this.decimals = o.int ? 0
            : o.decimals ?? (o.step ? Math.max(0, Math.ceil(-Math.log10(o.step))) : 3);

        this.number_input.type = "number";
        this.number_input.step = String(o.step ?? 10 ** -this.decimals);
        this.root.appendChild(with_unit(this.root, this.number_input, o.unit));

        this.number_input.addEventListener("change", () => {
            const v = parseFloat(this.number_input.value);
            Number.isNaN(v) ? this.refresh_value() : this.apply(v);
        });
        this.root.addEventListener("dblclick", e => { if (e.target !== this.number_input) this.reset(); });
        this.refresh_value();

        if (o.scrub !== false) scrub_number(this.number_input, {
            get: () => this.io.get(), apply: v => this.apply(v), frozen: () => this.is_frozen,
            base: () => this.o.speed ?? (this.o.int ? 1 : this.o.step ?? 10 ** -this.decimals),
            text: () => this.io.get().toFixed(this.decimals),
        });
    }

    apply(v: number) {
        if (this.is_frozen) return this.refresh_value();
        const { min, max, step, int } = this.o;
        if (int) v = Math.round(v);
        if (step) v = Math.round(v / step) * step;
        v = Math.min(max, Math.max(min, v));
        this.io.set(v);
        this.io.onChange?.(v);
        this.refresh_value();
    }

    refresh_value() {
        const forced = this.io.frozen?.();
        const v = forced ?? this.io.get();
        if (document.activeElement !== this.number_input) this.number_input.value = v.toFixed(this.decimals);
        this.lock(forced !== undefined);
    }
}