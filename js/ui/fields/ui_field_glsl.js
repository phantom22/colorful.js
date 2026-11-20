"use strict";
const UNTITLED = "untitled script";
class UI_FIELD_GLSL extends UI_FIELD {
    o;
    win = document.createElement("div");
    $title;
    $lib;
    saved = [];
    ta;
    hl;
    sq;
    gut;
    $err;
    errors = [];
    timer = 0;
    built = false;
    $btn;
    busy = false;
    btn_timer = 0;
    $save;
    query = "";
    def_title = "";
    save_timer = 0;
    $unsaved;
    title_prev = "";
    constructor(parent, label, key, io, o) {
        const t = io.tooltip;
        delete io.tooltip;
        super(parent, label, key, io, "glsl");
        this.o = o;
        this.def_title = o.title();
        const b = document.createElement("button");
        b.className = "glsl-open";
        b.textContent = o.button;
        b.addEventListener("click", () => this.open());
        this.root.appendChild(b);
        if (t)
            UI_TOOLTIP.attach(b, t);
    }
    draft() { return this.pid ? store.get(this.pid) : undefined; }
    save_draft() {
        if (this.pid && this.built)
            store.set(this.pid, { label: this.$title.value, src: this.ta.value });
    }
    save() { } // the generic path would store the bare source
    save_now() { }
    show() { this.lock(this.io.frozen?.() !== undefined); }
    apply(v) { if (this.is_frozen)
        return; this.io.set(v); this.io.onChange?.(v); }
    get is_open() { return this.built && !this.win.hidden; }
    open() {
        if (this.is_frozen)
            return;
        if (!this.built)
            this.build();
        this.load_saved();
        const d = this.draft();
        this.ta.value = d?.src ?? this.io.get();
        this.$title.value = d?.label ?? this.o.title();
        this.win.hidden = false;
        this.errors = [];
        this.$err.textContent = "";
        this.render();
        this.ta.focus();
        this.set_btn("idle");
        this.$lib.hidden = true;
        this.update_unsaved();
    }
    close() {
        this.save_draft();
        this.win.hidden = true;
        document.activeElement?.blur();
    }
    /** compiles the editor text. On success the window closes. */
    submit() {
        if (this.busy)
            return;
        this.busy = true;
        this.set_btn("busy");
        const t0 = performance.now();
        // one frame, so the loader is painted before the (synchronous) compile
        requestAnimationFrame(() => setTimeout(() => {
            const result = this.run_compile();
            const wait = Math.max(0, 250 - (performance.now() - t0));
            setTimeout(() => {
                this.busy = false;
                if (result.ok)
                    this.set_btn("ok", 1400);
                // @ts-ignore
                else {
                    this.show_errors(result.errors);
                    this.set_btn("fail");
                } // stays red until the next edit
            }, wait);
        }, 0));
    }
    load_saved() {
        const key = this.o.library?.storage_key;
        if (!key)
            return;
        try {
            this.saved = JSON.parse(localStorage.getItem(key) ?? "[]");
        }
        catch {
            this.saved = [];
        }
    }
    is_stored() {
        const label = this.$title.value.trim(), src = this.ta.value;
        const field_same = (e) => e.label === label && e.src === src;
        return this.saved.some(field_same) || (this.o.library?.defaults().some(field_same) ?? false);
    }
    update_unsaved() {
        if (!this.built)
            return;
        this.$unsaved.hidden = !this.o.library || this.is_stored();
    }
    /** lint, compile and apply. Works without the editor DOM, so restore and reset can use it. */
    try_commit(src, title, restoring) {
        const hard = lint_glsl(src, this.o.required_fn);
        if (hard.length)
            return { ok: false, errors: hard.map(h => ({ ...h, hard: true })) };
        const log = this.o.compile(src, restoring);
        if (log === null) {
            this.apply(src);
            this.o.set_title(title.trim() || this.o.title());
            return { ok: true };
        }
        const found = [];
        for (const m of log.matchAll(/(?:ERROR|WARNING):\s*\d+:(\d+):\s*([^\n]*)/g))
            found.push({ line: Math.max(1, +m[1] - this.o.line_offset), msg: m[2], hard: true });
        return { ok: false, errors: found.length ? found : [{ line: 1, msg: log.trim(), hard: true }] };
    }
    run_compile() {
        const r = this.try_commit(this.ta.value, this.$title.value, false);
        if (r.ok) {
            if (this.pid)
                store.set(this.pid + ".applied", { label: this.o.title(), src: this.ta.value });
            this.errors = [];
            this.$err.textContent = "";
            this.render();
        }
        return r;
    }
    restore() {
        const a = this.pid ? store.get(this.pid + ".applied") : undefined;
        if (a && typeof a.src === "string")
            this.try_commit(a.src, a.label || this.def_title, true);
    }
    reset() {
        if (this.pid) {
            store.del(this.pid);
            store.del(this.pid + ".applied");
        }
        const src = this.io.def();
        this.try_commit(src, this.def_title, true);
        if (this.built) {
            this.ta.value = src;
            this.$title.value = this.def_title;
            this.errors = [];
            this.$err.textContent = "";
            this.set_btn("idle");
            this.render();
            this.update_unsaved();
        }
    }
    show_errors(errs) {
        this.errors = errs;
        this.$err.textContent = errs.map(e => `line ${e.line}: ${e.msg}`).join("\n");
        this.$err.scrollTop = 0;
        this.render();
    }
    render() {
        const src = this.ta.value, lines = src.split("\n");
        this.hl.innerHTML = highlight_glsl(src);
        this.gut.innerHTML = lines.map((_, i) => `<span${this.errors.some(e => e.line === i + 1 && e.hard) ? ' class="e"' : ""}>${i + 1}</span>`).join("\n") + "\n";
        // squiggle layer: field_same text, transparent, only the error lines underlined
        const bad = new Map(this.errors.map(e => [e.line, e]));
        this.sq.innerHTML = lines.map((l, i) => {
            if (!bad.has(i + 1) || !l.trim())
                return esc(l);
            const lead = l.length - l.trimStart().length, body = l.trimStart();
            return esc(l.slice(0, lead)) + `<span class="sq">${esc(body)}</span>`;
        }).join("\n") + "\n";
        this.sync();
    }
    sync() {
        for (const p of [this.hl, this.sq, this.gut]) {
            p.scrollTop = this.ta.scrollTop;
            p.scrollLeft = p === this.gut ? 0 : this.ta.scrollLeft;
        }
    }
    set_btn(state, revert_ms = 0) {
        clearTimeout(this.btn_timer);
        this.$btn.dataset.state = state;
        this.$btn.querySelector(".lbl").textContent =
            state === "busy" ? "Compiling" : state === "ok" ? "✓ Compiled" : state === "fail" ? "✕ Failed" : "▶ Compile";
        if (revert_ms)
            this.btn_timer = window.setTimeout(() => this.set_btn("idle"), revert_ms);
    }
    build() {
        if (this.built)
            return;
        this.built = true;
        const w = this.win;
        w.className = "glsl-win";
        w.hidden = true;
        w.innerHTML = `
        <header>
            ${this.o.library ? '<button class="lib" title="Browse saved and default fields">▾</button>' : ""}
            <input class="title" spellcheck="false" maxlength="60" title="Click to rename">
            <span class="unsaved" hidden>(unsaved)</span>
            <button class="compile" data-state="idle" title="Ctrl+S">
                <span class="spin"></span><span class="lbl">▶ Compile</span><kbd>Ctrl+S</kbd>
            </button>
            <button class="x" title="Close (Esc)">×</button>
        </header>
        <div class="lib-pop" hidden></div>
        <div class="gbody">
            <pre class="gut" aria-hidden="true"></pre>
            <div class="ed">
                <pre class="hl" aria-hidden="true"></pre>
                <pre class="sqp" aria-hidden="true"></pre>
                <textarea spellcheck="false" autocapitalize="off" autocomplete="off"></textarea>
                <button class="save-snip" title="Save current as a snippet">+ Save</button>
            </div>
        </div>
        <footer class="gerr"></footer>`;
        this.$title = w.querySelector(".title");
        this.$lib = w.querySelector(".lib-pop");
        this.gut = w.querySelector(".gut");
        this.hl = w.querySelector(".hl");
        this.sq = w.querySelector(".sqp");
        this.ta = w.querySelector("textarea");
        this.$err = w.querySelector(".gerr");
        this.$btn = w.querySelector(".compile");
        this.$save = w.querySelector(".save-snip");
        if (!this.o.library)
            this.$save.hidden = true;
        this.$save.addEventListener("click", () => this.save_current());
        w.querySelector(".x").addEventListener("click", () => this.close());
        w.querySelector(".compile").addEventListener("click", () => this.submit());
        this.ta.addEventListener("scroll", () => this.sync());
        this.ta.addEventListener("input", () => {
            this.save_draft();
            this.update_unsaved();
            if (this.$btn.dataset.state === "fail" || this.$btn.dataset.state === "ok")
                this.set_btn("idle");
            this.errors = []; // stale after an edit
            this.$err.textContent = "";
            this.render();
            clearTimeout(this.timer);
            this.timer = window.setTimeout(() => {
                const l = lint_glsl(this.ta.value, this.o.required_fn);
                if (l.length) {
                    this.errors = l.map(x => ({ ...x, hard: false }));
                    this.$err.textContent = "";
                    this.render();
                }
            }, 400);
        });
        w.addEventListener("keydown", e => {
            e.stopPropagation(); // keep global hotkeys out
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                this.submit();
            }
            else if (e.key === "Escape") {
                if (!this.$lib.hidden)
                    this.$lib.hidden = true;
                else
                    this.close();
            }
            else if (e.key === "Tab" && e.target === this.ta) {
                e.preventDefault();
                this.ta.setRangeText("    ", this.ta.selectionStart, this.ta.selectionEnd, "end");
                this.ta.dispatchEvent(new Event("input"));
            }
        });
        this.$unsaved = w.querySelector(".unsaved");
        this.$title.addEventListener("focus", () => { this.title_prev = this.$title.value; });
        this.$title.addEventListener("input", () => { this.save_draft(); this.update_unsaved(); });
        this.$title.addEventListener("change", () => this.rename());
        this.$title.addEventListener("keydown", e => {
            if (e.key === "Enter")
                this.$title.blur();
            else if (e.key === "Escape") { // revert, don't close the window
                this.$title.value = this.title_prev;
                this.save_draft();
                this.update_unsaved();
                this.$title.blur();
                e.stopPropagation();
            }
        });
        w.querySelector(".lib")?.addEventListener("click", e => { e.stopPropagation(); this.toggle_lib(); });
        w.addEventListener("click", e => {
            if (!this.$lib.hidden && !this.$lib.contains(e.target))
                this.$lib.hidden = true;
        });
        isolate(w);
        w.addEventListener("wheel", e => e.stopPropagation(), { passive: true });
        $("hud").appendChild(w);
    }
    refresh_value() { }
    rename() {
        this.$title.value = this.$title.value.trim() || UNTITLED;
        this.save_draft();
        this.update_unsaved();
    }
    $list;
    toggle_lib() {
        if (!this.$lib.hidden) {
            this.$lib.hidden = true;
            return;
        }
        const key = this.o.library.storage_key;
        try {
            this.load_saved();
        }
        catch {
            this.saved = [];
        }
        this.query = "";
        this.$lib.replaceChildren();
        const search = document.createElement("input");
        search.className = "lib-search";
        search.type = "text";
        search.placeholder = "Search…";
        search.spellcheck = false;
        search.addEventListener("input", () => { this.query = search.value; this.render_lib(); });
        search.addEventListener("keydown", e => {
            if (e.key === "Enter") { // load the first match
                const first = this.$list.querySelector(".lib-item");
                first?.click();
            }
        });
        this.$list = document.createElement("div");
        this.$lib.append(search, this.$list);
        this.$lib.hidden = false;
        this.render_lib();
        search.focus();
    }
    render_lib() {
        const list = this.$list;
        list.replaceChildren();
        const q = this.query.trim().toLowerCase();
        const match = (e) => !q || e.label.toLowerCase().includes(q);
        const group = (name, items, deletable) => {
            const shown = items.filter(match);
            if (!shown.length)
                return;
            const h = document.createElement("div");
            h.className = "lib-h";
            h.textContent = name;
            list.appendChild(h);
            for (const it of shown) {
                const row = document.createElement("div");
                row.className = "lib-item";
                const s = document.createElement("span");
                s.textContent = it.label;
                row.appendChild(s);
                row.addEventListener("click", () => this.pick(it));
                if (deletable) {
                    const x = document.createElement("button");
                    x.textContent = "×";
                    x.title = "Delete";
                    x.addEventListener("click", e => {
                        e.stopPropagation();
                        this.saved.splice(this.saved.indexOf(it), 1); // index in the full list, not the filtered one
                        this.persist();
                        this.update_unsaved();
                        this.render_lib();
                    });
                    row.appendChild(x);
                }
                list.appendChild(row);
            }
        };
        group("Saved", this.saved, true);
        group("Default", this.o.library.defaults(), false);
        if (!list.firstChild) {
            const none = document.createElement("div");
            none.className = "lib-empty";
            none.textContent = "No matches";
            list.appendChild(none);
        }
    }
    persist() {
        try {
            localStorage.setItem(this.o.library.storage_key, JSON.stringify(this.saved));
        }
        catch { }
    }
    pick(e) {
        this.$lib.hidden = true;
        this.ta.value = e.src;
        this.$title.value = e.label;
        this.save_draft();
        this.update_unsaved();
        this.errors = [];
        this.$err.textContent = "";
        this.set_btn("idle");
        this.render();
        this.submit();
    }
    flash_save(text) {
        this.$save.textContent = text;
        clearTimeout(this.save_timer);
        this.save_timer = window.setTimeout(() => { this.$save.textContent = "+ Save"; }, 1200);
    }
    save_current() {
        const label = this.$title.value.trim();
        if (!label || label === UNTITLED) {
            this.$title.focus();
            this.$title.select();
            return this.flash_save("Name it first");
        }
        else if (this.o.library?.defaults().some(d => d.label === label && d.src !== this.ta.value)) {
            this.$title.focus();
            this.$title.select();
            return this.flash_save("Name taken");
        }
        this.load_saved();
        const entry = { label, src: this.ta.value };
        const i = this.saved.findIndex(s => s.label === label);
        if (i >= 0)
            this.saved[i] = entry;
        else
            this.saved.push(entry);
        this.persist();
        this.save_draft();
        this.update_unsaved();
        this.flash_save(i >= 0 ? "✓ Updated" : "✓ Saved");
        if (!this.$lib.hidden)
            this.render_lib();
    }
}
