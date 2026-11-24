const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function field_same(a: any, b: any): boolean {
    if (typeof a === "boolean" || typeof b === "boolean") return Number(a) === Number(b);
    if (typeof a === "number" && typeof b === "number")
        return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
    if (Array.isArray(a) && Array.isArray(b))
        return a.length === b.length && a.every((x, i) => field_same(x, b[i]));
    return a === b;
}

/** resolves a lazy target and remembers each target's initial value (for reset). */
function bind<O extends object, K extends keyof O, V>(obj: Src<O>, key: K, copy: (x: O[K]) => V) {
    const defaults = new WeakMap<object, V>();
    const target = () => {
        const t = SrcVal(obj);
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

function scrub_number(input: HTMLInputElement, o: {
    get: () => number; apply: (v: number) => void; frozen: () => boolean;
    base: () => number;          // units per pixel / per wheel notch
    text: () => string;          // formatted current value
    log?: boolean;               // multiplicative steps for log sliders
}) {
    input.classList.add("scrub");   // gets the drag cursor, see styles.css
    // the drag surface: the box plus its unit label when it has one (see
    // with_unit, which runs first), so a finger on the unit scrubs too
    const host: HTMLElement = input.parentElement?.classList.contains("unit-wrap") ? input.parentElement : input;
    host.classList.add("scrub-host");
    let active = false, moved = false, y0 = 0, v0 = 0, dead = 3, on_unit = false;
    const mult = (e: { shiftKey: boolean; altKey: boolean }) => e.shiftKey ? 10 : e.altKey ? 0.1 : 1;

    // keep the first click from focusing the box, so a drag doesn't start a text edit
    input.addEventListener("mousedown", e => { if (document.activeElement !== input) e.preventDefault(); });
    host.addEventListener("pointerdown", e => {
        if (e.button !== 0 || o.frozen() || document.activeElement === input) return;
        active = true; moved = false; y0 = e.clientY; v0 = o.get();
        on_unit = e.target !== input;                    // the unit: a tap shows its tooltip, no keyboard
        dead = e.pointerType === "mouse" ? 3 : 6;         // fingers wobble more before a tap
        host.setPointerCapture(e.pointerId);
    });
    host.addEventListener("pointermove", e => {
        if (!active) return;
        if (!moved && Math.abs(e.clientY - y0) < dead) return;    // dead zone, so clicks / taps stay clicks
        if (!moved) input.classList.add("scrubbing");      // accent outline while the drag changes the value
        moved = true;
        const dy = y0 - e.clientY, k = mult(e);
        o.apply(o.log ? v0 * Math.exp(dy * 0.01 * k) : v0 + dy * o.base() * k);
    });
    const end = (e: PointerEvent) => {
        if (!active) return;
        active = false;
        input.classList.remove("scrubbing");
        host.releasePointerCapture(e.pointerId);
        if (!moved && !on_unit) { input.focus(); input.select(); }
    };
    host.addEventListener("pointerup", end);
    host.addEventListener("pointercancel", end);

    // wheel steps the value, only while the box is focused
    input.addEventListener("wheel", e => {
        if (document.activeElement !== input || o.frozen()) return;
        e.preventDefault();                                      // don't scroll the inspector
        e.stopPropagation();
        const d = e.deltaY || e.deltaX;
        if (!d) return;
        const dir = d < 0 ? 1 : -1, k = mult(e), v = o.get();
        o.apply(o.log ? v * Math.exp(dir * 0.05 * k) : v + dir * o.base() * k);
        input.value = o.text();
        input.select();
    }, { passive: false });
}
/** wraps a number input so `unit` sits inside its right edge (like the axis
 * letters of a vector field). Returns the element to append. */
function with_unit(row: HTMLElement, input: HTMLInputElement, unit?: UnitDef): HTMLElement {
    if (!unit) return input;
    const wrap = document.createElement("span");
    wrap.className = "unit-wrap";
    wrap.style.setProperty("--uw", String(unit.symbol.length));
    row.classList.add("has-unit");
    row.style.setProperty("--uw", String(unit.symbol.length));

    const u = document.createElement("i");
    u.textContent = unit.symbol;
    // mouse: a click on the unit edits the value; touch: a tap only shows its tooltip
    u.addEventListener("click", e => { if ((e as PointerEvent).pointerType !== "touch" && (e as PointerEvent).pointerType !== "pen") input.focus(); });
    if (unit.name) UI_TOOLTIP.attach(u, `{${unit.name}}`);

    wrap.append(input, u);
    return wrap;
}

/** primary input is touch (phones / tablets): no hover, no keyboard. Used to
 * skip autofocus (it opens the keyboard) and keyboard hints in tooltips. */
function is_touch() { return matchMedia("(pointer: coarse)").matches; }
