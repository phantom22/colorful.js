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
        private readonly onPick: (id: T) => void,
        /** called when the already selected tool is picked again (click, tap or key). */
        private readonly onRepick?: (id: T) => void
    ) {
        isolate(this.nav);
        for (const it of items) {
            if (it.separator) this.nav.appendChild(document.createElement("hr"));
            const b = document.createElement("button");
            b.dataset.tip = it.key ? `${it.tip}  [${it.key.toUpperCase()}]` : it.tip;
            b.innerHTML = `<svg viewBox="0 0 24 24">${it.icon}</svg>`;
            b.addEventListener("click", () => this.choose(it.id));
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