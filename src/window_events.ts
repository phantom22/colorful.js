/** event called on window.onmouseleave and on window.onblur */
function state_cleanup() {
    mouse_down = false;
    shift_down = false;
    ctrl_down = false;
    hovered_id = undefined;

    remove_highlights();
    queued_strokes = [];
    stroke_count = -1;
}


window.onresize = update_viewport;
window.onblur = state_cleanup;
window.onmouseleave = state_cleanup;

window.onload = init;