const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const TOOL_ICONS = [
    '<path d="M12 3c3 4 5 6.5 5 9.5a5 5 0 0 1-10 0C7 9.5 9 7 12 3z"/><path d="M4 20h9m-3-3 3 3-3 3"/>',
    '<path d="M12 3c3 4 5 6.5 5 9.5a5 5 0 0 1-10 0C7 9.5 9 7 12 3z"/>',
    '<path d="M4 8h10a3 3 0 1 0-3-3M4 13h14a3 3 0 1 1-3 3M4 18h7"/>',
    '<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M4 12h16M10 5v7M15 12v7"/>',
];

const FORCE_ICON =
    '<path d="M13 5.5c-1.8-1-3.4 0-3.7 2L8 19c-.3 1.6-1.4 2.300-2.800 1.600"/>' +
    '<path d="M5.500 11.500h7"/>' +
    '<path d="M15.500 13.500l4.500 5.500m0-5.500l-4.500 5.500" stroke-width="1.400"/>',
      BORDERS_ICON =
    '<path d="M4 4h5M15 4h5"/>' + '<path d="M4 20h5M15 20h5"/>' +
    '<path d="M4 4v5M4 15v5"/>' + '<path d="M20 4v5M20 15v5"/>';


/* =================================    ================================= */
/*  inspector rows                                                    */
/* ================================================================== */

type Src<T> = T | (() => T);
const val = <T>(s: Src<T>): T => (typeof s === "function" ? (s as () => T)() : s);

type NumKey<O>  = { [P in keyof O]: O[P] extends number ? P : never }[keyof O];
type FlagKey<O> = { [P in keyof O]: O[P] extends number | boolean ? P : never }[keyof O];
type VecKey<O>  = { [P in keyof O]: O[P] extends ArrayLike<number> ? P : never }[keyof O];
type EnumOption = { value: number; name: string };

/** what every element needs to talk to its bound value. */
type IO<T> = {
    get: () => T;
    set: (v: T) => void;
    /** default for double-click reset, resolved for the current target object. */
    def: () => T;
    /** returns a forced value while the field is locked, undefined when editable. */
    frozen?: () => T | undefined;
    onChange?: (v: T) => void;
    /** returns true if the field should be visible. */
    visible?: () => boolean;
    tooltip?: string;
};

/** resolves a lazy target and remembers each target's initial value (for reset). */
function bind<O extends object, K extends keyof O, V>(obj: Src<O>, key: K, copy: (x: O[K]) => V) {
    const defaults = new WeakMap<object, V>();
    const target = () => {
        const t = val(obj);
        if (!defaults.has(t)) defaults.set(t, copy(t[key]));
        return t;
    };
    target();
    return { target, def: () => defaults.get(target())! };
}

function isolate(el: HTMLElement) {
    for (const ev of ["mousedown", "contextmenu"]) el.addEventListener(ev, e => e.stopPropagation());
}

/** true when the event comes from a form control. */
function in_field(e: Event) {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" ||
                   t.tagName === "SELECT" || t.isContentEditable);
}
/** form control or a modifier combo. Use this in component hotkeys. */
function is_typing(e: KeyboardEvent) { return in_field(e) || e.ctrlKey || e.metaKey || e.altKey; }

function render_tooltip(src: string): string {
    const esc_ = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const inline = (s: string) => esc_(s).replace(/\[([^\]]+)\]/g, '<b class="tv">$1</b>').replace(/\n/g, "<br>");
    let out = "";
    // order matters: $$..$$ before $..$
    const re = /\$\$([\s\S]*?)\$\$|\$([\s\S]*?)\$|\{([\s\S]*?)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
        if (m[1] !== undefined) out += `<div class="tt-h2">${inline(m[1].trim())}</div>`;
        else if (m[2] !== undefined) out += `<div class="tt-h1">${inline(m[2].trim())}</div>`;
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
    private static el: HTMLDivElement;
    private static timer = 0;

    private static ensure() {
        if (this.el) return;
        this.el = document.createElement("div");
        this.el.className = "tt";
        this.el.hidden = true;
        $("hud").appendChild(this.el);
    }

    /** attaches a rich tooltip to an element. */
    static attach(target: HTMLElement, src: string, delay = 350) {
        this.ensure();
        const html = render_tooltip(src);
        target.addEventListener("mouseenter", () => {
            clearTimeout(this.timer);
            this.timer = window.setTimeout(() => this.show(target, html), delay);
        });
        const hide = () => { clearTimeout(this.timer); this.el.hidden = true; };
        target.addEventListener("mouseleave", hide);
        target.addEventListener("mousedown", hide);
    }

    private static show(target: HTMLElement, html: string) {
        this.el.innerHTML = html;
        this.el.hidden = false;
        const r = target.getBoundingClientRect();
        const w = this.el.offsetWidth, h = this.el.offsetHeight;
        // prefer the left of the target (the inspector sits on the right edge)
        let x = r.left - w - 10;
        if (x < 8) x = Math.min(r.right + 10, innerWidth - w - 8);
        let y = r.top + r.height / 2 - h / 2;
        y = Math.max(8, Math.min(y, innerHeight - h - 8));
        this.el.style.left = `${x}px`;
        this.el.style.top = `${y}px`;
    }
}

