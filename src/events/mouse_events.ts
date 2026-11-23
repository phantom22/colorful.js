const MOUSE_MODE_DYE = 1,
      MOUSE_MODE_FORCE = 2,
      MOUSE_MODE_DYE_FORCE = 3,
      MOUSE_MODE_WALL = 4;
type mouse_mode_t = typeof MOUSE_MODE_DYE_FORCE | typeof MOUSE_MODE_DYE |
    typeof MOUSE_MODE_FORCE | typeof MOUSE_MODE_WALL;
const MODE2STR = {
    [MOUSE_MODE_DYE_FORCE]: "Dye + Force",
    [MOUSE_MODE_DYE]: "Dye",
    [MOUSE_MODE_FORCE]: "Force",
    [MOUSE_MODE_WALL]: "Wall"
} as Record<mouse_mode_t,string>;

const mouse = {
    /** value set to true whenever the mouse's left button is pressed. */
    m1_down: false,
    /** value set to true only when mouse1_down is not true and the mouse's
      * wheel button is pressed. */
    m2_down: false,
    last_processed_frame: -1,
    uv_pos: new Float32Array(2),
    prev_uv_pos: new Float32Array(2),
    mode: MOUSE_MODE_DYE_FORCE as mouse_mode_t,
    over_canvas: false,
    wall_anchor: new Float32Array(2),   // where the next ctrl-line starts
};

let _mouse_never_processed = true;

function process_client_pos(clientX:number, clientY:number) {
    mouse.uv_pos[0] = (clientX - canvas_rect.left) / canvas_rect.width;
    mouse.uv_pos[1] = (canvas_rect.bottom - clientY) / canvas_rect.height;
    // a straight wall line dragged past the canvas ends exactly on its edge
    if (wall_line_pending()) {
        mouse.uv_pos[0] = Math.min(1, Math.max(0, mouse.uv_pos[0]));
        mouse.uv_pos[1] = Math.min(1, Math.max(0, mouse.uv_pos[1]));
    }
    const f = force.span * 0.5;
    ui_status.cursor(
        force.center[0] + (mouse.uv_pos[0] - 0.5) * f * ASPECT_NUM,
        force.center[1] + (mouse.uv_pos[1] - 0.5) * f
    );
}

/** event called on canvas.onmouseleave */
function c_mouseleave() {
    splat.next_is_start = true;
    // a straight wall line keeps its anchor: its end can be dragged past the edge
    if (!wall_line_pending()) obstacle_splat.next_is_start = true;
    mouse.over_canvas = false;
}

/** event called on canvas.onmousedown */
function c_mousedown(e:MouseEvent) {
    (document.activeElement as HTMLElement | null)?.blur();

    if (e.button === 3)
        return;

    if (_mouse_never_processed) {
        process_client_pos(e.clientX, e.clientY);
        _mouse_never_processed = false;
    }

    press(e.button);
}

/** shared by mouse and touch: 0 draws, 2 pans the force field. */
function press(button:number) {
    if (button === 0 && geysers_active()) {     // geyser mode: place / edit / erase
        mouse.m1_down = true;
        mouse.m2_down = false;
        geyser_press(mouse.uv_pos);
        return;
    }
    if (button === 0) {
        mouse.wall_anchor.set(mouse.uv_pos);
        mouse.m1_down = true;
        mouse.m2_down = false;
        dispatch_splat(mouse.uv_pos, true);      
    }
    else if (force.is_active && !mouse.m1_down && button === 2) {
        mouse.m2_down = true;
        mouse.prev_uv_pos.set(mouse.uv_pos);
        canvas_el.style.cursor = "grabbing";
        return;
    }
}

/** drops a pending press without drawing anything (a ctrl-line is discarded). */
function cancel_press() {
    mouse.m1_down = false;
    geysers.drag = null;
    splat.next_is_start = obstacle_splat.next_is_start = true;
}

/** event called on document.documentElement.onmouseleave: the pointer left
 * the page. A pending straight line is kept, so it can be drawn up to an edge:
 * browsers keep sending the drag's moves and its release while the button is
 * held, and a release that is lost anyway is caught by w_mousemove (no button
 * down on the next move drops the press). */
function d_mouseleave() {
    mouse.over_canvas = false;
}

/** event called on window.onmousemove */
function w_mousemove(e:MouseEvent) {
    // releases that happened outside the page never fire mouseup / keyup
    if (mouse.m1_down && (e.buttons & 1) === 0) cancel_press();
    if (!e.ctrlKey) keyboard.ctrl_down = false;   // only cleared here: pressing ctrl
    if (!e.shiftKey) keyboard.shift_down = false; // mid-stroke must not start a line

    mouse.over_canvas = (e.target as HTMLElement).id === "screen";
    process_client_pos(e.clientX, e.clientY);
    canvas_el.style.cursor = mouse.m2_down ? "grabbing" : "none";
    move();
}

/** shared by mouse and touch, expects mouse.uv_pos to be up to date. */
function move() {
    if (!mouse.m1_down && !mouse.m2_down)
        return;

    if (mouse.m2_down) {
        if (!force.is_active) return;
        const f = force.span * 0.5;
        force.center[0] -= (mouse.uv_pos[0] - mouse.prev_uv_pos[0]) * f * ASPECT_NUM;
        force.center[1] -= (mouse.uv_pos[1] - mouse.prev_uv_pos[1]) * f;
        mouse.prev_uv_pos.set(mouse.uv_pos);
        renderer.request_color_clear(false, false);

        ui_update_bounds();
        ui_field_center.refresh();
        return;
    }

    if (geysers.drag) { geyser_move(mouse.uv_pos); return; }

    const frame = renderer.frame;
    if (mouse.last_processed_frame === frame) return;
    mouse.last_processed_frame = frame;
    
    if (mouse.mode === MOUSE_MODE_WALL && wall_line_mode()) return;
    dispatch_splat(mouse.uv_pos, false);
    mouse.wall_anchor.set(mouse.uv_pos);
}

/** event called on window.onmouseup */
function w_mouseup(e:MouseEvent) {
    if (e.button === 2)
        e.preventDefault();
    release(e.button);
}

/** shared by mouse and touch. */
function release(button:number) {
    if (button === 2) {
        mouse.m2_down = false;
        canvas_el.style.cursor = "none";
        return;
    }

    if (button !== 0 || !mouse.m1_down)   // nothing pending (e.g. dropped by d_mouseleave)
        return;

    if (geysers.drag) {
        geyser_release(mouse.uv_pos);
        mouse.m1_down = false;
        return;
    }

    if (mouse.mode === MOUSE_MODE_WALL && wall_line_mode())
        dispatch_splat(mouse.uv_pos, false);
    
    splat.next_is_start = obstacle_splat.next_is_start = true;
    mouse.m1_down = false;
}
    
/** event called on canvas.onwheel */
function w_wheel(e:WheelEvent) {
    if ((e.target as HTMLElement).closest("#inspector,#view-select,#tools,#status")) return;
    
    e.preventDefault();
    if (!force.is_active) return;

    // normalize line/page modes to pixels
    const dy = -e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
    zoom_span(Math.exp(dy * 0.00025));    // wheel down: larger span, more of the field visible
}

/** scales the visible world span of the force field. */
function zoom_span(factor:number) {
    force.span *= factor;
    force.span = Math.min(Math.max(force.span, 0.01), 200);
    renderer.request_color_clear(false, false);
    ui_field_span.refresh();

    ui_update_bounds();
}