let shift_down = false,
    ctrl_down = false;

function w_keydown(e:KeyboardEvent) {
    if (e.key === "Shift") {
        shift_down = true;
        broke_stroke = true;
        stroke_count = -1;
    }
    else if (e.key === "Control") {
        ctrl_down = true;
    }
}

function w_keyup(e:KeyboardEvent) {
    if (e.key === "Shift") {
        shift_down = false;
        process_queued_strokes();
    }
    else if (e.key === "Control")
        ctrl_down = false;
    else if (e.key === "p")
        ring_wave();
    else if (e.key === "c")
        request_clear = true;
    else if (e.key === "Escape") {
        toggle_info();
    }
}

window.onkeydown = w_keydown;
window.onkeyup = w_keyup;