abstract class UI_ELEMENT<T> {
    protected readonly row = document.createElement("div");

    constructor(
        parent: HTMLElement, label: string, title: string,
        protected readonly io: IO<T>, row_class = ""
    ) {
        this.row.className = ("row " + row_class).trim();
        const l = document.createElement("label");
        l.textContent = label;
        if (io.tooltip) UI_TOOLTIP.attach(l, io.tooltip);
        else l.title = title;
        this.row.appendChild(l);
        parent.appendChild(this.row);
    }

    abstract refresh_value(): void;
    abstract apply(v: T): void;

    set_visible(visible: boolean) {
        this.row.hidden = !visible;
    }
    toggle_visibility() { this.row.hidden = !this.row.hidden; }

    refresh_visibility() {
        this.io.visible && this.set_visible(this.io.visible());
    }

    refresh() {
        this.refresh_visibility();
        if (!this.row.hidden) this.refresh_value();
    }

    get is_frozen() { return this.io.frozen?.() !== undefined; }
    reset() { this.apply(this.io.def()); }

    /** greys out and disables every input in the row. */
    protected lock(on: boolean) {
        this.row.classList.toggle("frozen", on);
        this.row.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select")
            .forEach(i => { i.disabled = on; });
    }
}

class UI_SLIDER extends UI_ELEMENT<number> {
    private readonly in_range = document.createElement("input");
    private readonly in_number = document.createElement("input");

    constructor(
        parent: HTMLElement, label: string, key: string, io: IO<number>,
        private readonly o: { min: () => number; max: () => number; step?: number; log: boolean; int: boolean }
    ) {
        super(parent, label, key, io);
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
        this.row.addEventListener("dblclick", e => { if (e.target !== this.in_number) this.reset(); });
        this.refresh_value();
    }

    private to_t(v: number) {
        const min = this.o.min(), max = this.o.max();
        if (max <= min) return 0;
        return this.o.log ? (Math.log(Math.max(v, min)) - Math.log(min)) / (Math.log(max) - Math.log(min))
                          : (v - min) / (max - min);
    }
    private from_t(t: number) {
        const min = this.o.min(), max = this.o.max();
        return this.o.log ? Math.exp(Math.log(min) + t * (Math.log(max) - Math.log(min)))
                          : min + t * (max - min);
    }

    apply(v: number) {
        if (this.is_frozen) return this.refresh_value();
        const { log, int, step } = this.o;
        const min = this.o.min(), max = this.o.max();
        if (int) v = Math.round(v);
        if (step && !log) v = Math.round(v / step) * step;
        v = Math.min(max, Math.max(min, v));
        this.io.set(v);
        this.io.onChange?.(v);
        this.refresh_value();
    }

    refresh_value() {
        const max = this.o.max(), min = this.o.min();
        const cur = this.io.get();
        if (!this.is_frozen && (cur > max || cur < min)) this.io.set(Math.min(max, Math.max(min, cur)));

        const forced = this.io.frozen?.();
        const v = forced ?? this.io.get();
        const { int, step } = this.o;
        const decimals = int ? 0
            : Math.max(0, Math.ceil(-Math.log10(step ?? ((this.o.max() - this.o.min()) / 200 || 1))));
        this.in_range.value = String(Math.min(1, Math.max(0, this.to_t(v))) * 1000);
        this.in_number.step = String(10 ** -decimals);       // arrow keys step by the displayed precision
        if (document.activeElement !== this.in_number) this.in_number.value = v.toFixed(decimals);
        this.lock(forced !== undefined);
    }
}

class UI_TOGGLE extends UI_ELEMENT<number | boolean> {
    private readonly input = document.createElement("input");

    constructor(
        parent: HTMLElement, label: string, key: string,
        io: IO<number | boolean>, private readonly int: boolean
    ) {
        super(parent, label, key, io, "toggle");
        this.input.type = "checkbox";
        this.row.appendChild(this.input);
        this.input.addEventListener("change", () => this.apply(this.input.checked));
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
        this.input.checked = !!(forced ?? this.io.get());
        this.lock(forced !== undefined);
    }
}

class UI_VECTOR extends UI_ELEMENT<number[]> {
    private readonly inputs: HTMLInputElement[] = [];
    private readonly decimals: number;

