/** one mode of a tool (e.g. the wall tool's erase), shown in the row's flyout. */
type ToolVariant = {
    icon: string; tip: string;
    /** tooltip on touch devices: no keyboard keys. */
    tip_touch?: string;
    pick: () => void;
};

type ToolItem<T extends number> = {
    id: T; tip: string; icon: string; key?: string; separator?: boolean;
    /** tooltip on touch devices: no keyboard keys. */
    tip_touch?: string;
    /** touch / pen long-press action (the press then doesn't pick the tool). */
    onHold?: () => void;
    /** the tool's modes: hovering the button (mouse) or swiping right from it
     * (touch) opens a flyout with one button per mode. */
    variants?: ToolVariant[];
};

/** mouse: time (ms) the pointer may spend outside button and flyout before it closes. */
const FLYOUT_CLOSE_MS = 220;

/** touch / pen long-press on a toolbar button. Returns a function telling the
 * next click whether it is the release of a long-press (and should be ignored). */
function attach_hold(b: HTMLButtonElement, onHold: () => void) {
    let timer = 0, x0 = 0, y0 = 0, held = false;
    b.addEventListener("pointerdown", e => {
        if (e.pointerType === "mouse") return;
        held = false; x0 = e.clientX; y0 = e.clientY;
        clearTimeout(timer);
        timer = window.setTimeout(() => {
            held = true;
            navigator.vibrate?.(15);                    // tactile "it worked"
            onHold();
        }, TOOLBAR_HOLD_MS);
    });
    // only a real lift or a slide cancels the hold: mobile browsers fire
    // pointercancel / pointerleave on their own long-press handling
    b.addEventListener("pointerup", () => clearTimeout(timer));
    b.addEventListener("pointermove", e => {
        if (Math.hypot(e.clientX - x0, e.clientY - y0) > 10) clearTimeout(timer);
    });
    b.addEventListener("contextmenu", e => e.preventDefault());   // the phone's long-press menu
    return () => { const h = held; held = false; return h; };
}

/** toolbar tooltip markup. The first line is the title; [K] anywhere is a
 * key chip, and chips at the end of the title line sit on its right. Each
 * further line is one short row. */
function render_toolbar_tip(src: string) {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const chips = (s: string) => esc(s).replace(/\[([^\]]+)\]/g, "<kbd>$1</kbd>");
    const [head, ...rows] = src.split("\n");
    const m = /^(.*?)\s*((?:\[[^\]]+\]\s*)+)$/.exec(head);
    const title = m ? m[1] : head, keys = m ? m[2].trim() : "";
    return `<div class="tbt-head"><span class="tbt-title">${esc(title)}</span>` +
        (keys ? `<span class="tbt-keys">${chips(keys)}</span>` : "") + `</div>` +
        rows.map(r => `<div class="tbt-row">${chips(r)}</div>`).join("");
}

/** touch fallback for an item without tip_touch: drops the key chips from
 * the title and every row about keys, the wheel, hovering or right-clicking. */
function touch_tip(tip: string) {
    const [head, ...rows] = tip.split("\n");
    const mouse_only = /\[|\b(Shift|Ctrl|Esc|Wheel|wheel|[Hh]over|[Rr]ight-(click|drag)|Rest on)\b/;
    return [head.replace(/\s*(\[[^\]]+\]\s*)+$/, ""), ...rows.filter(r => !mouse_only.test(r))]
        .join("\n").replace(/\b[Cc]lick/g, m => m[0] === "C" ? "Tap" : "tap");
}

/** appends " [K]" to the first line of a tip. */
const tip_with_key = (tip: string, key: string) => tip.replace(/^[^\n]*/, h => `${h}  [${key.toUpperCase()}]`);

/** touch: how long (ms) a tapped button's tip stays up. */
const TOOLBAR_TIP_TOUCH_MS = 2500;

/** touch long-press duration on toolbar toggles. */
const TOOLBAR_HOLD_MS = 500;

class UI_TOOLBAR<T extends number> {
    private readonly nav = $("tools");
    private readonly buttons = new Map<T, HTMLButtonElement>();
    private readonly rows = new Map<T, { variants: ToolVariant[], fly: HTMLElement, shown: number }>();
    private open_row: T | null = null;
    private close_timer = 0;
    private readonly touch = is_touch();
    private readonly tip_el = document.createElement("div");
    private tip_owner: HTMLElement | null = null;
    private tip_timer = 0;

    /** the tooltip of b: mouse shows it on hover, touch on tap for a moment. */
    private attach_tip(b: HTMLButtonElement, tip: string, below = false) {
        b.addEventListener("pointerenter", e => { if (e.pointerType === "mouse") this.show_tip(b, tip, below); });
        b.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") this.hide_tip(b); });
        b.addEventListener("click", () => {
            if (!this.touch) return;
            this.show_tip(b, tip, below);
            clearTimeout(this.tip_timer);
            this.tip_timer = window.setTimeout(() => this.hide_tip(b), TOOLBAR_TIP_TOUCH_MS);
        });
    }

