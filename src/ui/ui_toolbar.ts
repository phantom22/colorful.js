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

/** touch swipe that opens a tool's flyout: travel (px) before it counts. */
const FLYOUT_SWIPE_PX = 22;
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

/** touch long-press duration on toolbar toggles. */
const TOOLBAR_HOLD_MS = 500;

class UI_TOOLBAR<T extends number> {
    private readonly nav = $("tools");
    private readonly buttons = new Map<T, HTMLButtonElement>();
    private readonly rows = new Map<T, { variants: ToolVariant[], fly: HTMLElement, shown: number }>();
    private open_row: T | null = null;
    private close_timer = 0;
    private readonly touch = is_touch();
    private readonly keys = new Map<string, T>();
    private current: T;

    constructor(
        items: ToolItem<T>[], initial: T,
        private readonly onPick: (id: T) => void,
        /** called when the already selected tool is picked again (click, tap or key). */
        private readonly onRepick?: (id: T) => void
    ) {
        isolate(this.nav);
        for (const it of items) {
            if (it.separator) this.nav.appendChild(document.createElement("hr"));
            const b = document.createElement("button");
            b.dataset.tip = this.touch ? (it.tip_touch ?? it.tip) : it.key ? `${it.tip}  [${it.key.toUpperCase()}]` : it.tip;
            b.innerHTML = `<svg viewBox="0 0 24 24">${it.icon}</svg>`;
            const was_hold = it.onHold ? attach_hold(b, it.onHold) : () => false;
            const was_swipe = it.variants ? this.add_flyout(it.id, b, it.variants) : () => false;
            b.addEventListener("click", () => {
                if (was_hold() || was_swipe()) { b.blur(); return; }
                this.choose(it.id);
            });
            this.nav.appendChild(b);
            this.buttons.set(it.id, b);
            if (it.key) this.keys.set(it.key.toLowerCase(), it.id);
        }
        addEventListener("keydown", e => {
            if (is_typing(e)) return;
            const id = this.keys.get(e.key.toLowerCase());
            if (id !== undefined) this.choose(id);
        });
        this.current = initial;
        this.pick(initial);
    }

    /** the flyout of a tool with variants. Mouse: opens on hover, closes a moment
     * after the pointer left both. Touch: a swipe right from the button opens
     * it; lifting the finger on a variant picks it, elsewhere leaves it open
     * for a tap. A tap outside closes it. Returns whether the click that ends
     * a swipe should be ignored. */
    private add_flyout(id: T, b: HTMLButtonElement, variants: ToolVariant[]) {
        const fly = document.createElement("div");
        fly.className = "flyout";
        fly.hidden = true;
        variants.forEach(v => {
            const vb = document.createElement("button");
            vb.dataset.tip = this.touch ? (v.tip_touch ?? v.tip) : v.tip;
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

        let x0 = 0, y0 = 0, tracking = false, swiped = false, hot: HTMLElement | null = null;
        const under = (e: PointerEvent) => (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>(".flyout button") ?? null;
        b.addEventListener("pointerdown", e => {
            if (e.pointerType === "mouse") return;
            tracking = true; swiped = false; x0 = e.clientX; y0 = e.clientY;
        });
        b.addEventListener("pointermove", e => {
            if (!tracking) return;
            const dx = e.clientX - x0;
            if (!swiped && dx > FLYOUT_SWIPE_PX && dx > Math.abs(e.clientY - y0)) { swiped = true; this.open_flyout(id); }
            if (!swiped) return;
            const h = under(e);
            if (h !== hot) { hot?.classList.remove("hot"); h?.classList.add("hot"); hot = h; }
        });
        const end = (e: PointerEvent) => {
            if (!tracking) return;
            tracking = false;
            if (!swiped) return;
            const h = under(e);
            hot?.classList.remove("hot"); hot = null;
            if (h && fly.contains(h)) h.click();
        };
        b.addEventListener("pointerup", end);
        b.addEventListener("pointercancel", end);
        return () => { const s = swiped; swiped = false; return s; };
    }

    private open_flyout(id: T) {
        if (this.open_row !== null && this.open_row !== id) this.close_flyout();
        const row = this.rows.get(id), b = this.buttons.get(id);
        if (!row || !b) return;
        row.fly.style.top = `${b.offsetTop - 5}px`;
        row.fly.hidden = false;
        b.classList.add("expanded");
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

    /** user pick: a repeat pick of the current tool also calls onRepick. */
    private choose(id: T) {
        if (id === this.current) this.onRepick?.(id);
        this.pick(id);
    }

    /** toggles a class on one tool's button (e.g. "erase"). */
    mark(id: T, cls: string, on: boolean) {
        this.buttons.get(id)?.classList.toggle(cls, on);
    }

    get picked() { return this.current; }

    toggle_visibility() {
        this.nav.hidden = !this.nav.hidden;
    }

    /** onHold: touch / pen long-press action (the press then doesn't toggle). */
    add_toggle(o: { tip: string; tip_touch?: string; icon: string; initial: boolean; onToggle: (on: boolean) => void; separator?: boolean; onHold?: () => void }) {
        if (o.separator !== false) this.nav.appendChild(document.createElement("hr"));
        const b = document.createElement("button");
        b.className = "toggle";
        b.dataset.tip = this.touch ? (o.tip_touch ?? o.tip) : o.tip;
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