    constructor(
        parent: HTMLElement, label: string, key: string, io: IO<number[]>,
        private readonly n: 2 | 3 | 4,
        private readonly o: { min: number; max: number; step?: number; labels: string }
    ) {
        super(parent, label, key, io, "vec");
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
                if (Number.isNaN(x)) return this.refresh_value();
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
            if (!(e.target instanceof HTMLInputElement)) this.reset();
        });
        this.refresh_value();
    }

    private scrub(axis: HTMLElement, i: number) {
        let x0 = 0, v0 = 0;
        axis.addEventListener("pointerdown", e => {
            if (this.is_frozen) return;
            axis.setPointerCapture(e.pointerId);
            x0 = e.clientX;
            v0 = this.io.get()[i];
            e.preventDefault();
        });
        axis.addEventListener("pointermove", e => {
            if (!axis.hasPointerCapture(e.pointerId)) return;
            const speed = (this.o.step ?? 0.01) * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1);
            const v = this.io.get();
            v[i] = v0 + (e.clientX - x0) * speed;
            this.apply(v);
        });
    }

    apply(v: number[]) {
        if (this.is_frozen) return this.refresh_value();
        const { min, max, step } = this.o;
        const out = v.slice(0, this.n).map(x => {
            if (step) x = Math.round(x / step) * step;
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
            if (document.activeElement !== inp) inp.value = v[i].toFixed(this.decimals);
        });
        this.lock(forced !== undefined);
    }
}

class UI_ENUM extends UI_ELEMENT<number> {
    private readonly select = document.createElement("select");
    private shown: EnumOption[] | null = null;

    constructor(
        parent: HTMLElement, label: string, key: string, io: IO<number>,
        private readonly options: () => EnumOption[]
    ) {
        super(parent, label, key, io, "enum");
        this.row.appendChild(this.select);
        this.select.addEventListener("change", () => { this.apply(+this.select.value); this.select.blur(); });
        this.row.addEventListener("dblclick", e => { if (e.target !== this.select) this.reset(); });
        this.refresh_value();
    }

    apply(v: number) {
        if (this.is_frozen) return this.refresh_value();
        this.io.set(v);
        this.io.onChange?.(v);
        this.refresh_value();
    }

    refresh_value() {
        const opts = this.options();
        const same = this.shown !== null && this.shown.length === opts.length &&
            opts.every((o, i) => o.value === this.shown![i].value && o.name === this.shown![i].name);
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

class UI_COLOR extends UI_ELEMENT<number[]> {
    private readonly inputs: HTMLInputElement[] = [];
    private readonly picker = document.createElement("input");
    private readonly swatch = document.createElement("label");

    constructor(parent: HTMLElement, label: string, key: string, io: IO<number[]>) {
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
                if (Number.isNaN(x)) return this.refresh_value();
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
            if (!(e.target instanceof HTMLInputElement)) this.reset();
        });
        this.refresh_value();
    }

    /** drag an axis letter left/right to change that channel (shift = x10, alt = x0.1). */
    private scrub(axis: HTMLElement, i: number) {
        let x0 = 0, v0 = 0;
        axis.addEventListener("pointerdown", e => {
            if (this.is_frozen) return;
            axis.setPointerCapture(e.pointerId);
            x0 = e.clientX;
            v0 = this.io.get()[i];
            e.preventDefault();
        });
        axis.addEventListener("pointermove", e => {
            if (!axis.hasPointerCapture(e.pointerId)) return;
            const speed = 0.013 * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1);
            const v = this.io.get();
            v[i] = v0 + (e.clientX - x0) * speed;
            this.apply(v);
        });
    }

    private static hex(v: ArrayLike<number>) {
        return "#" + [0, 1, 2].map(i =>
            Math.round(Math.min(1, Math.max(0, v[i])) * 255).toString(16).padStart(2, "0")).join("");
    }

    apply(v: number[]) {
        if (this.is_frozen) return this.refresh_value();
        const out = v.slice(0, 3).map(x => Math.min(1, Math.max(0, x)));
        this.io.set(out);
        this.io.onChange?.(out);
        this.refresh_value();
    }

    refresh_value() {
        const forced = this.io.frozen?.();
        const v = forced ?? this.io.get();
        this.inputs.forEach((inp, i) => {
            if (document.activeElement !== inp) inp.value = v[i].toFixed(2);
        });
        const hex = UI_COLOR.hex(v);
        // only write when it differs, so a live drag isn't fought by the 8-bit round trip
        if (this.picker.value !== hex) this.picker.value = hex;
        this.swatch.style.setProperty("--c", hex);
        this.lock(forced !== undefined);
    }
}

type GlslLint = { line: number; msg: string };

