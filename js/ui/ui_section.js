"use strict";
class UI_SECTION {
    name;
    el = document.createElement("section");
    body = document.createElement("div");
    fields = [];
    visible;
    /** Collection of all the modified field labels. */
    mod_labels = [];
    badge = document.createElement("span");
    constructor(name, visible, open = true) {
        this.name = name;
        const h3 = document.createElement("h3");
        h3.textContent = name;
        h3.addEventListener("click", () => this.open(!this.is_open));
        this.badge.className = "mods";
        this.badge.hidden = true;
        h3.appendChild(this.badge);
        UI_TOOLTIP.attach(this.badge, () => this.mod_tip());
        this.body.className = "body";
        this.el.dataset.id = name;
        this.el.append(h3, this.body);
        this.open(open);
        this.visible = visible;
    }
    mod_tip() {
        const n = this.mod_labels.length;
        return `$Modified$ ` +
            `{[${n}] ${n === 1 ? "setting differs" : "settings differ"} from the default in this section.} ` +
            `{${this.mod_labels.join("\n")}} ` +
            `{Double-click a row to reset it.}`;
    }
    get is_open() { return this.el.classList.contains("open"); }
    open(v = true) { this.el.classList.toggle("open", v); }
    set_visible(visible, open_on_show = true) {
        const v = !visible;
        if (v === this.el.hidden)
            return;
        this.el.hidden = v;
        if (visible && open_on_show)
            this.open(true);
    }
    toggle_visibility() { this.set_visible(this.el.hidden); }
    refresh_visibility() {
        if (this.visible)
            this.set_visible(this.visible());
    }
    refresh() {
        this.refresh_visibility();
        if (!this.el.hidden)
            this.fields.forEach(e => e.refresh());
        const mods = this.fields.filter(e => e.modified);
        this.mod_labels = mods.map(e => e.label);
        this.badge.hidden = mods.length === 0;
        this.badge.textContent = `● ${mods.length}`;
        return mods.length;
    }
    slider(d) {
        const b = bind(d.obj, d.key, x => x);
        return this.push(new UI_FIELD_SLIDER(this.body, d.label, String(d.key), {
            get: () => b.target()[d.key],
            set: v => { b.target()[d.key] = v; },
            def: b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, { min: () => SrcVal(d.min), max: () => SrcVal(d.max), step: d.step, log: d.log ?? false, int: d.int ?? false }), d);
    }
    toggle(d) {
        const b = bind(d.obj, d.key, x => x);
        return this.push(new UI_FIELD_TOGGLE(this.body, d.label, String(d.key), {
            get: () => b.target()[d.key],
            set: v => { b.target()[d.key] = v; },
            def: b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, d.int ?? false), d);
    }
    enum(d) {
        const b = bind(d.obj, d.key, x => x);
        return this.push(new UI_FIELD_ENUM(this.body, d.label, String(d.key), {
            get: () => b.target()[d.key],
            set: v => { b.target()[d.key] = v; },
            def: b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, () => SrcVal(d.options)), d);
    }
    vec(n, d) {
        const arr = (t) => t[d.key];
        const read = (t) => Array.from({ length: n }, (_, i) => arr(t)[i]);
        const b = bind(d.obj, d.key, () => read(SrcVal(d.obj)));
        return this.push(new UI_FIELD_VECTOR(this.body, d.label, String(d.key), {
            get: () => read(b.target()),
            set: v => { const a = arr(b.target()); for (let i = 0; i < n; ++i)
                a[i] = v[i]; }, // in place
            def: b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, n, { min: d.min ?? -Infinity, max: d.max ?? Infinity, step: d.step, labels: d.labels ?? "xyzw" }), d);
    }
    vec2(d) { return this.vec(2, d); }
    vec3(d) { return this.vec(3, d); }
    vec4(d) { return this.vec(4, d); }
    color(d) {
        const arr = (t) => t[d.key];
        const read = (t) => [arr(t)[0], arr(t)[1], arr(t)[2]];
        const b = bind(d.obj, d.key, () => read(SrcVal(d.obj)));
        return this.push(new UI_FIELD_COLOR(this.body, d.label, String(d.key), {
            get: () => read(b.target()),
            set: v => { const a = arr(b.target()); for (let i = 0; i < 3; ++i)
                a[i] = v[i]; }, // in place
            def: b.def, frozen: d.frozen, onChange: d.onPick,
            visible: d.visible, tooltip: d.tooltip
        }), d);
    }
    glsl(d) {
        const b = bind(d.obj, d.key, x => x);
        return this.push(new UI_FIELD_GLSL(this.body, d.label, String(d.key), {
            get: () => b.target()[d.key],
            set: v => { b.target()[d.key] = v; },
            def: b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, d), d);
    }
    /** a small heading inside the section, to group the rows that follow it. */
    subtitle(text) {
        const el = document.createElement("div");
        el.className = "subtitle";
        el.textContent = text;
        this.body.appendChild(el);
        return el; // returned so callers can hide or rename it
    }
    /** a thin horizontal rule between groups of rows. */
    separator() {
        const el = document.createElement("hr");
        el.className = "sep";
        this.body.appendChild(el);
        return el;
    }
    push(e, d) {
        if (d.persist !== false && typeof d.obj !== "function")
            e.pid = `${this.name}.${d.label}`;
        e.track = d.track !== false;
        this.fields.push(e);
        return e;
    }
    float(d) {
        const b = bind(d.obj, d.key, x => x);
        return this.push(new UI_FIELD_FLOAT(this.body, d.label, String(d.key), {
            get: () => b.target()[d.key],
            set: v => { b.target()[d.key] = v; },
            def: b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, { min: d.min ?? -Infinity, max: d.max ?? Infinity, step: d.step,
            int: d.int ?? false, decimals: d.decimals }), d);
    }
    palette(d) {
        const b = bind(d.obj, d.key, x => x);
        return this.push(new UI_FIELD_PALETTE(this.body, d.label, String(d.key), {
            get: () => b.target()[d.key],
            set: v => { b.target()[d.key] = v; },
            def: b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, d.colors, d.onAdd), d);
    }
}
