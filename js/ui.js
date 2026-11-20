"use strict";
const $ = (id) => document.getElementById(id);
const TOOL_ICONS = [
    '<path d="M12 3c3 4 5 6.5 5 9.5a5 5 0 0 1-10 0C7 9.5 9 7 12 3z"/><path d="M4 20h9m-3-3 3 3-3 3"/>',
    '<path d="M12 3c3 4 5 6.5 5 9.5a5 5 0 0 1-10 0C7 9.5 9 7 12 3z"/>',
    '<path d="M4 8h10a3 3 0 1 0-3-3M4 13h14a3 3 0 1 1-3 3M4 18h7"/>',
    '<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M4 12h16M10 5v7M15 12v7"/>',
];
const FORCE_ICON = '<path d="M13 5.5c-1.8-1-3.4 0-3.7 2L8 19c-.3 1.6-1.4 2.300-2.800 1.600"/>' +
    '<path d="M5.500 11.500h7"/>' +
    '<path d="M15.500 13.500l4.500 5.500m0-5.500l-4.500 5.500" stroke-width="1.400"/>', BORDERS_ICON = '<path d="M4 4h5M15 4h5"/>' + '<path d="M4 20h5M15 20h5"/>' +
    '<path d="M4 4v5M4 15v5"/>' + '<path d="M20 4v5M20 15v5"/>';
