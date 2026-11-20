"use strict";
const MOUSE_MODE_DYE_FORCE = 0, MOUSE_MODE_DYE = 1, MOUSE_MODE_FORCE = 2, MOUSE_MODE_WALL = 3;
const MODE2STR = {};
MODE2STR[MOUSE_MODE_DYE_FORCE] = "Dye + Force";
MODE2STR[MOUSE_MODE_DYE] = "Dye";
MODE2STR[MOUSE_MODE_FORCE] = "Force";
MODE2STR[MOUSE_MODE_WALL] = "Wall";
const mouse = {
    /** value set to true whenever the mouse's left button is pressed. */
    m1_down: false,
    /** value set to true only when mouse1_down is not true and the mouse's
      * wheel button is pressed. */
    m2_down: false,
    last_processed_frame: -1,
    uv_pos: new Float32Array(2),
    prev_uv_pos: new Float32Array(2),
    mode: MOUSE_MODE_DYE_FORCE,
    over_canvas: false,
    wall_anchor: new Float32Array(2), // where the next ctrl-line starts
};
let _mouse_never_processed = true;
function process_client_pos(clientX, clientY) {
    mouse.uv_pos[0] = (clientX - canvas_rect.left) / canvas_rect.width;
    mouse.uv_pos[1] = (canvas_rect.bottom - clientY) / canvas_rect.height;
    const f = force.span * 0.5;
    ui_status.cursor(force.center[0] + (mouse.uv_pos[0] - 0.5) * f * ASPECT_NUM, force.center[1] + (mouse.uv_pos[1] - 0.5) * f);
}
/** event called on canvas.onmouseleave */
function c_mouseleave() {
    splat.next_is_start = obstacle_splat.next_is_start = true;
    mouse.over_canvas = false;
}
/** event called on canvas.onmousedown */
function c_mousedown(e) {
    document.activeElement?.blur();
    if (e.button === 3)
        return;
    if (_mouse_never_processed) {
        process_client_pos(e.clientX, e.clientY);
        _mouse_never_processed = false;
    }
    if (e.button === 0) {
        mouse.wall_anchor.set(mouse.uv_pos);
        mouse.m1_down = true;
        mouse.m2_down = false;
        dispatch_splat(mouse.uv_pos, true);
    }
    else if (force.is_active && !mouse.m1_down && e.button === 2) {
        mouse.m2_down = true;
        mouse.prev_uv_pos.set(mouse.uv_pos);
        canvas_el.style.cursor = "grabbing";
        return;
    }
}
/** event called on window.onmousemove */
function w_mousemove(e) {
    mouse.over_canvas = e.target.id === "screen";
    process_client_pos(e.clientX, e.clientY);
    canvas_el.style.cursor = mouse.m2_down ? "grabbing" : "none";
    if (!mouse.m1_down && !mouse.m2_down)
        return;
    if (mouse.m2_down) {
        if (!force.is_active)
            return;
        const f = force.span * 0.5;
        force.center[0] -= (mouse.uv_pos[0] - mouse.prev_uv_pos[0]) * f * ASPECT_NUM;
        force.center[1] -= (mouse.uv_pos[1] - mouse.prev_uv_pos[1]) * f;
        mouse.prev_uv_pos.set(mouse.uv_pos);
        renderer.request_color_clear(false, false);
        ui_update_bounds();
        ui_field_center.refresh();
        return;
    }
    const frame = renderer.frame;
    if (mouse.last_processed_frame === frame)
        return;
    mouse.last_processed_frame = frame;
    if (mouse.mode === MOUSE_MODE_WALL && keyboard.ctrl_down)
        return;
    dispatch_splat(mouse.uv_pos, false);
    mouse.wall_anchor.set(mouse.uv_pos);
}
/** event called on window.onmouseup */
function w_mouseup(e) {
    if (e.button === 2) {
        e.preventDefault();
        mouse.m2_down = false;
        canvas_el.style.cursor = "none";
        return;
    }
    if (e.button !== 0)
        return;
    if (mouse.mode === MOUSE_MODE_WALL && keyboard.ctrl_down)
        dispatch_splat(mouse.uv_pos, false);
    splat.next_is_start = obstacle_splat.next_is_start = true;
    mouse.m1_down = false;
}
/** event called on canvas.onwheel */
function w_wheel(e) {
    if (e.target.closest("#inspector,#view-select,#tools,#status"))
        return;
    e.preventDefault();
    if (!force.is_active)
        return;
    // normalize line/page modes to pixels
    const dy = -e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
    force.span *= Math.exp(dy * 0.00025); // wheel down: larger span, more of the field visible
    force.span = Math.min(Math.max(force.span, 0.01), 200);
    renderer.request_color_clear(false, false);
    ui_field_span.refresh();
    ui_update_bounds();
}
