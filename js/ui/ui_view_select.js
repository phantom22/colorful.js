"use strict";
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
        isolate(this.root);
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
