/** event called on window.onmouseleave and on window.onblur */
function state_cleanup() {
    mouse.m1_down = false;
    mouse.m2_down = false;
    keyboard.shift_down = keyboard.ctrl_down = keyboard.alt_down = false;
    splat.next_is_start = obstacle_splat.next_is_start = true;
}

function d_visibilitychange() {
    renderer.window_hidden = document.hidden;
    state_cleanup();
}

window.onblur = state_cleanup;
document.onvisibilitychange = d_visibilitychange;
window.addEventListener("wheel", w_wheel, {passive:false});
addEventListener("blur", state_cleanup);
window.onload = main;