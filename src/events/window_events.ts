/** event called on window.onmouseleave and on window.onblur */
/** drops presses and held keys. keep_line: leave a straight wall line being
 * dragged alone. A resize or a focus loss can happen in the middle of one
 * (a phone's system bar sliding in at the top edge), and dropping it there
 * made lines up to the top edge nearly impossible to draw. */
function state_cleanup(keep_line = false) {
    if (keep_line && wall_line_pending()) return;
    mouse.m1_down = mouse.m2_down = false;
    keyboard.shift_down = keyboard.ctrl_down = keyboard.alt_down = false;
    splat.next_is_start = obstacle_splat.next_is_start = true;
    canvas_el.style.cursor = "none";
}

function d_visibilitychange() {
    renderer.window_hidden = document.hidden;
    state_cleanup();
}

window.onblur = () => state_cleanup(true);
document.onvisibilitychange = d_visibilitychange;
window.addEventListener("wheel", w_wheel, {passive:false});
addEventListener("blur", () => state_cleanup(true));
window.onload = main;