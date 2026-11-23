type ViewItem<T extends number> = { id: T; name: string; key?: string };

/** touch swipe on the view button: travel before it counts as a swipe, then per view step. */
const VIEW_SWIPE_START_PX = 12;
const VIEW_SWIPE_PX = 40;

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
        isolate(this.root);
        const keys = new Map<string, T>();

        for (const it of items) {
            const li = document.createElement("li");
            li.innerHTML = `<span>${it.name}</span>${it.key ? `<kbd>${it.key}</kbd>` : ""}`;
            li.addEventListener("click", () => { this.pick(it.id); this.close(); });
            this.list.appendChild(li);
            this.items.set(it.id, { name: it.name, li });
            if (it.key) keys.set(it.key.toLowerCase(), it.id);
        }

        this.btn.addEventListener("click", e => {
            e.stopPropagation();
            if (this.swiped) { this.swiped = false; return; }   // the release after a swipe
            this.toggle();
        });
        this.swipe(items.map(it => it.id));
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

    private swiped = false;

    /** touch / pen: sliding along the button steps through the views, one per
     * VIEW_SWIPE_PX, right = next, left = previous (no wrap-around). */
    private swipe(order: T[]) {
        let id = -1, x0 = 0, y0 = 0, steps = 0, active = false;
        this.btn.addEventListener("pointerdown", e => {
            if (e.pointerType === "mouse" || id !== -1) return;
            id = e.pointerId; x0 = e.clientX; y0 = e.clientY; steps = 0; active = false;
            this.swiped = false;
        });
        this.btn.addEventListener("pointermove", e => {
            if (e.pointerId !== id) return;
            const dx = e.clientX - x0;
            if (!active) {
                // a mostly horizontal slide past the threshold starts the swipe
                if (Math.abs(dx) < VIEW_SWIPE_START_PX || Math.abs(dx) < Math.abs(e.clientY - y0)) return;
                active = this.swiped = true;
                this.btn.setPointerCapture(id);   // keep tracking past the button's edges
                this.close();
                x0 = e.clientX - Math.sign(dx) * VIEW_SWIPE_PX;   // the start counts as the first step
            }
            const want = Math.trunc((e.clientX - x0) / VIEW_SWIPE_PX);
            if (want === steps) return;
            const i = order.indexOf(this.current);
            const j = Math.min(order.length - 1, Math.max(0, i + want - steps));
            steps = want;
            if (order[j] !== this.current) { this.pick(order[j]); navigator.vibrate?.(8); }
        });
        const end = (e: PointerEvent) => { if (e.pointerId === id) id = -1; };
        this.btn.addEventListener("pointerup", end);
        this.btn.addEventListener("pointercancel", end);
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