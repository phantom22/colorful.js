abstract class UI_FIELD<T> implements IUI_FIELD<T> {
    pid = "";
    track = true;

    /** Root div container. */
    protected readonly root = document.createElement("div");
    readonly label: string;

    /** is the field currently frozen. */
    get is_frozen() { return this.io.frozen?.() !== undefined; }
    /** true when the current value differs from the original default. */
    get modified() {
        if (!this.track || this.is_frozen) return false;
        return !field_same(this.io.get(), this.io.def());
    }

    constructor(
        section_body: HTMLElement, label: string, title: string,
        protected readonly io: FieldIO<T>, row_class = ""
    ) {
        const set = io.set;
        this.label = label;
        this.io = {
            ...io,
            set: (v: T) => { set(v); this.save(v); this.update_mod(); }
        };
        this.root.className = ("row " + row_class).trim();
        const l = document.createElement("label");
        l.textContent = label;
        if (io.tooltip) UI_TOOLTIP.attach(l, io.tooltip);
        else l.title = title;
        this.root.appendChild(l);
        section_body.appendChild(this.root);
    }

    abstract refresh_value(): void;
    abstract apply(v: T): void;

    /** Updates root classlist based on `modified`. */
    protected update_mod() { this.root.classList.toggle("mod", this.modified); }

    set_visible(visible: boolean) {
        this.root.hidden = !visible;
    }

    toggle_visibility() { this.root.hidden = !this.root.hidden; }

    /** Sets visibility to io.visible(). */
    protected refresh_visibility() {
        this.io.visible && this.set_visible(Boolean(this.io.visible()));
    }

    refresh() {
        this.refresh_visibility();
        this.update_mod();
        if (!this.root.hidden) this.refresh_value();
    }

    /** Greys out and disables every input in the field root. */
    protected lock(on: boolean) {
        this.root.classList.toggle("frozen", on);
        this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select")
            .forEach(i => { i.disabled = on; });
    }

    /** Store into localStorage the passed state. */
    protected save(v: T) {
        if (this.pid) store.set(this.pid, Array.isArray(v) ? (v as any[]).slice() : v);
    }

    save_now() { this.save(this.io.get()); }
    
    restore() {
        if (!this.pid || this.is_frozen) return;
        const v = store.get(this.pid);
        if (v === undefined) return;
        try { this.apply(v); } catch { store.del(this.pid); }
    }
    
    reset() {
        this.apply(this.io.def());
        if (this.pid) store.del(this.pid);
    }
}