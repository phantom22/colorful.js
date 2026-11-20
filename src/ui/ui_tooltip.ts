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

    private static ensure() {
        if (this.el) return;
        this.el = document.createElement("div");
        this.el.className = "tt";
        this.el.hidden = true;
        this.hud.appendChild(this.el);
    }

    /** attaches a rich tooltip to an element. */
    static attach(target: HTMLElement, src: string | (() => string), delay = 350) {
        this.ensure();
        target.addEventListener("mouseenter", () => {
            clearTimeout(this.timer);
            this.timer = window.setTimeout(
                () => this.show(target, render_tooltip(typeof src === "function" ? src() : src)), delay);
        });
        const hide = () => { clearTimeout(this.timer); this.el.hidden = true; };
        target.addEventListener("mouseleave", hide);
        target.addEventListener("mousedown", hide);
    }

    private static show(target: HTMLElement, html: string) {
        this.el.innerHTML = html;
        this.el.hidden = false;
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