    /** set to true when the shift button is pressed. */
let shift_down = false,
    /** set to true only when the ctrl button is pressed and shift is not. */
    ctrl_down = false;

/** event called on window.onkeydown */
function w_keydown(e:KeyboardEvent) {
    if (e.key === "Shift") {
        shift_down = true;
        broke_stroke = true;
        stroke_count = -1;
        palette_color = 0;
    }
    else if (e.key === "Control" && !mouse1_down)
        ctrl_down = true;
}

/** event called on window.onkeyup */
function w_keyup(e:KeyboardEvent) {
    if (e.key === "Shift") {
        shift_down = false;
        process_queued_strokes();
    }
    else if (e.key === "Control")
        ctrl_down = false;
    else if (e.key === "p")
        inward_wave();
    else if (e.key === "c")
        request_clear = true;
    else if (e.key === "Escape")
        dom_toggle_menu();
}

window.onkeydown = w_keydown;
window.onkeyup = w_keyup;