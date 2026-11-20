"use strict";
class UI_FIELD_ENUM extends UI_FIELD {
    get_options;
    input_select = document.createElement("select");
    options = null;
    constructor(parent, label, key, io, get_options) {
        super(parent, label, key, io, "enum");
        this.get_options = get_options;
        this.root.appendChild(this.input_select);
        this.input_select.addEventListener("change", () => { this.apply(+this.input_select.value); this.input_select.blur(); });
        this.root.addEventListener("dblclick", e => { if (e.target !== this.input_select)
            this.reset(); });
        this.refresh_value();
    }
    apply(v) {
        if (this.is_frozen)
            return this.refresh_value();
        this.io.set(v);
        this.io.onChange?.(v);
        this.refresh_value();
    }
    refresh_value() {
        const opts = this.get_options();
        const same = this.options !== null && this.options.length === opts.length &&
            opts.every((o, i) => o.value === this.options[i].value && o.name === this.options[i].name);
        if (!same) {
            this.input_select.replaceChildren(...opts.map(o => {
                const el = document.createElement("option");
                el.value = String(o.value);
                el.textContent = o.name;
                return el;
            }));
            this.options = opts.map(o => ({ ...o }));
        }
        const forced = this.io.frozen?.();
        this.input_select.value = String(forced ?? this.io.get());
        this.lock(forced !== undefined);
        this.input_select.title = forced !== undefined ? "locked by the current view" : "";
    }
}
