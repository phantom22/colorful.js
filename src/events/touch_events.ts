/** touch maps onto the mouse logic: one finger = left button (draw),
 * two fingers = right button (pan the force field) plus pinch zoom. */
const touch = {
    /** distance between the two fingers on the previous event, 0 = no pinch. */
    pinch_dist: 0,
    /** set once a gesture went to two fingers; lifting one doesn't start drawing. */
    multi: false,
};

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
        press(0);
    }
    else if (e.touches.length === 2) {
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

    if (e.touches.length === 2 && force.is_active && touch.pinch_dist > 0 && d > 0) {
        zoom_span(touch.pinch_dist / d);    // spread fingers: smaller span, zoom in
        touch.pinch_dist = d;
    }

    process_client_pos(x, y);
    if (touch.multi && e.touches.length !== 2) return;
    move();
}

/** event called on canvas touchend and touchcancel */
function c_touchend(e:TouchEvent) {
    e.preventDefault();
    if (e.touches.length < 2 && mouse.m2_down) {
        release(2);
        touch.pinch_dist = 0;
    }
    if (e.touches.length === 0) {
        if (mouse.m1_down) release(0);
        touch.multi = false;
        mouse.over_canvas = false;    // hides the brush overlay
    }
}
