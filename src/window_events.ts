function w_mouseleave() {
    mouse_down = false;
    shift_down = false;
    ctrl_down = false;
    hovered_id = undefined;
    wave_queue.clear();
    queued_strokes = [];
    stroke_count = 0;
}

function w_blur() {
    mouse_down = false;
    shift_down = false;
    ctrl_down = false;
    hovered_id = undefined;
    wave_queue.clear();
    queued_strokes = [];
    stroke_count = 0;
}

window.onresize = update_viewport;
window.onblur = w_blur;
window.onmouseleave = w_mouseleave;

window.onload = init;