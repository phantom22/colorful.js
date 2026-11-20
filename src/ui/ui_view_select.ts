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