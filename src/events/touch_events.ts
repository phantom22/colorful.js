/** touch maps onto the mouse logic: one finger = left button (draw),
 * two fingers = right button (pan the force field) plus pinch zoom. */
const touch = {
    /** distance between the two fingers on the previous event, 0 = no pinch. */
    pinch_dist: 0,
    /** set once a gesture went to two fingers; lifting one doesn't start drawing. */
    multi: false,
    /** a finger came down on a geyser (outside geyser mode): held still it
     * opens the geyser's editor, moved or lifted it is an ordinary stroke / tap. */
    pending: null as null | { x: number, y: number, g: geyser_t, timer: number },
    /** the long-press opened an editor: the rest of this touch does nothing. */
    consumed: false,
};

/** touch long-press on a geyser: duration (ms), and how far (px) the finger may drift. */
const GEYSER_HOLD_MS = 500, GEYSER_HOLD_SLOP_PX = 10;
/** fingers are less precise than the mouse: geyser pick radius (px) for touch. */
const GEYSER_TOUCH_PICK_PX = 24;

/** drops a pending long-press; `start` begins the ordinary stroke it was
 * holding back, from where the finger came down. */
function touch_pending_end(start:boolean) {
    const p = touch.pending;
    if (!p) return;
    clearTimeout(p.timer);
    touch.pending = null;
    geysers.hover = null;               // unbold (and keep press() off its hover path)
    if (!start) return;
    process_client_pos(p.x, p.y);
    press(0);
}

function touch_center(e:TouchEvent) {
    const a = e.touches[0], b = e.touches[1];
    if (b === undefined) return [a.clientX, a.clientY, 0];
    return [(a.clientX + b.clientX) * 0.5, (a.clientY + b.clientY) * 0.5,
        Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)];
}

/** event called on canvas touchstart */
function c_touchstart(e:TouchEvent) {
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur();
    const [x, y, d] = touch_center(e);
    process_client_pos(x, y);
    mouse.over_canvas = true;

    if (e.touches.length === 1 && !touch.multi) {
        const g = geysers_active() ? null : geyser_at(mouse.uv_pos, GEYSER_TOUCH_PICK_PX);
        if (g) {                          // maybe a long-press to edit it: wait before drawing
            geysers.hover = g;            // bold outline: this is the geyser
            touch.pending = { x, y, g, timer: window.setTimeout(() => {
                touch.pending = null;
                geysers.hover = null;
                touch.consumed = true;
                navigator.vibrate?.(15);
                ui_geyser_editor_open(g);
            }, GEYSER_HOLD_MS) };
            return;
        }
        press(0);
    }
    else if (e.touches.length === 2) {
        touch_pending_end(false);         // a pan / pinch, not a long-press
        if (mouse.m1_down) release(0);    // second finger turns a stroke into a pan
        touch.multi = true;
        touch.pinch_dist = d;
        press(2);
    }
}

/** event called on canvas touchmove */
function c_touchmove(e:TouchEvent) {
    e.preventDefault();
    const [x, y, d] = touch_center(e);

    if (e.touches.length === 2 && touch.pinch_dist > 0 && d > 0) {
        if (force.is_active) zoom_span(touch.pinch_dist / d);    // spread fingers: smaller span, zoom in
        else ui_resize_brush(d / touch.pinch_dist);              // field off: spread fingers, bigger brush
        touch.pinch_dist = d;
    }

    if (touch.consumed) return;
    if (touch.pending && e.touches.length === 1) {
        if (Math.hypot(x - touch.pending.x, y - touch.pending.y) <= GEYSER_HOLD_SLOP_PX) return;
        touch_pending_end(true);          // moved: an ordinary stroke from the touch point
    }
    if (touch.multi && e.touches.length !== 2) return;   // the finger left after a pinch: nothing
    process_client_pos(x, y);                            // two fingers: their midpoint (rings sit there)
    mouse.over_canvas = true;
    move();
}

/** event called on canvas touchend and touchcancel */
function c_touchend(e:TouchEvent) {
    e.preventDefault();
    if (e.touches.length < 2) {
        if (mouse.m2_down) release(2);
        touch.pinch_dist = 0;
        // one finger left after a pinch / pan: it doesn't draw, so no rings
        if (touch.multi) mouse.over_canvas = false;
    }
    if (e.touches.length === 0) {
        if (touch.pending) touch_pending_end(true);   // a quick tap: the ordinary tap
        touch.consumed = false;
        if (mouse.m1_down) release(0);
        touch.multi = false;
        mouse.over_canvas = false;    // hides the brush overlay
    }
}
