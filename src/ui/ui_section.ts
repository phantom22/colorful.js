/** the reset icon, also used by the inspector header button in index.html. */
const RESET_ICON = '<svg viewBox="0 0 24 24"><path d="M15.5 5.94A7 7 0 1 1 8.5 5.94"/><path d="M7.02 9.11L8.5 5.94L5.01 5.64"/></svg>';

class UI_SECTION {
    readonly el = document.createElement("section");
    readonly body = document.createElement("div");
    readonly fields: UI_FIELD<any>[] = [];
    readonly visible?: () => boolean|number;

    /** Collection of all the modified field labels. */
    private mod_labels: string[] = [];

    readonly badge = document.createElement("span");
    /** resets this section's fields, like the inspector's reset-all. */
    private readonly reset_btn = document.createElement("button");

    constructor(readonly name: string, visible?: () => boolean|number, open = true) {
        const h3 = document.createElement("h3");
        h3.textContent = name;
        h3.addEventListener("click", () => this.open(!this.is_open));
        this.badge.className = "mods";
        this.badge.hidden = true;
        this.reset_btn.type = "button";
        this.reset_btn.className = "sec-reset";
        this.reset_btn.title = "Reset this section to defaults";
        this.reset_btn.innerHTML = RESET_ICON;
        this.reset_btn.addEventListener("click", e => {
            e.stopPropagation();                 // don't toggle the section open / closed
            this.reset();
            (e.currentTarget as HTMLElement).blur();
        });
        const end = document.createElement("span");   // badge + button, pushed to the right
        end.className = "h3-end";
        end.append(this.badge, this.reset_btn);
        h3.appendChild(end);
        
        UI_TOOLTIP.attach(this.badge, () => this.mod_tip());
        this.body.className = "body";
        this.el.dataset.id = name;
        this.el.append(h3, this.body);
        this.open(open);
        this.visible = visible;
    }

    private mod_tip() {
        const n = this.mod_labels.length;
        return `$Modified$ ` +
            `{[${n}] ${n === 1 ? "setting differs" : "settings differ"} from the default in this section.} ` +
            `{${this.mod_labels.join("\n")}} ` +
            `{Double-click a row to reset it.}`;
    }

    /** resets every field here except keep_on_reset ones (same rule as reset-all). */
    reset() {
        for (const e of this.fields) if (!e.keep_on_reset) e.reset();
        this.refresh();
    }

    get is_open() { return this.el.classList.contains("open"); }
    open(v = true) { this.el.classList.toggle("open", v); }
    set_visible(visible: boolean, open_on_show = true) {
        const v = !visible;
        if (v === this.el.hidden) return;
        this.el.hidden = v;
        if (visible && open_on_show) this.open(true);
    }

    toggle_visibility() { this.set_visible(this.el.hidden as boolean); }

    refresh_visibility() {
        if (this.visible) this.set_visible(Boolean(this.visible()));
    }

    refresh() {
        this.refresh_visibility();
        if (!this.el.hidden) this.fields.forEach(e => e.refresh());
        const mods = this.fields.filter(e => e.modified);
        this.mod_labels = mods.map(e => e.label);
        this.badge.hidden = mods.length === 0;
        this.badge.textContent = `● ${mods.length}`;
        // what a reset would change, for the reset buttons' highlight
        const resettable = mods.filter(e => !e.keep_on_reset).length;
        this.reset_btn.classList.toggle("dirty", resettable > 0);
        return resettable;
    }