/** basic structural lint, 1-based lines. */
function lint_glsl(src: string, required_fn?: string): GlslLint[] {
    const out: GlslLint[] = [];
    const lines = src.split("\n");
    const stack: { c: string; line: number }[] = [];
    const pair: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
    let in_block = false;

    lines.forEach((raw, i) => {
        let l = raw;
        if (in_block) {                                   // inside /* ... */
            const e = l.indexOf("*/");
            if (e < 0) return;
            l = l.slice(e + 2); in_block = false;
        }
        l = l.replace(/\/\*.*?\*\//g, "").replace(/\/\/.*/, "");
        if (l.includes("/*")) { in_block = true; l = l.slice(0, l.indexOf("/*")); }

        for (const c of l) {
            if ("([{".includes(c)) stack.push({ c, line: i + 1 });
            else if (")]}".includes(c)) {
                const top = stack.pop();
                if (!top || top.c !== pair[c]) out.push({ line: i + 1, msg: `unmatched '${c}'` });
            }
        }
        if (/\b(while|do)\b/.test(l)) out.push({ line: i + 1, msg: "while/do loops are not allowed" });
        if (/\bfor\s*\(/.test(l) && !/\bfor\s*\(\s*int\s+\w+\s*=\s*\d+\s*;\s*\w+\s*<=?\s*\d+\s*;/.test(l))
            out.push({ line: i + 1, msg: "for loops need constant bounds: for (int i = 0; i < N; ++i)" });
    });
    for (const s of stack) out.push({ line: s.line, msg: `unclosed '${s.c}'` });
    if (required_fn && !new RegExp(`\\b${required_fn}\\s*\\(`).test(src))
        out.push({ line: 1, msg: `missing function '${required_fn}'` });
    return out;
}

type GlslOptions = {
    title: string;
    button: string;
    /** the function the user must define, e.g. "get_velocity". Optional. */
    required_fn?: string;
    /** subtracted from the driver's "0:LINE" so lines match the editor. */
    line_offset: number;
    /** returns the driver's error log, or null when it compiled and is now running. */
    compile: (src: string) => string | null;
};

class UI_GLSL extends UI_ELEMENT<string> {
    private readonly win = document.createElement("div");
    private ta!: HTMLTextAreaElement;
    private hl!: HTMLPreElement;
    private sq!: HTMLPreElement;
    private gut!: HTMLPreElement;
    private $err!: HTMLElement;
    private errors: { line: number; msg: string; hard: boolean }[] = [];
    private timer = 0;
    private built = false;

    private $btn!: HTMLButtonElement;
    private busy = false;
    private btn_timer = 0;

    constructor(parent: HTMLElement, label: string, key: string, io: IO<string>, private readonly o: GlslOptions) {
        const t = io.tooltip;
        delete io.tooltip;

        super(parent, label, key, io, "glsl");

        const b = document.createElement("button");
        b.className = "glsl-open";
        b.textContent = o.button;
        b.addEventListener("click", () => this.open());
        this.row.appendChild(b);

        if (t) UI_TOOLTIP.attach(b, t);
    }

    show() { this.lock(this.io.frozen?.() !== undefined); }
    apply(v: string) { if (this.is_frozen) return; this.io.set(v); this.io.onChange?.(v); }

    get is_open() { return this.built && !this.win.hidden; }

    open() {
        if (this.is_frozen) return;
        if (!this.built) this.build();
        this.win.hidden = false;
        this.ta.value = this.io.get();
        this.errors = [];
        this.$err.textContent = "";
        this.render();
        this.ta.focus();
        this.set_btn("idle")
    }
    close() { this.win.hidden = true; (document.activeElement as HTMLElement | null)?.blur(); }

    /** compiles the editor text. On success the window closes. */
    submit() {
        if (this.busy) return;
        this.busy = true;
        this.set_btn("busy");
        const t0 = performance.now();

        // one frame, so the loader is painted before the (synchronous) compile
        requestAnimationFrame(() => setTimeout(() => {
            const result = this.run_compile();
            const wait = Math.max(0, 250 - (performance.now() - t0));
            setTimeout(() => {
                this.busy = false;
                if (result.ok) this.set_btn("ok", 1400);
                // @ts-ignore
                else { this.show_errors(result.errors); this.set_btn("fail"); }   // stays red until the next edit
            }, wait);
        }, 0));
    }
    
    private run_compile(): { ok: true } | { ok: false; errors: { line: number; msg: string; hard: boolean }[] } {
        const src = this.ta.value;
        const hard = lint_glsl(src, this.o.required_fn);
        if (hard.length) return { ok: false, errors: hard.map(h => ({ ...h, hard: true })) };

        const log = this.o.compile(src);
        if (log === null) { this.apply(src); this.errors = []; this.$err.textContent = ""; this.render(); return { ok: true }; }

        const found: { line: number; msg: string; hard: boolean }[] = [];
        for (const m of log.matchAll(/(?:ERROR|WARNING):\s*\d+:(\d+):\s*([^\n]*)/g))
            found.push({ line: Math.max(1, +m[1] - this.o.line_offset), msg: m[2], hard: true });
        return { ok: false, errors: found.length ? found : [{ line: 1, msg: log.trim(), hard: true }] };
    }

    private show_errors(errs: { line: number; msg: string; hard: boolean }[]) {
        this.errors = errs;
        this.$err.textContent = errs.map(e => `line ${e.line}: ${e.msg}`).join("\n");
        this.$err.scrollTop = 0;
        this.render();
    }

    private render() {
        const src = this.ta.value, lines = src.split("\n");
        this.hl.innerHTML = highlight_glsl(src);
        this.gut.innerHTML = lines.map((_, i) =>
            `<span${this.errors.some(e => e.line === i + 1 && e.hard) ? ' class="e"' : ""}>${i + 1}</span>`).join("\n") + "\n";

        // squiggle layer: same text, transparent, only the error lines underlined
       const bad = new Map(this.errors.map(e => [e.line, e]));
        this.sq.innerHTML = lines.map((l, i) => {
            if (!bad.has(i + 1) || !l.trim()) return esc(l);
            const lead = l.length - l.trimStart().length, body = l.trimStart();
            return esc(l.slice(0, lead)) + `<span class="sq">${esc(body)}</span>`;
        }).join("\n") + "\n";
        this.sync();
    }

    private sync() {
        for (const p of [this.hl, this.sq, this.gut]) { p.scrollTop = this.ta.scrollTop; p.scrollLeft = p === this.gut ? 0 : this.ta.scrollLeft; }
    }

    private set_btn(state: "idle" | "busy" | "ok" | "fail", revert_ms = 0) {
        clearTimeout(this.btn_timer);
        this.$btn.dataset.state = state;
        this.$btn.querySelector(".lbl")!.textContent =
            state === "busy" ? "Compiling" : state === "ok" ? "✓ Compiled" : state === "fail" ? "✕ Failed" : "▶ Compile";
        if (revert_ms) this.btn_timer = window.setTimeout(() => this.set_btn("idle"), revert_ms);
    }

    private build() {
        this.built = true;
        const w = this.win;
        w.className = "glsl-win";
        w.hidden = true;
        w.innerHTML = `
          <header>
            <span class="title">${this.o.title}</span>
            <button class="compile" data-state="idle" title="Ctrl+S">
            <span class="spin"></span><span class="lbl">▶ Compile</span><kbd>Ctrl+S</kbd>
            </button>
            <button class="x" title="Close (Esc)">×</button>
          </header>
          <div class="gbody">
            <pre class="gut" aria-hidden="true"></pre>
            <div class="ed"><pre class="hl" aria-hidden="true"></pre><pre class="sqp" aria-hidden="true"></pre>
              <textarea spellcheck="false" autocapitalize="off" autocomplete="off"></textarea></div>
          </div>
          <footer class="gerr"></footer>`;
        this.gut = w.querySelector(".gut")!;
        this.hl  = w.querySelector(".hl")!;
        this.sq  = w.querySelector(".sqp")!;
        this.ta  = w.querySelector("textarea")!;
        this.$err = w.querySelector(".gerr")!;
        this.$btn = w.querySelector(".compile")!;
        
        w.querySelector(".x")!.addEventListener("click", () => this.close());
        w.querySelector(".compile")!.addEventListener("click", () => this.submit());
        this.ta.addEventListener("scroll", () => this.sync());
        this.ta.addEventListener("input", () => {
            if (this.$btn.dataset.state === "fail" || this.$btn.dataset.state === "ok") this.set_btn("idle");
            this.errors = [];                                   // stale after an edit
            this.$err.textContent = "";
            this.render();
            clearTimeout(this.timer);
            this.timer = window.setTimeout(() => {              // live lint: amber squiggles, no compile
                const l = lint_glsl(this.ta.value, this.o.required_fn);
                if (l.length) { this.errors = l.map(x => ({ ...x, hard: false })); this.$err.textContent = ""; this.render(); }
            }, 400);
        });
        w.addEventListener("keydown", e => {
            e.stopPropagation();                                // keep global hotkeys out
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); this.submit(); }
            else if (e.key === "Escape") this.close();
            else if (e.key === "Tab") {
                e.preventDefault();
                this.ta.setRangeText("    ", this.ta.selectionStart, this.ta.selectionEnd, "end");
                this.ta.dispatchEvent(new Event("input"));
            }
        });
        isolate(w);
        w.addEventListener("wheel", e => e.stopPropagation(), { passive: true });
        $("hud").appendChild(w);
    }

    refresh_value() {}
}

/* ================================================================== */
/*  inspector                                                         */
/* ================================================================== */
type Common<O, T> = { label: string; obj: Src<O>; frozen?: () => T | undefined, visible?: () => boolean, tooltip?:string };

type SliderDef<O, K extends NumKey<O>> = Common<O, number> & {
    key: K; min: Src<number>; max: Src<number>;
    step?: number; log?: boolean; int?: boolean; onChange?: (v: number) => void;
};
type ToggleDef<O, K extends FlagKey<O>> = Common<O, number | boolean> & {
    key: K; int?: boolean; onChange?: (v: number | boolean) => void;
};
type VecDef<O, K extends VecKey<O>> = Common<O, number[]> & {
    key: K; min?: number; max?: number; step?: number; labels?: string; onChange?: (v: number[]) => void;
};
type EnumDef<O, K extends NumKey<O>> = Common<O, number> & {
    key: K; options: Src<EnumOption[]>; onChange?: (v: number) => void;
};
type ColorDef<O, K extends VecKey<O>> = Common<O, number[]> & {
    key: K;
    /** fires when the user picks or types a color. */
    onPick?: (v: number[]) => void;
};

class UI_SECTION {
    readonly el = document.createElement("section");
    readonly body = document.createElement("div");
    readonly elements: UI_ELEMENT<any>[] = [];
    readonly visible?: () => boolean;

    constructor(readonly name: string, visible?: () => boolean, open = true) {
        const h3 = document.createElement("h3");
        h3.textContent = name;
        h3.addEventListener("click", () => this.open(!this.is_open));
        this.body.className = "body";
        this.el.dataset.id = name;
        this.el.append(h3, this.body);
        this.open(open);
        this.visible = visible;
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
        if (this.visible) this.set_visible(this.visible());
    }

    refresh() { 
        this.refresh_visibility();
        if (!this.el.hidden) this.elements.forEach(e => e.refresh());
    }

    private push<E extends UI_ELEMENT<any>>(e: E) { this.elements.push(e); return e; }

    slider<O extends object, K extends NumKey<O>>(d: SliderDef<O, K>) {
        const b = bind(d.obj, d.key, x => x as number);
        return this.push(new UI_SLIDER(this.body, d.label, String(d.key), {
            get: () => b.target()[d.key] as number,
            set: v => { b.target()[d.key] = v as O[K]; },
            def: b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, { min: () => val(d.min), max: () => val(d.max), step: d.step, log: d.log ?? false, int: d.int ?? false }));
    }

    toggle<O extends object, K extends FlagKey<O>>(d: ToggleDef<O, K>) {
        const b = bind(d.obj, d.key, x => x as number | boolean);
        return this.push(new UI_TOGGLE(this.body, d.label, String(d.key), {
            get: () => b.target()[d.key] as number | boolean,
            set: v => { b.target()[d.key] = v as O[K]; },
            def: b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, d.int ?? false));
    }

    enum<O extends object, K extends NumKey<O>>(d: EnumDef<O, K>) {
        const b = bind(d.obj, d.key, x => x as number);
        return this.push(new UI_ENUM(this.body, d.label, String(d.key), {
            get: () => b.target()[d.key] as number,
            set: v => { b.target()[d.key] = v as O[K]; },
            def: b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, () => val(d.options)));
    }

    private vec<O extends object, K extends VecKey<O>>(n: 2 | 3 | 4, d: VecDef<O, K>) {
        const arr = (t: O) => t[d.key] as unknown as { [i: number]: number };
        const read = (t: O) => Array.from({ length: n }, (_, i) => arr(t)[i]);
        const b = bind(d.obj, d.key, () => read(val(d.obj)));
        return this.push(new UI_VECTOR(this.body, d.label, String(d.key), {
            get: () => read(b.target()),
            set: v => { const a = arr(b.target()); for (let i = 0; i < n; ++i) a[i] = v[i]; },   // in place
            def: b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, n, { min: d.min ?? -Infinity, max: d.max ?? Infinity, step: d.step, labels: d.labels ?? "xyzw" }));
    }
    vec2<O extends object, K extends VecKey<O>>(d: VecDef<O, K>) { return this.vec(2, d); }
    vec3<O extends object, K extends VecKey<O>>(d: VecDef<O, K>) { return this.vec(3, d); }
    vec4<O extends object, K extends VecKey<O>>(d: VecDef<O, K>) { return this.vec(4, d); }

    color<O extends object, K extends VecKey<O>>(d: ColorDef<O, K>) {
        const arr = (t: O) => t[d.key] as unknown as { [i: number]: number };
        const read = (t: O) => [arr(t)[0], arr(t)[1], arr(t)[2]];
        const b = bind(d.obj, d.key, () => read(val(d.obj)));
        return this.push(new UI_COLOR(this.body, d.label, String(d.key), {
            get: () => read(b.target()),
            set: v => { const a = arr(b.target()); for (let i = 0; i < 3; ++i) a[i] = v[i]; },   // in place
            def: b.def, frozen: d.frozen, onChange: d.onPick,
            visible: d.visible, tooltip: d.tooltip
        }));
    }

    glsl<O extends object, K extends keyof O>(d: {
        label: string; tooltip?:string; obj: Src<O>; key: K;
        frozen?: () => string | undefined; onChange?: (v: string) => void;
        visible?: () => boolean
    } & GlslOptions) {
        const b = bind(d.obj, d.key, x => x as string);
        return this.push(new UI_GLSL(this.body, d.label, String(d.key), {
            get: () => b.target()[d.key] as unknown as string,
            set: v => { b.target()[d.key] = v as O[K]; },
            def: b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, d));
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
}

class UI_PALETTE {
    private readonly section: UI_SECTION;
    readonly grid = document.createElement("div");
    private current: number;

    constructor(
        section: UI_SECTION,
        private readonly palette: color_data[],
        picked: number,
        private readonly onPick: (i: number) => void,
        private readonly onAdd?: (c: color_data) => void
    ) {
        this.section = section;
        this.current = picked;
        this.grid.id = "color-picker";
        section.body.appendChild(this.grid);
        this.render();
    }

    private static hex(c: ArrayLike<number>) {
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
            const inp = add.querySelector("input")!;
            inp.addEventListener("change", () => {
                const n = parseInt(inp.value.slice(1), 16);
                this.onAdd!(get_color_data(new Uint8Array([(n >> 16) & 255, (n >> 8) & 255, n & 255, 255])));
                this.render();
                this.pick(this.palette.length - 1);
            });
            this.grid.appendChild(add);
        }
        this.highlight(Math.min(this.current, this.palette.length - 1));
    }

    private highlight(i: number) {
        this.current = i;
        this.grid.querySelectorAll<HTMLElement>(".sw:not(.add)")
            .forEach((b, k) => b.classList.toggle("picked", k === i));
    }

    /** selects a swatch; notify=false only moves the highlight (use it when code changed the color). */
    pick(i: number, notify = true) {
        this.highlight(i);
        if (notify) this.onPick(i);
    }

    get picked() { return this.current; }

    toggle_visibility() {
        this.section.toggle_visibility();
    }
}

class UI_INSPECTOR {
    private readonly root = $("inspector");
    private readonly body = $("insp-body");
    private readonly btn = $("insp-toggle");
    private readonly sections = new Map<string, UI_SECTION>();

    constructor() {
        isolate(this.root);
        this.btn.addEventListener("click", () => this.collapse(!this.collapsed));
        this.init_resize();
    }

    get collapsed() { return this.root.classList.contains("min"); }
    collapse(v = true) {
        this.root.classList.toggle("min", v);
        this.btn.textContent = v ? "+" : "–";
    }

    /** returns the section, creating it on first use. */
    section(name: string, visible?:() => boolean, open = true) {
        let s = this.sections.get(name);
        if (!s) {
            s = new UI_SECTION(name, visible, open);
            this.sections.set(name, s);
            this.body.appendChild(s.el);
        }
        return s;
    }

    /** builds the palette section (always first) and its swatch grid. */
    palette(
        palette: color_data[], picked: number,
        onPick: (i: number) => void, onAdd?: (c: color_data) => void
    ) {
        const s = new UI_SECTION("Palette", () => mouse.mode === MOUSE_MODE_DYE || mouse.mode === MOUSE_MODE_DYE_FORCE, true);
        this.sections.set("Palette", s);
        this.body.append(s.el);
        return new UI_PALETTE(s, palette, picked, onPick, onAdd);
    }

    /** opens one section and closes the others (the pinned palette stays as it is). */
    focus(name: string) {
        const target = this.sections.get(name);
        if (!target) return;
        target.open(true);
        target.el.scrollIntoView({ block: "nearest" });
    }

    refresh() { for (const s of this.sections.values()) s.refresh(); }

    toggle_visibility() {
        this.root.hidden = !this.root.hidden;
    }

    private init_resize() {
        const handle = $("insp-resize");
        const MIN = 240, MAX = () => Math.min(720, innerWidth - 120);
        const saved = parseInt(localStorage.getItem("insp_w") ?? "", 10);
        if (saved) this.root.style.width = `${Math.min(MAX(), Math.max(MIN, saved))}px`;

        handle.addEventListener("pointerdown", e => {
            handle.setPointerCapture(e.pointerId);
            const x0 = e.clientX, w0 = this.root.getBoundingClientRect().width;
            const move = (ev: PointerEvent) => {
                // the panel is anchored right, so dragging left makes it wider
                const w = Math.min(MAX(), Math.max(MIN, w0 + (x0 - ev.clientX)));
                this.root.style.width = `${w}px`;
            };
            const up = (ev: PointerEvent) => {
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

/* ================================================================== */
/*  tool rail                                                         */
/* ================================================================== */

type ToolItem<T extends number> = {
    id: T; tip: string; icon: string; key?: string; separator?: boolean;
};

class UI_TOOLBAR<T extends number> {
    private readonly nav = $("tools");
    private readonly buttons = new Map<T, HTMLButtonElement>();
    private readonly keys = new Map<string, T>();
    private current: T;

    constructor(
        items: ToolItem<T>[], initial: T,
        private readonly onPick: (id: T) => void
    ) {
        isolate(this.nav);
        for (const it of items) {
            if (it.separator) this.nav.appendChild(document.createElement("hr"));
            const b = document.createElement("button");
            b.dataset.tip = it.key ? `${it.tip}  [${it.key.toUpperCase()}]` : it.tip;
            b.innerHTML = `<svg viewBox="0 0 24 24">${it.icon}</svg>`;
            b.addEventListener("click", () => this.pick(it.id));
            this.nav.appendChild(b);
            this.buttons.set(it.id, b);
            if (it.key) this.keys.set(it.key.toLowerCase(), it.id);
        }
        addEventListener("keydown", e => {
            if (is_typing(e)) return;
            const id = this.keys.get(e.key.toLowerCase());
            if (id !== undefined) this.pick(id);
        });
        this.current = initial;
        this.pick(initial);
    }

    /** selects a tool. notify=false only moves the highlight, without calling onPick. */
    pick(id: T, notify = true) {
        this.current = id;
        this.buttons.forEach((b, k) => b.classList.toggle("on", k === id));
        if (notify) this.onPick(id);
    }

    get picked() { return this.current; }

    toggle_visibility() {
        this.nav.hidden = !this.nav.hidden;
    }

    add_toggle(o: { tip: string; icon: string; initial: boolean; onToggle: (on: boolean) => void }) {
        this.nav.appendChild(document.createElement("hr"));
        const b = document.createElement("button");
        b.className = "toggle";
        b.dataset.tip = o.tip;
        b.innerHTML = `<svg viewBox="0 0 24 24">${o.icon}</svg>`;
        let state = o.initial;
        const set = (on: boolean, notify = true) => {
            state = on;
            b.classList.toggle("active", on);
            b.setAttribute("aria-pressed", String(on));
            if (notify) o.onToggle(on);
        };
        b.addEventListener("click", () => { set(!state); b.blur(); });    // blur so Space doesn't re-click it
        this.nav.appendChild(b);
        set(o.initial, false);
        return { set, toggle: () => set(!state), get on() { return state; } };
    }
}

/* ================================================================== */
/*  view selector (top center)                                        */
/* ================================================================== */

type ViewItem<T extends number> = { id: T; name: string; key?: string };

class UI_VIEW_SELECT<T extends number> {
    private readonly root = $("view-select");
    private readonly btn = $("view-btn");
    private readonly list = $("view-list");
    private readonly $name = $("view-name");
    private readonly items = new Map<T, { name: string; li: HTMLLIElement }>();
    private current: T;

    constructor(
        items: ViewItem<T>[], initial: T,
        private readonly onPick: (id: T) => void
    ) {
        isolate($("view-select"));
        const keys = new Map<string, T>();

        for (const it of items) {
            const li = document.createElement("li");
            li.innerHTML = `<span>${it.name}</span>${it.key ? `<kbd>${it.key}</kbd>` : ""}`;
            li.addEventListener("click", () => { this.pick(it.id); this.close(); });
            this.list.appendChild(li);
            this.items.set(it.id, { name: it.name, li });
            if (it.key) keys.set(it.key.toLowerCase(), it.id);
        }

        this.btn.addEventListener("click", e => { e.stopPropagation(); this.toggle(); });
        document.addEventListener("click", () => this.close());
        addEventListener("keydown", e => {
            if (is_typing(e)) return;
            const id = keys.get(e.key.toLowerCase());
            if (id !== undefined) this.pick(id);
            if (e.key === "Escape") this.close();
        });

        this.current = initial;
        this.pick(initial);
    }

    /** selects a view. notify=false only updates the label and highlight. */
    pick(id: T, notify = true) {
        this.current = id;
        this.items.forEach((v, k) => {
            v.li.classList.toggle("on", k === id);
            if (k === id) this.$name.textContent = v.name;
        });
        if (notify) this.onPick(id);
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
    private readonly root = $("status");
    private readonly $cursor = $("st-cursor");
    private readonly $tool = $("st-tool");
    private readonly $fps = $("st-fps");
    private fps_smooth = 60;

    constructor() { isolate($("status")); }

    cursor(x: number, y: number) {
        this.$cursor.textContent = `x ${x.toFixed(3)}  y ${y.toFixed(3)}`;
    }
    tool(name: string) { this.$tool.textContent = name; }

    /** pass the frame time in seconds, the display is smoothed. */
    fps(dt: number) {
        if (dt > 0 && dt < 1) this.fps_smooth += (1 / dt - this.fps_smooth) * 0.05;
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
    private readonly tl = $("c-tl");
    private readonly tr = $("c-tr");
    private readonly bl = $("c-bl");
    private readonly br = $("c-br");

    private static fmt(el: HTMLElement, x: number, y: number) {
        const f = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);
        el.textContent = `${f(x)}, ${f(y)}`;
    }

    /** window centered at (cx, cy) with half extents (hw, hh).
     *  Uses the force shader's convention, p = (0.5 - uv) * ... + center, so x and y
     *  decrease toward the right and the top. */
    update(cx: number, cy: number, hw: number, hh: number) {
        const x0 = cx - hw, x1 = cx + hw, y0 = cy - hh, y1 = cy + hh;
        UI_BOUNDS.fmt(this.tl, x0, y1);
        UI_BOUNDS.fmt(this.tr, x1, y1);
        UI_BOUNDS.fmt(this.bl, x0, y0);
        UI_BOUNDS.fmt(this.br, x1, y0);
    }

    toggle_visibility() {
        this.tl.hidden = this.tr.hidden = this.bl.hidden = this.br.hidden = !this.tl.hidden;
    }
}