    /** beside the button (right), or under it for the flyout's buttons. */
    private show_tip(b: HTMLElement, tip: string, below: boolean) {
        if (b.classList.contains("expanded")) return;   // the flyout's own tips take over
        const t = this.tip_el;
        t.innerHTML = render_toolbar_tip(tip);
        t.hidden = false;
        this.tip_owner = b;
        const r = b.getBoundingClientRect(), w = t.offsetWidth, h = t.offsetHeight;
        let x = below ? r.left : r.right + 10, y = below ? r.bottom + 8 : r.top + r.height / 2 - h / 2;
        x = Math.max(8, Math.min(x, innerWidth - w - 8));
        y = Math.max(8, Math.min(y, innerHeight - h - 8));
        t.style.left = `${x}px`;
        t.style.top = `${y}px`;
    }

    private hide_tip(owner?: HTMLElement) {
        if (owner && owner !== this.tip_owner) return;
        this.tip_el.hidden = true;
        this.tip_owner = null;
    }
    private readonly keys = new Map<string, T>();
    private current: T;

    constructor(
        items: ToolItem<T>[], initial: T,
        /** a pick always starts the tool in its plain brush mode, even a
         * repeat pick: there are no hidden modes to cycle through. */
        private readonly onPick: (id: T) => void
    ) {
        isolate(this.nav);
        // touch: a tip never lingers over the canvas or the inspector, any
        // contact outside the toolbar hides it at once
        document.addEventListener("pointerdown", e => {
            if (e.pointerType !== "mouse" && !this.nav.contains(e.target as Node)) this.hide_tip();
        }, true);
        this.tip_el.className = "tb-tip";
        this.tip_el.hidden = true;
        document.body.appendChild(this.tip_el);
        for (const it of items) {
            if (it.separator) this.nav.appendChild(document.createElement("hr"));
            const b = document.createElement("button");
            this.attach_tip(b, this.touch ? (it.tip_touch ?? touch_tip(it.tip)) : it.key ? tip_with_key(it.tip, it.key) : it.tip);
            b.innerHTML = `<svg viewBox="0 0 24 24">${it.icon}</svg>`;
            if (it.variants) { this.add_flyout(it.id, b, it.variants); b.classList.add("has-modes"); }
            // touch: a long-press shows the tool's modes (no swipe: the toolbar
            // sits on the screen edge, where a swipe right means "back")
            const hold = it.onHold ?? (it.variants ? () => this.open_flyout(it.id) : undefined);
            const was_hold = hold ? attach_hold(b, hold) : () => false;
            b.addEventListener("click", () => {
                if (was_hold()) { b.blur(); return; }
                // touch: tapping the picked tool again shows its modes (no hover there)
                if (this.touch && it.variants && it.id === this.current) { this.open_flyout(it.id); return; }
                this.pick(it.id);
            });
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

    /** the flyout of a tool with variants. Mouse: opens on hover, closes a moment
     * after the pointer left both. Touch: tapping the picked tool again or a
     * long-press opens it; a tap on a variant picks it, a tap outside closes it. */
    private add_flyout(id: T, b: HTMLButtonElement, variants: ToolVariant[]) {
        const fly = document.createElement("div");
        fly.className = "flyout";
        fly.hidden = true;
        variants.forEach(v => {
            const vb = document.createElement("button");
            this.attach_tip(vb, this.touch ? (v.tip_touch ?? touch_tip(v.tip)) : v.tip, true);
            vb.innerHTML = `<svg viewBox="0 0 24 24">${v.icon}</svg>`;
            vb.addEventListener("click", e => { e.stopPropagation(); v.pick(); this.close_flyout(); vb.blur(); });
            fly.appendChild(vb);
        });
        this.nav.appendChild(fly);
        this.rows.set(id, { variants, fly, shown: -1 });

        const keep = () => clearTimeout(this.close_timer);
        const later = () => { keep(); this.close_timer = window.setTimeout(() => this.close_flyout(), FLYOUT_CLOSE_MS); };
        for (const el of [b, fly] as HTMLElement[]) {
            el.addEventListener("pointerenter", (e: PointerEvent) => { if (e.pointerType === "mouse") { keep(); this.open_flyout(id); } });
            el.addEventListener("pointerleave", (e: PointerEvent) => { if (e.pointerType === "mouse") later(); });
        }

    }

    private open_flyout(id: T) {
        if (this.open_row !== null && this.open_row !== id) this.close_flyout();
        const row = this.rows.get(id), b = this.buttons.get(id);
        if (!row || !b) return;
        row.fly.style.top = `${b.offsetTop - 5}px`;
        row.fly.hidden = false;
        b.classList.add("expanded");
        this.hide_tip(b);
        this.open_row = id;
        if (this.touch) document.addEventListener("pointerdown", this.outside, true);
    }

    private readonly outside = (e: PointerEvent) => {
        const row = this.open_row !== null ? this.rows.get(this.open_row) : undefined;
        const t = e.target as Node;
        if (row && (row.fly.contains(t) || this.buttons.get(this.open_row!)?.contains(t))) return;
        this.close_flyout();
    };

    close_flyout() {
        clearTimeout(this.close_timer);
        if (this.open_row === null) return;
        const row = this.rows.get(this.open_row);
        if (row) row.fly.hidden = true;
        this.buttons.get(this.open_row)?.classList.remove("expanded");
        this.open_row = null;
        document.removeEventListener("pointerdown", this.outside, true);
    }

    /** shows variant i as the tool's icon and highlights it in the flyout. */
    show_variant(id: T, i: number) {
        const row = this.rows.get(id), b = this.buttons.get(id);
        if (!row || !b || row.shown === i) return;
        row.shown = i;
        b.querySelector("svg")!.innerHTML = row.variants[i].icon;
        [...row.fly.children].forEach((c, k) => c.classList.toggle("on", k === i));
    }

    /** selects a tool. notify=false only moves the highlight, without calling onPick. */
    pick(id: T, notify = true) {
        this.current = id;
        this.buttons.forEach((b, k) => b.classList.toggle("on", k === id));
        if (notify) this.onPick(id);
    }

    /** toggles a class on one tool's button (e.g. "erase"). */
    mark(id: T, cls: string, on: boolean) {
        this.buttons.get(id)?.classList.toggle(cls, on);
    }

    get picked() { return this.current; }

    toggle_visibility() {
        this.nav.hidden = !this.nav.hidden;
    }

    /** a button that opens a small menu of text actions (e.g. Clear). Opens on
     * click / tap (not hover: the actions can be destructive), closes after a
     * choice, a click / tap elsewhere, or Esc. */
    add_menu(o: { tip: string; tip_touch?: string; icon: string;
                  items: { label: string; keys?: string; danger?: boolean; run: () => void }[] }) {
        this.nav.appendChild(document.createElement("hr"));
        const b = document.createElement("button");
        b.className = "menu-btn has-modes";
        this.attach_tip(b, this.touch ? (o.tip_touch ?? touch_tip(o.tip)) : o.tip);
        b.innerHTML = `<svg viewBox="0 0 24 24">${o.icon}</svg>`;
        const menu = document.createElement("div");
        menu.className = "flyout menu";
        menu.hidden = true;
        const close = () => {
            menu.hidden = true;
            b.classList.remove("expanded");
            document.removeEventListener("pointerdown", outside, true);
        };
        const outside = (e: PointerEvent) => { if (!menu.contains(e.target as Node) && !b.contains(e.target as Node)) close(); };
        for (const it of o.items) {
            const mb = document.createElement("button");
            mb.type = "button";
            if (it.danger) mb.classList.add("danger");
            mb.innerHTML = `<span>${it.label}</span>` +
                (it.keys && !this.touch ? `<span class="keys">${it.keys.split("+").map(k => `<kbd>${k}</kbd>`).join("")}</span>` : "");
            mb.addEventListener("click", e => { e.stopPropagation(); close(); mb.blur(); it.run(); });
            menu.appendChild(mb);
        }
        b.addEventListener("click", () => {
            b.blur();
            if (!menu.hidden) { close(); return; }
            this.close_flyout();
            menu.style.top = `${b.offsetTop - 5}px`;
            menu.hidden = false;
            b.classList.add("expanded");
            this.hide_tip(b);
            document.addEventListener("pointerdown", outside, true);
        });
        addEventListener("keydown", e => { if (e.key === "Escape" && !menu.hidden) close(); });
        this.nav.append(b, menu);
    }

    /** onHold: touch / pen long-press action (the press then doesn't toggle). */
    add_toggle(o: { tip: string; tip_touch?: string; icon: string; initial: boolean; onToggle: (on: boolean) => void; separator?: boolean; onHold?: () => void }) {
        if (o.separator !== false) this.nav.appendChild(document.createElement("hr"));
        const b = document.createElement("button");
        b.className = "toggle";
        this.attach_tip(b, this.touch ? (o.tip_touch ?? touch_tip(o.tip)) : o.tip);
        b.innerHTML = `<svg viewBox="0 0 24 24">${o.icon}</svg>`;
        let state = o.initial;
        const set = (on: boolean, notify = true) => {
            state = on;
            b.classList.toggle("active", on);
            b.setAttribute("aria-pressed", String(on));
            if (notify) o.onToggle(on);
        };
        const was_hold = o.onHold ? attach_hold(b, o.onHold) : () => false;
        b.addEventListener("click", () => {
            if (was_hold()) { b.blur(); return; }           // the release after a long-press
            set(!state); b.blur();                          // blur so Space doesn't re-click it
        });
        this.nav.appendChild(b);
        set(o.initial, false);
        return { set, toggle: () => set(!state), get on() { return state; } };
    }
}