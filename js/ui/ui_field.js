"use strict";
class UI_FIELD {
    io;
    pid = "";
    track = true;
    /** Root div container. */
    root = document.createElement("div");
    label;
    /** is the field currently frozen. */
    get is_frozen() { return this.io.frozen?.() !== undefined; }
    /** true when the current value differs from the original default. */
    get modified() {
        if (!this.track || this.is_frozen)
            return false;
        return !field_same(this.io.get(), this.io.def());
    }
    constructor(section_body, label, title, io, row_class = "") {
        this.io = io;
        const set = io.set;
        this.label = label;
        this.io = {
            ...io,
            set: (v) => { set(v); this.save(v); this.update_mod(); }
        };
        this.root.className = ("row " + row_class).trim();
        const l = document.createElement("label");
        l.textContent = label;
        if (io.tooltip)
            UI_TOOLTIP.attach(l, io.tooltip);
        else
            l.title = title;
        this.root.appendChild(l);
        section_body.appendChild(this.root);
    }
    /** Updates root classlist based on `modified`. */
    update_mod() { this.root.classList.toggle("mod", this.modified); }
    set_visible(visible) {
        this.root.hidden = !visible;
    }
    toggle_visibility() { this.root.hidden = !this.root.hidden; }
    /** Sets visibility to io.visible(). */
    refresh_visibility() {
        this.io.visible && this.set_visible(this.io.visible());
    }
    refresh() {
        this.refresh_visibility();
        this.update_mod();
        if (!this.root.hidden)
            this.refresh_value();
    }
    /** Greys out and disables every input in the field root. */
    lock(on) {
        this.root.classList.toggle("frozen", on);
        this.root.querySelectorAll("input,select")
            .forEach(i => { i.disabled = on; });
    }
    /** Store into localStorage the passed state. */
    save(v) {
        if (this.pid)
            store.set(this.pid, Array.isArray(v) ? v.slice() : v);
    }
    save_now() { this.save(this.io.get()); }
    restore() {
        if (!this.pid || this.is_frozen)
            return;
        const v = store.get(this.pid);
        if (v === undefined)
            return;
        try {
            this.apply(v);
        }
        catch {
            store.del(this.pid);
        }
    }
    reset() {
        this.apply(this.io.def());
        if (this.pid)
            store.del(this.pid);
    }
}
