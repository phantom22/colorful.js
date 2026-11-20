"use strict";
class UI_INSPECTOR {
    root = $("inspector");
    body = $("insp-body");
    toggle = $("insp-toggle");
    reset = $("insp-reset");
    resize = $("insp-resize");
    sections = new Map();
    constructor() {
        isolate(this.root);
        this.toggle.addEventListener("click", () => this.collapse(!this.collapsed));
        this.reset.addEventListener("click", e => { this.reset_all(); e.currentTarget.blur(); });
        this.init_resize();
    }
    reset_all() {
        for (const s of this.sections.values())
            for (const e of s.fields)
                e.reset();
        this.refresh();
    }
    restore_all() {
        for (const s of this.sections.values())
            for (const e of s.fields)
                e.restore();
        this.refresh();
    }
    get collapsed() { return this.root.classList.contains("min"); }
    collapse(v = true) {
        this.root.classList.toggle("min", v);
        this.toggle.textContent = v ? "+" : "–";
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
        this.reset.classList.toggle("dirty", n > 0);
    }
    toggle_visibility() {
        this.root.hidden = !this.root.hidden;
    }
    init_resize() {
        const resize = this.resize;
        const MIN = 240, MAX = () => Math.min(720, innerWidth - 120);
        const saved = parseInt(localStorage.getItem("insp_w") ?? "", 10);
        if (saved)
            this.root.style.width = `${Math.min(MAX(), Math.max(MIN, saved))}px`;
        resize.addEventListener("pointerdown", e => {
            resize.setPointerCapture(e.pointerId);
            const x0 = e.clientX, w0 = this.root.getBoundingClientRect().width;
            const move = (ev) => {
                // the panel is anchored right, so dragging left makes it wider
                const w = Math.min(MAX(), Math.max(MIN, w0 + (x0 - ev.clientX)));
                this.root.style.width = `${w}px`;
            };
            const up = (ev) => {
                resize.releasePointerCapture(ev.pointerId);
                resize.removeEventListener("pointermove", move);
                resize.removeEventListener("pointerup", up);
                localStorage.setItem("insp_w", String(Math.round(this.root.getBoundingClientRect().width)));
            };
            resize.addEventListener("pointermove", move);
            resize.addEventListener("pointerup", up);
            e.preventDefault();
        });
        resize.addEventListener("dblclick", () => { this.root.style.width = ""; localStorage.removeItem("insp_w"); });
    }
}
