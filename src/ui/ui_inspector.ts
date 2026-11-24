/** small screens get a drawer inspector, see the matching @media in styles.css. */
const INSPECTOR_SMALL_SCREEN = "(max-width: 640px), (max-height: 500px)";

class UI_INSPECTOR {
    private readonly root = $("inspector");
    private readonly body = $("insp-body");
    private readonly reset = $("insp-reset");
    private readonly resize = $("insp-resize");
    private readonly tab = $("insp-tab");
    private readonly sections = new Map<string, UI_SECTION>();

    constructor() {
        isolate(this.root);
        this.reset.addEventListener("click", e => { this.reset_all(); (e.currentTarget as HTMLElement).blur(); });
        this.init_resize();
        this.init_drawer();
    }

    get stowed() { return this.root.classList.contains("stowed"); }
    /** false while stowed or with the HUD hidden: draw then skips refresh. */
    get shown() {
        return !this.stowed && !(ui_container && (ui_container.hidden || ui_container.classList.contains("hidden")));
    }
    /** slides the inspector off the right edge, leaving the tab to bring it back (I toggles it). */
    stow(v = true) {
        if (!v && this.stowed) this.refresh();     // values may be stale, it isn't refreshed while stowed
        this.root.classList.toggle("stowed", v);
        this.tab.textContent = v ? "‹" : "›";
        this.tab.title = v ? "Show inspector  [I]" : "Hide inspector  [I]";
        try { localStorage.setItem("insp_stowed", v ? "1" : "0"); } catch {}
    }

    /** touch: a swipe right on the inspector slides it out. It follows the
     * finger; released past SWIPE_CLOSE_PX (or flicked) it stows, else it
     * snaps back. Not from sliders, text boxes or scrubbed numbers: they own
     * their horizontal drags. */
    private init_swipe() {
        const SWIPE_CLOSE_PX = 70, START_PX = 12;
        let id = -1, x0 = 0, y0 = 0, t0 = 0, dx = 0, dragging = false;
        this.root.addEventListener("pointerdown", e => {
            if (e.pointerType === "mouse" || this.stowed || id !== -1) return;
            if ((e.target as HTMLElement).closest("input, select, textarea, #insp-tab, #insp-resize")) return;
            id = e.pointerId; x0 = e.clientX; y0 = e.clientY; t0 = performance.now(); dx = 0; dragging = false;
        });
        this.root.addEventListener("pointermove", e => {
            if (e.pointerId !== id) return;
            const mx = e.clientX - x0, my = e.clientY - y0;
            if (!dragging) {
                if (Math.abs(my) > START_PX && Math.abs(my) > Math.abs(mx)) { id = -1; return; }   // a vertical scroll
                if (mx < START_PX || mx < Math.abs(my) * 1.5) return;
                dragging = true;
                this.root.setPointerCapture(id);
                this.root.classList.add("no-anim");
            }
            dx = Math.max(0, mx);
            this.root.style.transform = `translateX(${dx}px)`;
        });
        const end = (e: PointerEvent) => {
            if (e.pointerId !== id) return;
            id = -1;
            if (!dragging) return;
            dragging = false;
            const flick = dx > 30 && dx / Math.max(1, performance.now() - t0) > 0.6;   // px per ms
            this.root.classList.remove("no-anim");
            void this.root.offsetWidth;                      // animate from where the finger left it
            this.root.style.transform = "";
            if (dx > SWIPE_CLOSE_PX || flick) this.stow(true);
        };
        this.root.addEventListener("pointerup", end);
        this.root.addEventListener("pointercancel", end);
    }

    private init_drawer() {
        this.init_swipe();
        this.tab.addEventListener("click", e => { this.stow(!this.stowed); (e.currentTarget as HTMLElement).blur(); });
        // phones always start stowed, so the sim is visible; elsewhere the last state is kept
        let saved: string | null = null;
        try { saved = localStorage.getItem("insp_stowed"); } catch {}
        this.root.classList.add("no-anim");     // the inline script in index.html may have stowed it already
        this.stow(matchMedia(INSPECTOR_SMALL_SCREEN).matches || saved === "1");
        // the slide animation only for later toggles, once the start state is painted
        requestAnimationFrame(() => requestAnimationFrame(() => this.root.classList.remove("no-anim")));
    }

    reset_all() {
        for (const s of this.sections.values())
            for (const e of s.fields) if (!e.keep_on_reset) e.reset();
        this.refresh();
    }

    restore_all() {
        for (const s of this.sections.values()) for (const e of s.fields) e.restore();
        this.refresh();
    }

    /** returns the section, creating it on first use. */
    section(name: string, visible?:() => boolean|number, open = true) {
        let s = this.sections.get(name);
        if (!s) {
            s = new UI_SECTION(name, visible, open);
            this.sections.set(name, s);
            this.body.appendChild(s.el);
        }
        return s;
    }

    /** opens one section and closes the others (the pinned palette stays as it is). */
    focus(name: string) {
        const target = this.sections.get(name);
        if (!target) return;
        target.open(true);
        target.el.scrollIntoView({ block: "nearest" });
    }

    refresh() {
        let n = 0;
        for (const s of this.sections.values()) n += s.refresh();
        this.reset.classList.toggle("dirty", n > 0);
    }

    private init_resize() {
        const resize = this.resize;
        const MIN = 240, MAX = () => Math.min(720, innerWidth - 120);
        const saved = parseInt(localStorage.getItem("insp_w") ?? "", 10);
        if (saved) this.root.style.width = `${Math.min(MAX(), Math.max(MIN, saved))}px`;

        resize.addEventListener("pointerdown", e => {
            resize.setPointerCapture(e.pointerId);
            const x0 = e.clientX, w0 = this.root.getBoundingClientRect().width;
            const move = (ev: PointerEvent) => {
                // the panel is anchored right, so dragging left makes it wider
                const w = Math.min(MAX(), Math.max(MIN, w0 + (x0 - ev.clientX)));
                this.root.style.width = `${w}px`;
            };
            const up = (ev: PointerEvent) => {
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