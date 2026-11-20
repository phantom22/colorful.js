"use strict";
class UI_ENUM extends UI_FIELD {
    options;
    select = document.createElement("select");
    shown = null;
    constructor(parent, label, key, io, options) {
        super(parent, label, key, io, "enum");
        this.options = options;
        this.root.appendChild(this.select);
        this.select.addEventListener("change", () => { this.apply(+this.select.value); this.select.blur(); });
        this.root.addEventListener("dblclick", e => { if (e.target !== this.select)
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
        const opts = this.options();
        const same = this.shown !== null && this.shown.length === opts.length &&
            opts.every((o, i) => o.value === this.shown[i].value && o.name === this.shown[i].name);
        if (!same) {
            this.select.replaceChildren(...opts.map(o => {
                const el = document.createElement("option");
                el.value = String(o.value);
                el.textContent = o.name;
                return el;
            }));
            this.shown = opts.map(o => ({ ...o }));
        }
        const forced = this.io.frozen?.();
        this.select.value = String(forced ?? this.io.get());
        this.lock(forced !== undefined);
        this.select.title = forced !== undefined ? "locked by the current view" : "";
    }
}