const UNTITLED = "untitled script";
const store = (() => {
    const KEY = "fluid_ui_v1";
    let data = {};
    try {
        data = JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {};
    }
    catch { }
    let timer = 0;
    const flush = () => { clearTimeout(timer); try {
        localStorage.setItem(KEY, JSON.stringify(data));
    }
    catch { } };
    const queue = () => { clearTimeout(timer); timer = window.setTimeout(flush, 250); };
    addEventListener("pagehide", flush); // never lose the last edit on refresh/close
    return {
        get: (id) => data[id],
        set: (id, v) => { data[id] = v; queue(); },
        del: (id) => { delete data[id]; queue(); },
    };
})();
function same(a, b) {
    if (typeof a === "boolean" || typeof b === "boolean")
        return Number(a) === Number(b);
    if (typeof a === "number" && typeof b === "number")
        return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
    if (Array.isArray(a) && Array.isArray(b))
        return a.length === b.length && a.every((x, i) => same(x, b[i]));
    return a === b;
}
const val = (s) => (typeof s === "function" ? s() : s);
/** resolves a lazy target and remembers each target's initial value (for reset). */
function bind(obj, key, copy) {
    const defaults = new WeakMap();
    const target = () => {
        const t = val(obj);
        if (!defaults.has(t))
            defaults.set(t, copy(t[key]));
        return t;
    };
    target();
    return { target, def: () => defaults.get(target()) };
}
function isolate(el) {
    for (const ev of ["mousedown", "contextmenu"])
        el.addEventListener(ev, e => e.stopPropagation());
}
/** true when the event comes from a form control. */
function in_field(e) {
    const t = e.target;
    return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" ||
        t.tagName === "SELECT" || t.isContentEditable);
}
/** form control or a modifier combo. Use this in component hotkeys. */
function is_typing(e) { return in_field(e) || e.ctrlKey || e.metaKey || e.altKey; }
function render_tooltip(src) {
    const esc_ = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const inline = (s) => esc_(s).replace(/\[([^\]]+)\]/g, '<b class="tv">$1</b>').replace(/\n/g, "<br>");
    let out = "";
    // order matters: $$..$$ before $..$
    const re = /\$\$([\s\S]*?)\$\$|\$([\s\S]*?)\$|\{([\s\S]*?)\}/g;
    let m;
    while ((m = re.exec(src))) {
        if (m[1] !== undefined)
            out += `<div class="tt-h2">${inline(m[1].trim())}</div>`;
        else if (m[2] !== undefined)
            out += `<div class="tt-h1">${inline(m[2].trim())}</div>`;
        else {
            const lines = m[3].trim();
            const cls = lines.includes("\n") ? "tt-p tt-list" : "tt-p";
            out += `<div class="${cls}">${inline(lines)}</div>`;
        }
    }
    return out;
}
/** one shared floating tooltip for the whole UI. */
class UI_TOOLTIP {
    static el;
    static timer = 0;
    static ensure() {
        if (this.el)
            return;
        this.el = document.createElement("div");
        this.el.className = "tt";
        this.el.hidden = true;
        $("hud").appendChild(this.el);
    }
    /** attaches a rich tooltip to an element. */
    static attach(target, src, delay = 350) {
        this.ensure();
        target.addEventListener("mouseenter", () => {
            clearTimeout(this.timer);
            this.timer = window.setTimeout(() => this.show(target, render_tooltip(typeof src === "function" ? src() : src)), delay);
        });
        const hide = () => { clearTimeout(this.timer); this.el.hidden = true; };
        target.addEventListener("mouseleave", hide);
        target.addEventListener("mousedown", hide);
    }
    static show(target, html) {
        this.el.innerHTML = html;
        this.el.hidden = false;
        const r = target.getBoundingClientRect();
        const w = this.el.offsetWidth, h = this.el.offsetHeight;
        // prefer the left of the target (the inspector sits on the right edge)
        let x = r.left - w - 10;
        if (x < 8)
            x = Math.min(r.right + 10, innerWidth - w - 8);
        let y = r.top + r.height / 2 - h / 2;
        y = Math.max(8, Math.min(y, innerHeight - h - 8));
        this.el.style.left = `${x}px`;
        this.el.style.top = `${y}px`;
    }
}
class UI_ELEMENT {
    io;
    row = document.createElement("div");
    pid = "";
    track = true;
    label;
    constructor(parent, label, title, io, row_class = "") {
        this.io = io;
        const set = io.set;
        this.label = label;
        this.io = { ...io, set: (v) => { set(v); this.save(v); this.update_mod(); } };
        this.row.className = ("row " + row_class).trim();
        const l = document.createElement("label");
        l.textContent = label;
        if (io.tooltip)
            UI_TOOLTIP.attach(l, io.tooltip);
        else
            l.title = title;
        this.row.appendChild(l);
        parent.appendChild(this.row);
    }
    /** true when the current value differs from the original default. */
    get modified() {
        if (!this.track || this.is_frozen)
            return false;
        return !same(this.io.get(), this.io.def());
    }
    update_mod() { this.row.classList.toggle("mod", this.modified); }
    set_visible(visible) {
        this.row.hidden = !visible;
    }
    toggle_visibility() { this.row.hidden = !this.row.hidden; }
    refresh_visibility() {
        this.io.visible && this.set_visible(this.io.visible());
    }
    refresh() {
        this.refresh_visibility();
        this.update_mod();
        if (!this.row.hidden)
            this.refresh_value();
    }
    get is_frozen() { return this.io.frozen?.() !== undefined; }
    /** greys out and disables every input in the row. */
    lock(on) {
        this.row.classList.toggle("frozen", on);
        this.row.querySelectorAll("input,select")
            .forEach(i => { i.disabled = on; });
    }
    save(v) {
        if (this.pid)
            store.set(this.pid, Array.isArray(v) ? v.slice() : v);
    }
    /** persists the current value. Call it after changing the bound object from code. */
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
            store.del(this.pid); // default, not persisted
    }
}
class UI_SLIDER extends UI_ELEMENT {
    o;
    in_range = document.createElement("input");
    in_number = document.createElement("input");
    constructor(parent, label, key, io, o) {
        super(parent, label, key, io);
        this.o = o;
        this.in_range.type = "range";
        this.in_range.min = "0";
        this.in_range.max = "1000";
        this.in_number.type = "number";
        this.row.append(this.in_range, this.in_number);
        this.in_range.addEventListener("input", () => this.apply(this.from_t(+this.in_range.value / 1000)));
        // leave the slider after a mouse drag, so the global arrow hotkeys work again.
        // keyboard focus (Tab) keeps it, so arrows can still move the slider.
        this.in_range.addEventListener("pointerup", () => this.in_range.blur());
        this.in_number.addEventListener("change", () => {
            const v = parseFloat(this.in_number.value);
            Number.isNaN(v) ? this.refresh_value() : this.apply(v);
        });
        this.row.addEventListener("dblclick", e => { if (e.target !== this.in_number)
            this.reset(); });
        this.refresh_value();
        this.drag();
    }
    to_t(v) {
        const min = this.o.min(), max = this.o.max();
        if (max <= min)
            return 0;
        return this.o.log ? (Math.log(Math.max(v, min)) - Math.log(min)) / (Math.log(max) - Math.log(min))
            : (v - min) / (max - min);
    }
    from_t(t) {
        const min = this.o.min(), max = this.o.max();
        return this.o.log ? Math.exp(Math.log(min) + t * (Math.log(max) - Math.log(min)))
            : min + t * (max - min);
    }
    apply(v) {
        if (this.is_frozen)
            return this.refresh_value();
        const { log, int, step } = this.o;
        const min = this.o.min(), max = this.o.max();
        if (int)
            v = Math.round(v);
        if (step && !log)
            v = Math.round(v / step) * step;
        v = Math.min(max, Math.max(min, v));
        this.io.set(v);
        this.io.onChange?.(v);
        this.refresh_value();
    }
    refresh_value() {
        const max = this.o.max(), min = this.o.min();
        const cur = this.io.get();
        if (!this.is_frozen && (cur > max || cur < min))
            this.io.set(Math.min(max, Math.max(min, cur)));
        const forced = this.io.frozen?.();
        const v = forced ?? this.io.get();
        const { int, step } = this.o;
        const decimals = int ? 0
            : Math.max(0, Math.ceil(-Math.log10(step ?? ((this.o.max() - this.o.min()) / 200 || 1))));
        this.in_range.value = String(Math.min(1, Math.max(0, this.to_t(v))) * 1000);
        this.in_number.step = String(10 ** -decimals); // arrow keys step by the displayed precision
        if (document.activeElement !== this.in_number)
            this.in_number.value = v.toFixed(decimals);
        this.lock(forced !== undefined);
    }
    drag() {
        let active = false, moved = false, y0 = 0, v0 = 0;
        const decimals = this.o.int ? 0
            : Math.max(0, Math.ceil(-Math.log10(this.o.step ?? ((this.o.max() - this.o.min()) / 200 || 1))));
        const base = () => this.o.step ?? (this.o.int ? 1 : this.o.step ?? 10 ** -decimals);
        // keep the first click from focusing the box, so a drag doesn't start a text edit
        this.in_number.addEventListener("mousedown", e => {
            if (document.activeElement !== this.in_number)
                e.preventDefault();
        });
        this.in_number.addEventListener("pointerdown", e => {
            if (e.button !== 0 || this.is_frozen || document.activeElement === this.in_number)
                return;
            active = true;
            moved = false;
            y0 = e.clientY;
            v0 = this.io.get();
            this.in_number.setPointerCapture(e.pointerId);
        });
        this.in_number.addEventListener("pointermove", e => {
            if (!active)
                return;
            if (!moved && Math.abs(e.clientY - y0) < 3)
                return; // small dead zone, so clicks stay clicks
            moved = true;
            const k = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
            this.apply(v0 + (y0 - e.clientY) * base() * k);
        });
        const end = (e) => {
            if (!active)
                return;
            active = false;
            this.in_number.releasePointerCapture(e.pointerId);
            if (!moved) {
                this.in_number.focus();
                this.in_number.select();
            }
        };
        this.in_number.addEventListener("pointerup", end);
        this.in_number.addEventListener("pointercancel", end);
    }
}
class UI_FLOAT extends UI_ELEMENT {
    o;
    input = document.createElement("input");
    decimals;
    constructor(parent, label, key, io, o) {
        super(parent, label, key, io, "float");
        this.o = o;
        this.decimals = o.int ? 0
            : o.decimals ?? (o.step ? Math.max(0, Math.ceil(-Math.log10(o.step))) : 3);
        this.input.type = "number";
        this.input.step = String(o.step ?? 10 ** -this.decimals);
        this.row.appendChild(this.input);
        this.input.addEventListener("change", () => {
            const v = parseFloat(this.input.value);
            Number.isNaN(v) ? this.refresh_value() : this.apply(v);
        });
        this.row.addEventListener("dblclick", e => { if (e.target !== this.input)
            this.reset(); });
        this.refresh_value();
        this.drag();
    }
    drag() {
        let active = false, moved = false, y0 = 0, v0 = 0;
        const base = () => this.o.speed ?? (this.o.int ? 1 : this.o.step ?? 10 ** -this.decimals);
        // keep the first click from focusing the box, so a drag doesn't start a text edit
        this.input.addEventListener("mousedown", e => {
            if (document.activeElement !== this.input)
                e.preventDefault();
        });
        this.input.addEventListener("pointerdown", e => {
            if (e.button !== 0 || this.is_frozen || document.activeElement === this.input)
                return;
            active = true;
            moved = false;
            y0 = e.clientY;
            v0 = this.io.get();
            this.input.setPointerCapture(e.pointerId);
        });
        this.input.addEventListener("pointermove", e => {
            if (!active)
                return;
            if (!moved && Math.abs(e.clientY - y0) < 3)
                return; // small dead zone, so clicks stay clicks
            moved = true;
            const k = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
            this.apply(v0 + (y0 - e.clientY) * base() * k);
        });
        const end = (e) => {
            if (!active)
                return;
            active = false;
            this.input.releasePointerCapture(e.pointerId);
            if (!moved) {
                this.input.focus();
                this.input.select();
            }
        };
        this.input.addEventListener("pointerup", end);
        this.input.addEventListener("pointercancel", end);
    }
    apply(v) {
        if (this.is_frozen)
            return this.refresh_value();
        const { min, max, step, int } = this.o;
        if (int)
            v = Math.round(v);
        if (step)
            v = Math.round(v / step) * step;
        v = Math.min(max, Math.max(min, v));
        this.io.set(v);
        this.io.onChange?.(v);
        this.refresh_value();
    }
    refresh_value() {
        const forced = this.io.frozen?.();
        const v = forced ?? this.io.get();
        if (document.activeElement !== this.input)
            this.input.value = v.toFixed(this.decimals);
        this.lock(forced !== undefined);
    }
}
class UI_TOGGLE extends UI_ELEMENT {
    int;
    input = document.createElement("input");
    constructor(parent, label, key, io, int) {
        super(parent, label, key, io, "toggle");
        this.int = int;
        this.input.type = "checkbox";
        this.row.appendChild(this.input);
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
class UI_VECTOR extends UI_ELEMENT {
    n;
    o;
    inputs = [];
    decimals;
    constructor(parent, label, key, io, n, o) {
        super(parent, label, key, io, "vec");
        this.n = n;
        this.o = o;
        this.decimals = o.step ? Math.max(0, Math.ceil(-Math.log10(o.step))) : 3;
        const comps = document.createElement("div");
        comps.className = "comps";
        comps.style.setProperty("--n", String(n));
        for (let i = 0; i < n; ++i) {
            const c = document.createElement("span");
            c.className = "c";
            const axis = document.createElement("i");
            axis.textContent = o.labels[i] ?? "xyzw"[i];
            this.scrub(axis, i);
            const input = document.createElement("input");
            input.type = "number";
            input.step = String(o.step ?? 10 ** -this.decimals);
            input.addEventListener("change", () => {
                const x = parseFloat(input.value);
                if (Number.isNaN(x))
                    return this.refresh_value();
                const v = this.io.get();
                v[i] = x;
                this.apply(v);
            });
            c.append(axis, input);
            comps.appendChild(c);
            this.inputs.push(input);
        }
        this.row.appendChild(comps);
        this.row.addEventListener("dblclick", e => {
            if (!(e.target instanceof HTMLInputElement))
                this.reset();
        });
        this.refresh_value();
    }
    scrub(axis, i) {
        let x0 = 0, v0 = 0;
        axis.addEventListener("pointerdown", e => {
            if (this.is_frozen)
                return;
            axis.setPointerCapture(e.pointerId);
            x0 = e.clientX;
            v0 = this.io.get()[i];
            e.preventDefault();
        });
        axis.addEventListener("pointermove", e => {
            if (!axis.hasPointerCapture(e.pointerId))
                return;
            const speed = (this.o.step ?? 0.01) * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1);
            const v = this.io.get();
            v[i] = v0 + (e.clientX - x0) * speed;
            this.apply(v);
        });
    }
    apply(v) {
        if (this.is_frozen)
            return this.refresh_value();
        const { min, max, step } = this.o;
        const out = v.slice(0, this.n).map(x => {
            if (step)
                x = Math.round(x / step) * step;
            return Math.min(max, Math.max(min, x));
        });
        this.io.set(out);
        this.io.onChange?.(out);
        this.refresh_value();
    }
    refresh_value() {
        const forced = this.io.frozen?.();
        const v = forced ?? this.io.get();
        this.inputs.forEach((inp, i) => {
            if (document.activeElement !== inp)
                inp.value = v[i].toFixed(this.decimals);
        });
        this.lock(forced !== undefined);
    }
}
class UI_ENUM extends UI_ELEMENT {
    options;
    select = document.createElement("select");
    shown = null;
    constructor(parent, label, key, io, options) {
        super(parent, label, key, io, "enum");
        this.options = options;
        this.row.appendChild(this.select);
        this.select.addEventListener("change", () => { this.apply(+this.select.value); this.select.blur(); });
        this.row.addEventListener("dblclick", e => { if (e.target !== this.select)
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
class UI_COLOR extends UI_ELEMENT {
    inputs = [];
    picker = document.createElement("input");
    swatch = document.createElement("label");
    constructor(parent, label, key, io) {
        super(parent, label, key, io, "color");
        // native color dialog, behind the square swatch
        this.swatch.className = "swatch";
        this.picker.type = "color";
        this.swatch.appendChild(this.picker);
        this.picker.addEventListener("input", () => {
            const n = parseInt(this.picker.value.slice(1), 16);
            this.apply([((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]);
        });
        // numeric view, 0..1
        const comps = document.createElement("div");
        comps.className = "comps";
        comps.style.setProperty("--n", "3");
        "rgb".split("").forEach((axis, i) => {
            const c = document.createElement("span");
            c.className = "c";
            const a = document.createElement("i");
            a.textContent = axis;
            this.scrub(a, i);
            const input = document.createElement("input");
            input.type = "number";
            input.step = "0.01";
            input.addEventListener("change", () => {
                const x = parseFloat(input.value);
                if (Number.isNaN(x))
                    return this.refresh_value();
                const v = this.io.get();
                v[i] = x;
                this.apply(v);
            });
            c.append(a, input);
            comps.appendChild(c);
            this.inputs.push(input);
        });
        this.row.append(comps, this.swatch);
        this.row.addEventListener("dblclick", e => {
            if (!(e.target instanceof HTMLInputElement))
                this.reset();
        });
        this.refresh_value();
    }
    /** drag an axis letter left/right to change that channel (shift = x10, alt = x0.1). */
    scrub(axis, i) {
        let x0 = 0, v0 = 0;
        axis.addEventListener("pointerdown", e => {
            if (this.is_frozen)
                return;
            axis.setPointerCapture(e.pointerId);
            x0 = e.clientX;
            v0 = this.io.get()[i];
            e.preventDefault();
        });
        axis.addEventListener("pointermove", e => {
            if (!axis.hasPointerCapture(e.pointerId))
                return;
            const speed = 0.013 * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1);
            const v = this.io.get();
            v[i] = v0 + (e.clientX - x0) * speed;
            this.apply(v);
        });
    }
    static hex(v) {
        return "#" + [0, 1, 2].map(i => Math.round(Math.min(1, Math.max(0, v[i])) * 255).toString(16).padStart(2, "0")).join("");
    }
    apply(v) {
        if (this.is_frozen)
            return this.refresh_value();
        const out = v.slice(0, 3).map(x => Math.min(1, Math.max(0, x)));
        this.io.set(out);
        this.io.onChange?.(out);
        this.refresh_value();
    }
    refresh_value() {
        const forced = this.io.frozen?.();
        const v = forced ?? this.io.get();
        this.inputs.forEach((inp, i) => {
            if (document.activeElement !== inp)
                inp.value = v[i].toFixed(2);
        });
        const hex = UI_COLOR.hex(v);
        // only write when it differs, so a live drag isn't fought by the 8-bit round trip
        if (this.picker.value !== hex)
            this.picker.value = hex;
        this.swatch.style.setProperty("--c", hex);
        this.lock(forced !== undefined);
    }
}
/** basic structural lint, 1-based lines. */
function lint_glsl(src, required_fn) {
    const out = [];
    const lines = src.split("\n");
    const stack = [];
    const pair = { ")": "(", "]": "[", "}": "{" };
    let in_block = false;
    lines.forEach((raw, i) => {
        let l = raw;
        if (in_block) { // inside /* ... */
            const e = l.indexOf("*/");
            if (e < 0)
                return;
            l = l.slice(e + 2);
            in_block = false;
        }
        l = l.replace(/\/\*.*?\*\//g, "").replace(/\/\/.*/, "");
        if (l.includes("/*")) {
            in_block = true;
            l = l.slice(0, l.indexOf("/*"));
        }
        for (const c of l) {
            if ("([{".includes(c))
                stack.push({ c, line: i + 1 });
            else if (")]}".includes(c)) {
                const top = stack.pop();
                if (!top || top.c !== pair[c])
                    out.push({ line: i + 1, msg: `unmatched '${c}'` });
            }
        }
        if (/\b(while|do)\b/.test(l))
            out.push({ line: i + 1, msg: "while/do loops are not allowed" });
        if (/\bfor\s*\(/.test(l) && !/\bfor\s*\(\s*int\s+\w+\s*=\s*\d+\s*;\s*\w+\s*<=?\s*\d+\s*;/.test(l))
            out.push({ line: i + 1, msg: "for loops need constant bounds: for (int i = 0; i < N; ++i)" });
    });
    for (const s of stack)
        out.push({ line: s.line, msg: `unclosed '${s.c}'` });
    if (required_fn && !new RegExp(`\\b${required_fn}\\s*\\(`).test(src))
        out.push({ line: 1, msg: `missing function '${required_fn}'` });
    return out;
}
class UI_GLSL extends UI_ELEMENT {
    o;
    win = document.createElement("div");
    $title;
    $lib;
    saved = [];
    ta;
    hl;
    sq;
    gut;
    $err;
    errors = [];
    timer = 0;
    built = false;
    $btn;
    busy = false;
    btn_timer = 0;
    $save;
    query = "";
    def_title = "";
    save_timer = 0;
    $unsaved;
    title_prev = "";
    constructor(parent, label, key, io, o) {
        const t = io.tooltip;
        delete io.tooltip;
        super(parent, label, key, io, "glsl");
        this.o = o;
        this.def_title = o.title();
        const b = document.createElement("button");
        b.className = "glsl-open";
        b.textContent = o.button;
        b.addEventListener("click", () => this.open());
        this.row.appendChild(b);
        if (t)
            UI_TOOLTIP.attach(b, t);
    }
    draft() { return this.pid ? store.get(this.pid) : undefined; }
    save_draft() {
        if (this.pid && this.built)
            store.set(this.pid, { label: this.$title.value, src: this.ta.value });
    }
    save() { } // the generic path would store the bare source
    save_now() { }
    show() { this.lock(this.io.frozen?.() !== undefined); }
    apply(v) { if (this.is_frozen)
        return; this.io.set(v); this.io.onChange?.(v); }
    get is_open() { return this.built && !this.win.hidden; }
    open() {
        if (this.is_frozen)
            return;
        if (!this.built)
            this.build();
        this.load_saved();
        const d = this.draft();
        this.ta.value = d?.src ?? this.io.get();
        this.$title.value = d?.label ?? this.o.title();
        this.win.hidden = false;
        this.errors = [];
        this.$err.textContent = "";
        this.render();
        this.ta.focus();
        this.set_btn("idle");
        this.$lib.hidden = true;
        this.update_unsaved();
    }
    close() {
        this.save_draft();
        this.win.hidden = true;
        document.activeElement?.blur();
    }
    /** compiles the editor text. On success the window closes. */
    submit() {
        if (this.busy)
            return;
        this.busy = true;
        this.set_btn("busy");
        const t0 = performance.now();
        // one frame, so the loader is painted before the (synchronous) compile
        requestAnimationFrame(() => setTimeout(() => {
            const result = this.run_compile();
            const wait = Math.max(0, 250 - (performance.now() - t0));
            setTimeout(() => {
                this.busy = false;
                if (result.ok)
                    this.set_btn("ok", 1400);
                // @ts-ignore
                else {
                    this.show_errors(result.errors);
                    this.set_btn("fail");
                } // stays red until the next edit
            }, wait);
        }, 0));
    }
    load_saved() {
        const key = this.o.library?.storage_key;
        if (!key)
            return;
        try {
            this.saved = JSON.parse(localStorage.getItem(key) ?? "[]");
        }
        catch {
            this.saved = [];
        }
    }
    is_stored() {
        const label = this.$title.value.trim(), src = this.ta.value;
        const same = (e) => e.label === label && e.src === src;
        return this.saved.some(same) || (this.o.library?.defaults().some(same) ?? false);
    }
    update_unsaved() {
        if (!this.built)
            return;
        this.$unsaved.hidden = !this.o.library || this.is_stored();
    }
    /** lint, compile and apply. Works without the editor DOM, so restore and reset can use it. */
    try_commit(src, title, restoring) {
        const hard = lint_glsl(src, this.o.required_fn);
        if (hard.length)
            return { ok: false, errors: hard.map(h => ({ ...h, hard: true })) };
        const log = this.o.compile(src, restoring);
        if (log === null) {
            this.apply(src);
            this.o.set_title(title.trim() || this.o.title());
            return { ok: true };
        }
        const found = [];
        for (const m of log.matchAll(/(?:ERROR|WARNING):\s*\d+:(\d+):\s*([^\n]*)/g))
            found.push({ line: Math.max(1, +m[1] - this.o.line_offset), msg: m[2], hard: true });
        return { ok: false, errors: found.length ? found : [{ line: 1, msg: log.trim(), hard: true }] };
    }
    run_compile() {
        const r = this.try_commit(this.ta.value, this.$title.value, false);
        if (r.ok) {
            if (this.pid)
                store.set(this.pid + ".applied", { label: this.o.title(), src: this.ta.value });
            this.errors = [];
            this.$err.textContent = "";
            this.render();
        }
        return r;
    }
    restore() {
        const a = this.pid ? store.get(this.pid + ".applied") : undefined;
        if (a && typeof a.src === "string")
            this.try_commit(a.src, a.label || this.def_title, true);
    }
    reset() {
        if (this.pid) {
            store.del(this.pid);
            store.del(this.pid + ".applied");
        }
        const src = this.io.def();
        this.try_commit(src, this.def_title, true);
        if (this.built) {
            this.ta.value = src;
            this.$title.value = this.def_title;
            this.errors = [];
            this.$err.textContent = "";
            this.set_btn("idle");
            this.render();
            this.update_unsaved();
        }
    }
    show_errors(errs) {
        this.errors = errs;
        this.$err.textContent = errs.map(e => `line ${e.line}: ${e.msg}`).join("\n");
        this.$err.scrollTop = 0;
        this.render();
    }
    render() {
        const src = this.ta.value, lines = src.split("\n");
        this.hl.innerHTML = highlight_glsl(src);
        this.gut.innerHTML = lines.map((_, i) => `<span${this.errors.some(e => e.line === i + 1 && e.hard) ? ' class="e"' : ""}>${i + 1}</span>`).join("\n") + "\n";
        // squiggle layer: same text, transparent, only the error lines underlined
        const bad = new Map(this.errors.map(e => [e.line, e]));
        this.sq.innerHTML = lines.map((l, i) => {
            if (!bad.has(i + 1) || !l.trim())
                return esc(l);
            const lead = l.length - l.trimStart().length, body = l.trimStart();
            return esc(l.slice(0, lead)) + `<span class="sq">${esc(body)}</span>`;
        }).join("\n") + "\n";
        this.sync();
    }
    sync() {
        for (const p of [this.hl, this.sq, this.gut]) {
            p.scrollTop = this.ta.scrollTop;
            p.scrollLeft = p === this.gut ? 0 : this.ta.scrollLeft;
        }
    }
    set_btn(state, revert_ms = 0) {
        clearTimeout(this.btn_timer);
        this.$btn.dataset.state = state;
        this.$btn.querySelector(".lbl").textContent =
            state === "busy" ? "Compiling" : state === "ok" ? "✓ Compiled" : state === "fail" ? "✕ Failed" : "▶ Compile";
        if (revert_ms)
            this.btn_timer = window.setTimeout(() => this.set_btn("idle"), revert_ms);
    }
    build() {
        this.built = true;
        const w = this.win;
        w.className = "glsl-win";
        w.hidden = true;
        w.innerHTML = `
        <header>
            ${this.o.library ? '<button class="lib" title="Browse saved and default fields">▾</button>' : ""}
            <input class="title" spellcheck="false" maxlength="60" title="Click to rename">
            <span class="unsaved" hidden>(unsaved)</span>
            <button class="compile" data-state="idle" title="Ctrl+S">
                <span class="spin"></span><span class="lbl">▶ Compile</span><kbd>Ctrl+S</kbd>
            </button>
            <button class="x" title="Close (Esc)">×</button>
        </header>
        <div class="lib-pop" hidden></div>
        <div class="gbody">
            <pre class="gut" aria-hidden="true"></pre>
            <div class="ed">
                <pre class="hl" aria-hidden="true"></pre>
                <pre class="sqp" aria-hidden="true"></pre>
                <textarea spellcheck="false" autocapitalize="off" autocomplete="off"></textarea>
                <button class="save-snip" title="Save current as a snippet">+ Save</button>
            </div>
        </div>
        <footer class="gerr"></footer>`;
        this.$title = w.querySelector(".title");
        this.$lib = w.querySelector(".lib-pop");
        this.gut = w.querySelector(".gut");
        this.hl = w.querySelector(".hl");
        this.sq = w.querySelector(".sqp");
        this.ta = w.querySelector("textarea");
        this.$err = w.querySelector(".gerr");
        this.$btn = w.querySelector(".compile");
        this.$save = w.querySelector(".save-snip");
        if (!this.o.library)
            this.$save.hidden = true;
        this.$save.addEventListener("click", () => this.save_current());
        w.querySelector(".x").addEventListener("click", () => this.close());
        w.querySelector(".compile").addEventListener("click", () => this.submit());
        this.ta.addEventListener("scroll", () => this.sync());
        this.ta.addEventListener("input", () => {
            this.save_draft();
            this.update_unsaved();
            if (this.$btn.dataset.state === "fail" || this.$btn.dataset.state === "ok")
                this.set_btn("idle");
            this.errors = []; // stale after an edit
            this.$err.textContent = "";
            this.render();
            clearTimeout(this.timer);
            this.timer = window.setTimeout(() => {
                const l = lint_glsl(this.ta.value, this.o.required_fn);
                if (l.length) {
                    this.errors = l.map(x => ({ ...x, hard: false }));
                    this.$err.textContent = "";
                    this.render();
                }
            }, 400);
        });
        w.addEventListener("keydown", e => {
            e.stopPropagation(); // keep global hotkeys out
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                this.submit();
            }
            else if (e.key === "Escape") {
                if (!this.$lib.hidden)
                    this.$lib.hidden = true;
                else
                    this.close();
            }
            else if (e.key === "Tab" && e.target === this.ta) {
                e.preventDefault();
                this.ta.setRangeText("    ", this.ta.selectionStart, this.ta.selectionEnd, "end");
                this.ta.dispatchEvent(new Event("input"));
            }
        });
        this.$unsaved = w.querySelector(".unsaved");
        this.$title.addEventListener("focus", () => { this.title_prev = this.$title.value; });
        this.$title.addEventListener("input", () => { this.save_draft(); this.update_unsaved(); });
        this.$title.addEventListener("change", () => this.rename());
        this.$title.addEventListener("keydown", e => {
            if (e.key === "Enter")
                this.$title.blur();
            else if (e.key === "Escape") { // revert, don't close the window
                this.$title.value = this.title_prev;
                this.save_draft();
                this.update_unsaved();
                this.$title.blur();
                e.stopPropagation();
            }
        });
        w.querySelector(".lib")?.addEventListener("click", e => { e.stopPropagation(); this.toggle_lib(); });
        w.addEventListener("click", e => {
            if (!this.$lib.hidden && !this.$lib.contains(e.target))
                this.$lib.hidden = true;
        });
        isolate(w);
        w.addEventListener("wheel", e => e.stopPropagation(), { passive: true });
        $("hud").appendChild(w);
    }
    refresh_value() { }
    rename() {
        this.$title.value = this.$title.value.trim() || UNTITLED;
        this.save_draft();
        this.update_unsaved();
    }
    $list;
    toggle_lib() {
        if (!this.$lib.hidden) {
            this.$lib.hidden = true;
            return;
        }
        const key = this.o.library.storage_key;
        try {
            this.load_saved();
        }
        catch {
            this.saved = [];
        }
        this.query = "";
        this.$lib.replaceChildren();
        const search = document.createElement("input");
        search.className = "lib-search";
        search.type = "text";
        search.placeholder = "Search…";
        search.spellcheck = false;
        search.addEventListener("input", () => { this.query = search.value; this.render_lib(); });
        search.addEventListener("keydown", e => {
            if (e.key === "Enter") { // load the first match
                const first = this.$list.querySelector(".lib-item");
                first?.click();
            }
        });
        this.$list = document.createElement("div");
        this.$lib.append(search, this.$list);
        this.$lib.hidden = false;
        this.render_lib();
        search.focus();
    }
    render_lib() {
        const list = this.$list;
        list.replaceChildren();
        const q = this.query.trim().toLowerCase();
        const match = (e) => !q || e.label.toLowerCase().includes(q);
        const group = (name, items, deletable) => {
            const shown = items.filter(match);
            if (!shown.length)
                return;
            const h = document.createElement("div");
            h.className = "lib-h";
            h.textContent = name;
            list.appendChild(h);
            for (const it of shown) {
                const row = document.createElement("div");
                row.className = "lib-item";
                const s = document.createElement("span");
                s.textContent = it.label;
                row.appendChild(s);
                row.addEventListener("click", () => this.pick(it));
                if (deletable) {
                    const x = document.createElement("button");
                    x.textContent = "×";
                    x.title = "Delete";
                    x.addEventListener("click", e => {
                        e.stopPropagation();
                        this.saved.splice(this.saved.indexOf(it), 1); // index in the full list, not the filtered one
                        this.persist();
                        this.update_unsaved();
                        this.render_lib();
                    });
                    row.appendChild(x);
                }
                list.appendChild(row);
            }
        };
        group("Saved", this.saved, true);
        group("Default", this.o.library.defaults(), false);
        if (!list.firstChild) {
            const none = document.createElement("div");
            none.className = "lib-empty";
            none.textContent = "No matches";
            list.appendChild(none);
        }
    }
    persist() {
        try {
            localStorage.setItem(this.o.library.storage_key, JSON.stringify(this.saved));
        }
        catch { }
    }
    pick(e) {
        this.$lib.hidden = true;
        this.ta.value = e.src;
        this.$title.value = e.label;
        this.save_draft();
        this.update_unsaved();
        this.errors = [];
        this.$err.textContent = "";
        this.set_btn("idle");
        this.render();
        this.submit();
    }
    flash_save(text) {
        this.$save.textContent = text;
        clearTimeout(this.save_timer);
        this.save_timer = window.setTimeout(() => { this.$save.textContent = "+ Save"; }, 1200);
    }
    save_current() {
        const label = this.$title.value.trim();
        if (!label || label === UNTITLED) {
            this.$title.focus();
            this.$title.select();
            return this.flash_save("Name it first");
        }
        else if (this.o.library?.defaults().some(d => d.label === label && d.src !== this.ta.value)) {
            this.$title.focus();
            this.$title.select();
            return this.flash_save("Name taken");
        }
        this.load_saved();
        const entry = { label, src: this.ta.value };
        const i = this.saved.findIndex(s => s.label === label);
        if (i >= 0)
            this.saved[i] = entry;
        else
            this.saved.push(entry);
        this.persist();
        this.save_draft();
        this.update_unsaved();
        this.flash_save(i >= 0 ? "✓ Updated" : "✓ Saved");
        if (!this.$lib.hidden)
            this.render_lib();
    }
}
class UI_SECTION {
    name;
    el = document.createElement("section");
    body = document.createElement("div");
    elements = [];
    visible;
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
            this.elements.forEach(e => e.refresh());
        const mods = this.elements.filter(e => e.modified);
        this.mod_labels = mods.map(e => e.label);
        this.badge.hidden = mods.length === 0;
        this.badge.textContent = `● ${mods.length}`;
        return mods.length;
    }
    slider(d) {
        const b = bind(d.obj, d.key, x => x);
        return this.push(new UI_SLIDER(this.body, d.label, String(d.key), {
            get: () => b.target()[d.key],
            set: v => { b.target()[d.key] = v; },
            def: b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, { min: () => val(d.min), max: () => val(d.max), step: d.step, log: d.log ?? false, int: d.int ?? false }), d);
    }
    toggle(d) {
        const b = bind(d.obj, d.key, x => x);
        return this.push(new UI_TOGGLE(this.body, d.label, String(d.key), {
            get: () => b.target()[d.key],
            set: v => { b.target()[d.key] = v; },
            def: b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, d.int ?? false), d);
    }
    enum(d) {
        const b = bind(d.obj, d.key, x => x);
        return this.push(new UI_ENUM(this.body, d.label, String(d.key), {
            get: () => b.target()[d.key],
            set: v => { b.target()[d.key] = v; },
            def: b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, () => val(d.options)), d);
    }
    vec(n, d) {
        const arr = (t) => t[d.key];
        const read = (t) => Array.from({ length: n }, (_, i) => arr(t)[i]);
        const b = bind(d.obj, d.key, () => read(val(d.obj)));
        return this.push(new UI_VECTOR(this.body, d.label, String(d.key), {
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
        const b = bind(d.obj, d.key, () => read(val(d.obj)));
        return this.push(new UI_COLOR(this.body, d.label, String(d.key), {
            get: () => read(b.target()),
            set: v => { const a = arr(b.target()); for (let i = 0; i < 3; ++i)
                a[i] = v[i]; }, // in place
            def: b.def, frozen: d.frozen, onChange: d.onPick,
            visible: d.visible, tooltip: d.tooltip
        }), d);
    }
    glsl(d) {
        const b = bind(d.obj, d.key, x => x);
        return this.push(new UI_GLSL(this.body, d.label, String(d.key), {
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
        this.elements.push(e);
        return e;
    }
    float(d) {
        const b = bind(d.obj, d.key, x => x);
        return this.push(new UI_FLOAT(this.body, d.label, String(d.key), {
            get: () => b.target()[d.key],
            set: v => { b.target()[d.key] = v; },
            def: b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, { min: d.min ?? -Infinity, max: d.max ?? Infinity, step: d.step,
            int: d.int ?? false, decimals: d.decimals }), d);
    }
}
class UI_PALETTE {
    palette;
    onPick;
    onAdd;
    section;
    grid = document.createElement("div");
    current;
    constructor(section, palette, picked, onPick, onAdd) {
        this.palette = palette;
        this.onPick = onPick;
        this.onAdd = onAdd;
        this.section = section;
        this.current = picked;
        this.grid.id = "color-picker";
        section.body.appendChild(this.grid);
        this.render();
    }
    static hex(c) {
        return "#" + [c[0], c[1], c[2]].map(v => v.toString(16).padStart(2, "0")).join("");
    }
    /** rebuilds the swatches, call after changing the palette array. */
    render() {
        this.grid.replaceChildren();
        this.palette.forEach((c, i) => {
            const b = document.createElement("button");
            b.className = "sw";
            b.style.setProperty("--c", UI_PALETTE.hex(c.color));
            b.title = UI_PALETTE.hex(c.color);
            b.addEventListener("click", () => this.pick(i));
            this.grid.appendChild(b);
        });
        if (this.onAdd) {
            const add = document.createElement("label");
            add.className = "sw add";
            add.title = "Add color";
            add.innerHTML = `<span>+</span><input type="color" value="#ffffff">`;
            const inp = add.querySelector("input");
            inp.addEventListener("change", () => {
                const n = parseInt(inp.value.slice(1), 16);
                this.onAdd(get_color_data(new Uint8Array([(n >> 16) & 255, (n >> 8) & 255, n & 255, 255])));
                this.render();
                this.pick(this.palette.length - 1);
            });
            this.grid.appendChild(add);
        }
        this.highlight(Math.min(this.current, this.palette.length - 1));
    }
    highlight(i) {
        this.current = i;
        this.grid.querySelectorAll(".sw:not(.add)")
            .forEach((b, k) => b.classList.toggle("picked", k === i));
    }
    /** selects a swatch; notify=false only moves the highlight (use it when code changed the color). */
    pick(i, notify = true) {
        this.highlight(i);
        if (notify)
            this.onPick(i);
    }
    get picked() { return this.current; }
    toggle_visibility() {
        this.section.toggle_visibility();
    }
}
class UI_INSPECTOR {
    root = $("inspector");
    body = $("insp-body");
    btn = $("insp-toggle");
    sections = new Map();
    constructor() {
        isolate(this.root);
        this.btn.addEventListener("click", () => this.collapse(!this.collapsed));
        $("insp-reset").addEventListener("click", e => { this.reset_all(); e.currentTarget.blur(); });
        this.init_resize();
    }
    reset_all() {
        for (const s of this.sections.values())
            for (const e of s.elements)
                e.reset();
        this.refresh();
    }
    restore_all() {
        for (const s of this.sections.values())
            for (const e of s.elements)
                e.restore();
        this.refresh();
    }
    get collapsed() { return this.root.classList.contains("min"); }
    collapse(v = true) {
        this.root.classList.toggle("min", v);
        this.btn.textContent = v ? "+" : "–";
    }
    /** returns the section, creating it on first use. */
    section(name, visible, open = true) {
        let s = this.sections.get(name);
        if (!s) {
            s = new UI_SECTION(name, visible, open);
            this.sections.set(name, s);
            this.body.appendChild(s.el);
        }
        return s;
    }
    /** builds the palette section (always first) and its swatch grid. */
    palette(palette, picked, onPick, onAdd) {
        const s = new UI_SECTION("Palette", () => mouse.mode === MOUSE_MODE_DYE || mouse.mode === MOUSE_MODE_DYE_FORCE, true);
        this.sections.set("Palette", s);
        this.body.append(s.el);
        return new UI_PALETTE(s, palette, picked, onPick, onAdd);
    }
    /** opens one section and closes the others (the pinned palette stays as it is). */
    focus(name) {
        const target = this.sections.get(name);
        if (!target)
            return;
        target.open(true);
        target.el.scrollIntoView({ block: "nearest" });
    }
    refresh() {
        let n = 0;
        for (const s of this.sections.values())
            n += s.refresh();
        $("insp-reset").classList.toggle("dirty", n > 0);
    }
    toggle_visibility() {
        this.root.hidden = !this.root.hidden;
    }
    init_resize() {
        const handle = $("insp-resize");
        const MIN = 240, MAX = () => Math.min(720, innerWidth - 120);
        const saved = parseInt(localStorage.getItem("insp_w") ?? "", 10);
        if (saved)
            this.root.style.width = `${Math.min(MAX(), Math.max(MIN, saved))}px`;
        handle.addEventListener("pointerdown", e => {
            handle.setPointerCapture(e.pointerId);
            const x0 = e.clientX, w0 = this.root.getBoundingClientRect().width;
            const move = (ev) => {
                // the panel is anchored right, so dragging left makes it wider
                const w = Math.min(MAX(), Math.max(MIN, w0 + (x0 - ev.clientX)));
                this.root.style.width = `${w}px`;
            };
            const up = (ev) => {
                handle.releasePointerCapture(ev.pointerId);
                handle.removeEventListener("pointermove", move);
                handle.removeEventListener("pointerup", up);
                localStorage.setItem("insp_w", String(Math.round(this.root.getBoundingClientRect().width)));
            };
            handle.addEventListener("pointermove", move);
            handle.addEventListener("pointerup", up);
            e.preventDefault();
        });
        handle.addEventListener("dblclick", () => { this.root.style.width = ""; localStorage.removeItem("insp_w"); });
    }
}
class UI_TOOLBAR {
    onPick;
    nav = $("tools");
    buttons = new Map();
    keys = new Map();
    current;
    constructor(items, initial, onPick) {
        this.onPick = onPick;
        isolate(this.nav);
        for (const it of items) {
            if (it.separator)
                this.nav.appendChild(document.createElement("hr"));
            const b = document.createElement("button");
            b.dataset.tip = it.key ? `${it.tip}  [${it.key.toUpperCase()}]` : it.tip;
            b.innerHTML = `<svg viewBox="0 0 24 24">${it.icon}</svg>`;
            b.addEventListener("click", () => this.pick(it.id));
            this.nav.appendChild(b);
            this.buttons.set(it.id, b);
            if (it.key)
                this.keys.set(it.key.toLowerCase(), it.id);
        }
        addEventListener("keydown", e => {
            if (is_typing(e))
                return;
            const id = this.keys.get(e.key.toLowerCase());
            if (id !== undefined)
                this.pick(id);
        });
        this.current = initial;
        this.pick(initial);
    }
    /** selects a tool. notify=false only moves the highlight, without calling onPick. */
    pick(id, notify = true) {
        this.current = id;
        this.buttons.forEach((b, k) => b.classList.toggle("on", k === id));
        if (notify)
            this.onPick(id);
    }
    get picked() { return this.current; }
    toggle_visibility() {
        this.nav.hidden = !this.nav.hidden;
    }
    add_toggle(o) {
        this.nav.appendChild(document.createElement("hr"));
        const b = document.createElement("button");
        b.className = "toggle";
        b.dataset.tip = o.tip;
        b.innerHTML = `<svg viewBox="0 0 24 24">${o.icon}</svg>`;
        let state = o.initial;
        const set = (on, notify = true) => {
            state = on;
            b.classList.toggle("active", on);
            b.setAttribute("aria-pressed", String(on));
            if (notify)
                o.onToggle(on);
        };
        b.addEventListener("click", () => { set(!state); b.blur(); }); // blur so Space doesn't re-click it
        this.nav.appendChild(b);
        set(o.initial, false);
        return { set, toggle: () => set(!state), get on() { return state; } };
    }
}
class UI_VIEW_SELECT {
    onPick;
    root = $("view-select");
    btn = $("view-btn");
    list = $("view-list");
    $name = $("view-name");
    items = new Map();
    current;
    constructor(items, initial, onPick) {
        this.onPick = onPick;
        isolate($("view-select"));
        const keys = new Map();
        for (const it of items) {
            const li = document.createElement("li");
            li.innerHTML = `<span>${it.name}</span>${it.key ? `<kbd>${it.key}</kbd>` : ""}`;
            li.addEventListener("click", () => { this.pick(it.id); this.close(); });
            this.list.appendChild(li);
            this.items.set(it.id, { name: it.name, li });
            if (it.key)
                keys.set(it.key.toLowerCase(), it.id);
        }
        this.btn.addEventListener("click", e => { e.stopPropagation(); this.toggle(); });
        document.addEventListener("click", () => this.close());
        addEventListener("keydown", e => {
            if (is_typing(e))
                return;
            const id = keys.get(e.key.toLowerCase());
            if (id !== undefined)
                this.pick(id);
            if (e.key === "Escape")
                this.close();
        });
        this.current = initial;
        this.pick(initial);
    }
    /** selects a view. notify=false only updates the label and highlight. */
    pick(id, notify = true) {
        this.current = id;
        this.items.forEach((v, k) => {
            v.li.classList.toggle("on", k === id);
            if (k === id)
                this.$name.textContent = v.name;
        });
        if (notify)
            this.onPick(id);
    }
    get picked() { return this.current; }
    get is_open() { return !this.list.hidden; }
    open(v = true) {
        this.list.hidden = !v;
        this.btn.setAttribute("aria-expanded", String(v));
    }
    close() { this.open(false); }
    toggle() { this.open(!this.is_open); }
    toggle_visibility() {
        this.root.hidden = !this.root.hidden;
    }
}
/* ================================================================== */
/*  status bar (bottom center)                                        */
/* ================================================================== */
class UI_STATUS {
    root = $("status");
    $cursor = $("st-cursor");
    $tool = $("st-tool");
    $fps = $("st-fps");
    fps_smooth = 60;
    constructor() { isolate($("status")); }
    cursor(x, y) {
        this.$cursor.textContent = `x ${x.toFixed(3)}  y ${y.toFixed(3)}`;
    }
    tool(name) { this.$tool.textContent = name; }
    /** pass the frame time in seconds, the display is smoothed. */
    fps(dt) {
        if (dt > 0 && dt < 1)
            this.fps_smooth += (1 / dt - this.fps_smooth) * 0.05;
        this.$fps.textContent = `${this.fps_smooth.toFixed(0)} fps`;
    }
    toggle_visibility() {
        this.root.hidden = !this.root.hidden;
    }
}
/* ================================================================== */
/*  world bounds in the screen corners                                */
/* ================================================================== */
class UI_BOUNDS {
    tl = $("c-tl");
    tr = $("c-tr");
    bl = $("c-bl");
    br = $("c-br");
    static fmt(el, x, y) {
        const f = (v) => (v >= 0 ? "+" : "") + v.toFixed(2);
        el.textContent = `${f(x)}, ${f(y)}`;
    }
    /** window centered at (cx, cy) with half extents (hw, hh).
     *  Uses the force shader's convention, p = (0.5 - uv) * ... + center, so x and y
     *  decrease toward the right and the top. */
    update(cx, cy, hw, hh) {
        const x0 = cx - hw, x1 = cx + hw, y0 = cy - hh, y1 = cy + hh;
        UI_BOUNDS.fmt(this.tl, x0, y1); // quadrant II  (-, +)
        UI_BOUNDS.fmt(this.tr, x1, y1); // quadrant I   (+, +)
        UI_BOUNDS.fmt(this.bl, x0, y0); // quadrant III (-, -)
        UI_BOUNDS.fmt(this.br, x1, y0); // quadrant IV  (+, -)
    }
    toggle_visibility() {
        this.tl.hidden = this.tr.hidden = this.bl.hidden = this.br.hidden = !this.tl.hidden;
    }
}
