class UI_FIELD_TOGGLE extends UI_FIELD<number | boolean> {
    private readonly checkbox_input = document.createElement("input");

    constructor(
        parent: HTMLElement, label: string, key: string,
        io: FieldIO<number | boolean>, private readonly int: boolean
    ) {
        super(parent, label, key, io, "toggle");
        this.checkbox_input.type = "checkbox";
        this.root.appendChild(this.checkbox_input);
        this.checkbox_input.addEventListener("change", () => this.apply(this.checkbox_input.checked));
        this.checkbox_input.addEventListener("pointerup", () => this.checkbox_input.blur());
        this.refresh_value();
    }

    apply(v: number | boolean) {
        if (this.is_frozen) return this.refresh_value();
        const t = this.int ? Number(v) : !!v;
        this.io.set(t);
        this.io.onChange?.(t);
        this.refresh_value();
    }

    refresh_value() {
        const forced = this.io.frozen?.();
        this.checkbox_input.checked = !!(forced ?? this.io.get());
        this.lock(forced !== undefined);
    }
}