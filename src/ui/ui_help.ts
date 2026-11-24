/* The toast (a short message with an optional action, e.g. "Cleared · Undo")
 * and the controls overlay (?), which lists every key and gesture: a desktop
 * version and a touch version. */

let _toast_el: HTMLElement | null = null, _toast_timer = 0;

/** shows a message near the bottom for `ms`, replacing any current one. */
function ui_toast(text:string, action?: { label:string, run:() => void }, ms = 5000) {
    if (!_toast_el) {
        _toast_el = document.createElement("div");
        _toast_el.id = "toast";
        isolate(_toast_el);
        $("hud").appendChild(_toast_el);
    }
    const el = _toast_el;
    el.replaceChildren();
    const span = document.createElement("span");
    span.textContent = text;
    el.append(span);
    if (action) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = action.label;
        b.addEventListener("click", () => { action.run(); b.blur(); });
        el.append(b);
    }
    el.hidden = false;
    clearTimeout(_toast_timer);
    _toast_timer = window.setTimeout(ui_toast_hide, ms);
}

function ui_toast_hide() {
    clearTimeout(_toast_timer);
    if (_toast_el) _toast_el.hidden = true;
}

// ---------------------------------------------------------------- controls overlay

/** [keys / gesture, what it does]. In the keys, [K] is a key chip. */
type HelpGroup = [string, [string, string][]];

const HELP_DESKTOP: HelpGroup[] = [
    ["Tools", [
        ["[Q] [W] [E] [R]", "Dye + Force, Dye, Force, Wall brush"],
        ["[G]", "geyser mode on / off"],
        ["hold [Shift]", "erase: walls, or geysers in geyser mode"],
        ["hold [Ctrl]", "straight wall lines"],
        ["[Esc]", "close an editor, else back to the plain brush"],
        ["wheel", "brush size (force field on: zoom)"],
    ]],
    ["Geysers", [
        ["click · drag", "in geyser mode: place one (a drag aims its push)"],
        ["click a geyser", "edit it: in geyser mode, or after resting the pointer on it"],
        ["right-click a geyser", "delete it, after resting the pointer on it"],
    ]],
    ["Force field and view", [
        ["[F]", "force field on / off"],
        ["[T]", "edit the field (GLSL)"],
        ["right-drag", "pan the field"],
        ["[↑] [↓]", "field strength"],
        ["[←] [→]", "view palette"],
        ["[A]", "velocity arrows"],
        ["[Tab]", "closed borders on / off"],
        ["[H] · [I]", "hide the UI · slide the inspector out"],
    ]],
    ["Clearing", [
        ["[Backspace]", "clear everything"],
        ["[Ctrl] [Backspace]", "clear the walls (and geysers)"],
        ["[Shift] [Backspace]", "clear the dye only"],
        ["[Ctrl] [Z]", "undo the last clear (for a few seconds)"],
        ["bin button", "the same three clears, from the toolbar"],
    ]],
    ["Inspector", [
        ["drag a number", "up / down to change it, [Shift] faster, [Alt] finer"],
        ["double-click a row", "reset it"],
        ["[?]", "this help"],
    ]],
];

const HELP_TOUCH: HelpGroup[] = [
    ["Tools", [
        ["one finger", "draw with the current tool"],
        ["tap the tool again", "its modes (or long-press it): geysers, erase, straight lines, …"],
        ["bin button", "clear the dye, the walls or everything (undo in the message)"],
    ]],
    ["Geysers", [
        ["tap · drag", "in geyser mode: place one (a drag aims its push)"],
        ["tap a geyser", "in geyser mode: edit it"],
        ["long-press a geyser", "edit it, with any tool"],
    ]],
    ["Force field", [
        ["two fingers", "pan, pinch to zoom"],
        ["long-press the field button", "edit the field (GLSL)"],
    ]],
    ["Inspector", [
        ["tap a label", "what the setting does"],
        ["drag a number", "up / down to change it"],
        ["tab on the edge", "slide the inspector out / back"],
    ]],
];

let _help_el: HTMLElement | null = null;
/** set by init_ui: the toolbar toggle, kept in sync when the overlay closes another way. */
let ui_help_btn: { set: (on: boolean, notify?: boolean) => void } | null = null;

function ui_help_open() { return !!_help_el && !_help_el.hidden; }

function ui_help_build() {
    const esc = (s:string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const keys = (s:string) => esc(s).replace(/\[([^\]]+)\]/g, "<kbd>$1</kbd>");
    const groups = is_touch() ? HELP_TOUCH : HELP_DESKTOP;
    const el = document.createElement("div");
    el.id = "help";
    el.hidden = true;
    el.innerHTML = `<div class="help-card" role="dialog" aria-label="Controls">` +
        `<header><span>CONTROLS</span><button type="button" class="help-close" title="Close${is_touch() ? "" : "  [Esc]"}">×</button></header>` +
        `<div class="help-body">` + groups.map(([title, rows]) =>
            `<section><h4>${esc(title)}</h4>` +
            rows.map(([k, d]) => `<div class="help-row"><span class="help-keys">${keys(k)}</span><span>${keys(d)}</span></div>`).join("") +
            `</section>`).join("") +
        `</div></div>`;
    isolate(el);
    el.addEventListener("click", e => { if (e.target === el) ui_help_show(false); });   // the backdrop
    el.querySelector(".help-close")!.addEventListener("click", () => ui_help_show(false));
    $("hud").appendChild(el);
    return el;
}

/** opens / closes the controls overlay. */
function ui_help_show(on:boolean) {
    if (on && !_help_el) _help_el = ui_help_build();
    if (!_help_el) return;
    _help_el.hidden = !on;
    ui_help_btn?.set(on, false);
    if (on) {
        ui_toast_hide();
        // a toolbar tooltip (e.g. from tapping the ? button) would sit on top
        document.querySelectorAll<HTMLElement>(".tb-tip").forEach(t => t.hidden = true);
    }
}

/** first visit: one hint about the overlay. */
function ui_help_first_hint() {
    const KEY = "help_hint_seen";
    try { if (localStorage.getItem(KEY)) return; localStorage.setItem(KEY, "1"); } catch { return; }
    ui_toast(is_touch() ? "Tap ? in the toolbar for all controls" : "Press ? for all controls",
             { label: "Show", run: () => ui_help_show(true) }, 8000);
}
