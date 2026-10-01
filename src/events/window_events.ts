/** event called on window.onmouseleave and on window.onblur */
function state_cleanup() {
    mouse.m1_down = false;
    mouse.m3_down = false;
    keyboard.shift_down = false;
    keyboard.ctrl_down = false;
    mouse.last_hovered_id = -1;

    remove_highlights();
    stroke.queue = [];
    stroke.count = -1;
}

function d_visibilitychange() {
    renderer.window_hidden = document.hidden;
}


window.onresize = update_viewport;
window.onblur = state_cleanup;
document.onvisibilitychange = d_visibilitychange;
// window.onmouseleave = state_cleanup;
window.addEventListener("wheel", w_wheel, {passive:false});
window.onload = init;