    slider<O extends object, K extends NumKey<O>>(d: SliderDef<O, K>) {
        const b = bind(d.obj, d.key, x => x as number);
        return this.push(new UI_FIELD_SLIDER(this.body, d.label, String(d.key), {
            get: () => b.target()[d.key] as number,
            set: v => { b.target()[d.key] = v as O[K]; },
            def: d.def ?? b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, { min: () => SrcVal(d.min), max: () => SrcVal(d.max), step: d.step, log: d.log ?? false, int: d.int ?? false, unit: d.unit }), d);
    }

    toggle<O extends object, K extends FlagKey<O>>(d: ToggleDef<O, K>) {
        const b = bind(d.obj, d.key, x => x as number | boolean);
        return this.push(new UI_FIELD_TOGGLE(this.body, d.label, String(d.key), {
            get: () => b.target()[d.key] as number | boolean,
            set: v => { b.target()[d.key] = v as O[K]; },
            def: b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, d.int ?? false), d);
    }

    enum<O extends object, K extends NumKey<O>>(d: EnumDef<O, K>) {
        const b = bind(d.obj, d.key, x => x as number);
        return this.push(new UI_FIELD_ENUM(this.body, d.label, String(d.key), {
            get: () => b.target()[d.key] as number,
            set: v => { b.target()[d.key] = v as O[K]; },
            def: b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, () => SrcVal(d.options)), d);
    }

    private vec<O extends object, K extends VecKey<O>>(n: 2 | 3 | 4, d: VecDef<O, K>) {
        const arr = (t: O) => t[d.key] as unknown as { [i: number]: number };
        const read = (t: O) => Array.from({ length: n }, (_, i) => arr(t)[i]);
        const b = bind(d.obj, d.key, () => read(SrcVal(d.obj)));
        return this.push(new UI_FIELD_VECTOR(this.body, d.label, String(d.key), {
            get: () => read(b.target()),
            set: v => { const a = arr(b.target()); for (let i = 0; i < n; ++i) a[i] = v[i]; },   // in place
            def: b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, n, { min: d.min ?? -Infinity, max: d.max ?? Infinity, step: d.step, labels: d.labels ?? "xyzw" }), d);
    }
    vec2<O extends object, K extends VecKey<O>>(d: VecDef<O, K>) { return this.vec(2, d); }
    vec3<O extends object, K extends VecKey<O>>(d: VecDef<O, K>) { return this.vec(3, d); }
    vec4<O extends object, K extends VecKey<O>>(d: VecDef<O, K>) { return this.vec(4, d); }

    color<O extends object, K extends VecKey<O>>(d: ColorDef<O, K>) {
        const arr = (t: O) => t[d.key] as unknown as { [i: number]: number };
        const read = (t: O) => [arr(t)[0], arr(t)[1], arr(t)[2]];
        const b = bind(d.obj, d.key, () => read(SrcVal(d.obj)));
        return this.push(new UI_FIELD_COLOR(this.body, d.label, String(d.key), {
            get: () => read(b.target()),
            set: v => { const a = arr(b.target()); for (let i = 0; i < 3; ++i) a[i] = v[i]; },   // in place
            def: b.def, frozen: d.frozen, onChange: d.onPick,
            visible: d.visible, tooltip: d.tooltip
        }), d);
    }

    glsl<O extends object, K extends StringKey<O>>(d: GlslDef<O, K>) {
        const b = bind(d.obj, d.key, x => x as string);
        return this.push(new UI_FIELD_GLSL(this.body, d.label, String(d.key), {
            get: () => b.target()[d.key] as unknown as string,
            set: v => { b.target()[d.key] = v as O[K]; },
            def: b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, d), d);
    }

    /** a small heading inside the section, to group the rows that follow it. */
    subtitle(text: string) {
        const el = document.createElement("div");
        el.className = "subtitle";
        el.textContent = text;
        this.body.appendChild(el);
        return el;                      // returned so callers can hide or rename it
    }

    /** a thin horizontal rule between groups of rows. */
    separator() {
        const el = document.createElement("hr");
        el.className = "sep";
        this.body.appendChild(el);
        return el;
    }

    private push<E extends UI_FIELD<any>>(e: E, d: { label: string; obj: unknown; persist?: boolean; track?: boolean; keep_on_reset?: boolean }) {
        if (d.persist !== false && typeof d.obj !== "function") e.pid = `${this.name}.${d.label}`;
        e.track = d.track !==  false;
        e.keep_on_reset = d.keep_on_reset === true;
        this.fields.push(e);
        return e;
    }

    float<O extends object, K extends NumKey<O>>(d: FloatDef<O, K>) {
        const b = bind(d.obj, d.key, x => x as number);
        return this.push(new UI_FIELD_FLOAT(this.body, d.label, String(d.key), {
            get: () => b.target()[d.key] as number,
            set: v => { b.target()[d.key] = v as O[K]; },
            def: b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, { min: d.min ?? -Infinity, max: d.max ?? Infinity, step: d.step,
            int: d.int ?? false, decimals: d.decimals, unit: d.unit, scrub: d.scrub }), d);
    }

    palette<O extends object, K extends NumKey<O>>(d: PaletteDef<O, K>) {
        const b = bind(d.obj, d.key, x => x as number);
        return this.push(new UI_FIELD_PALETTE(this.body, d.label, String(d.key), {
            get: () => b.target()[d.key] as number,
            set: v => { b.target()[d.key] = v as O[K]; },
            def: b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, d.colors, d.onAdd, d.removable, d.onRemove), d);
    }
}