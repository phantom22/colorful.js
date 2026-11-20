"use strict";
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
