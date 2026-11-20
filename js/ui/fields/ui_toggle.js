"use strict";
class UI_TOGGLE extends UI_FIELD {
    int;
    input = document.createElement("input");
    constructor(parent, label, key, io, int) {
        super(parent, label, key, io, "toggle");
        this.int = int;
        this.input.type = "checkbox";
        this.root.appendChild(this.input);
        this.input.addEventListener("change", () => this.apply(this.input.checked));
        this.input.addEventListener("pointerup", () => this.input.blur());
        this.refresh_value();
    }
    apply(v) {
        if (this.is_frozen)
            return this.refresh_value();
        const t = this.int ? Number(v) : !!v;
        this.io.set(t);
        this.io.onChange?.(t);
        this.refresh_value();
    }
    refresh_value() {
        const forced = this.io.frozen?.();
        this.input.checked = !!(forced ?? this.io.get());
        this.lock(forced !== undefined);
    }
}
