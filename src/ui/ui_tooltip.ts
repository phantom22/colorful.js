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
    private static hud = $("hud");
    /** touch: the element whose tooltip a tap opened. */
    private static owner: HTMLElement | null = null;
    /** time of the last touch / pen contact: the mouse events a tap emulates
     * right after it must not drive the hover logic. */
    private static last_touch = -1e9;

    private static ensure() {
        if (this.el) return;
        this.el = document.createElement("div");
        this.el.className = "tt";
        this.el.hidden = true;
        this.hud.appendChild(this.el);
        // touch: any contact outside the owner closes a tapped tooltip, so does scrolling
        document.addEventListener("pointerdown", e => {
            if (e.pointerType === "mouse") return;
            this.last_touch = performance.now();
            if (this.owner && !this.owner.contains(e.target as Node)) this.hide();
        }, true);
        document.addEventListener("scroll", () => { if (this.owner) this.hide(); }, true);
    }

    private static hide() {
        clearTimeout(this.timer);
        this.el.hidden = true;
        this.owner = null;
    }

    /** emulated mouse events that follow a touch. */
    private static from_touch() { return performance.now() - this.last_touch < 800; }

    /** attaches a rich tooltip to an element. */
    static attach(target: HTMLElement, src: string | (() => string), delay = 350) {
        this.ensure();
        const html = () => render_tooltip(typeof src === "function" ? src() : src);
        target.addEventListener("mouseenter", () => {
            if (this.from_touch()) return;
            clearTimeout(this.timer);
            this.timer = window.setTimeout(() => this.show(target, html()), delay);
        });
        const hide = () => { if (!this.from_touch()) this.hide(); };
        target.addEventListener("mouseleave", hide);
        target.addEventListener("mousedown", hide);

        // touch: a tap shows it (a second tap, or one elsewhere, hides it).
        // Buttons keep their tap for their own action.
        if (target.tagName === "BUTTON") return;
        target.classList.add("has-tt");
        let swallow = false;
        target.addEventListener("pointerup", e => {
            if (e.pointerType === "mouse") return;
            if (this.owner === target && !this.el.hidden) this.hide();
            else this.show_touch(target, html());
            swallow = true;
        });
        // the tap is for the help only, e.g. not a section header toggle
        target.addEventListener("click", e => { if (swallow) { swallow = false; e.stopPropagation(); } });
    }

    /** touch: a card under the row (above it when there's no room), up to the screen width. */
    private static show_touch(target: HTMLElement, html: string) {
        this.el.innerHTML = html;
        this.el.hidden = false;
        this.el.classList.add("touch");
        this.owner = target;
        this.el.style.left = this.el.style.top = "0px";     // measure at full available width
        const r = (target.closest(".row, h3") ?? target).getBoundingClientRect();
        const w = this.el.offsetWidth, h = this.el.offsetHeight;
        const x = Math.max(8, Math.min(r.right - w, innerWidth - w - 8));
        let y = r.bottom + 6;
        if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - 6);
        this.el.style.left = `${x}px`;
        this.el.style.top = `${y}px`;
    }

    private static show(target: HTMLElement, html: string) {
        this.el.innerHTML = html;
        this.el.hidden = false;
        this.el.classList.remove("touch");
        this.owner = null;
        this.el.style.left = this.el.style.top = "0px";     // measure at full available width
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