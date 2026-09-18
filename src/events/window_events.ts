/** event called on window.onmouseleave and on window.onblur */
function state_cleanup() {
    mouse1_down = false;
    mouse3_down = false;
    shift_down = false;
    ctrl_down = false;
    hovered_id = undefined;

    remove_highlights();
    queued_strokes = [];
    stroke_count = -1;
}

function d_visibilitychange() {
    window_hidden = document.hidden;
}


window.onresize = update_viewport;
window.onblur = state_cleanup;
document.onvisibilitychange = d_visibilitychange;
// window.onmouseleave = state_cleanup;
window.addEventListener("wheel", w_wheel, {passive:false});
window.onload = init;