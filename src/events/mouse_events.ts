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
    /** last pointer position (client px) from any mouse event, so the rings
     * can follow what is under a pointer that doesn't move (an editor
     * closing, the UI hiding). Never set by touch. */
    client: new Float32Array(2),
    client_known: false,
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

/** resting the pointer this long (ms) on a geyser makes it clickable outside geyser mode. */
const GEYSER_HOVER_MS = 400;
let _hover_candidate: geyser_t | null = null, _hover_timer = 0;

function set_geyser_hover(g:geyser_t | null) {
    if (geysers.hover === g) return;
    geysers.hover = g;   // shown by the bold marker outline; the cursor stays hidden
}

/** tracks the geyser under an idle pointer outside geyser mode; it becomes
 * clickable (geysers.hover) once the pointer has rested on it a moment. */
function update_geyser_hover() {
    const g = mouse.over_canvas && !mouse.m1_down && !mouse.m2_down && !geysers_active()
        ? geyser_at(mouse.uv_pos) : null;
    if (g === _hover_candidate) return;
    _hover_candidate = g;
    clearTimeout(_hover_timer);
    set_geyser_hover(null);
    if (g) _hover_timer = setTimeout(() => {
        if (_hover_candidate === g && geysers.list.includes(g)) set_geyser_hover(g);
    }, GEYSER_HOVER_MS);
}

function note_pointer(e:MouseEvent) {
    mouse.client[0] = e.clientX;
    mouse.client[1] = e.clientY;
    mouse.client_known = true;
}

/** every frame (mouse only): whether the canvas is under the resting pointer,
 * which no event reports when the things above it change. */
function sync_pointer_over_canvas() {
    // geyser mode handles geysers itself: a hover armed before it is dropped
    if (geysers.hover && geysers_active()) { set_geyser_hover(null); _hover_candidate = null; }
    if (!mouse.client_known || mouse.m1_down || mouse.m2_down) return;
    const over = document.elementFromPoint(mouse.client[0], mouse.client[1]) === canvas_el;
    if (over === mouse.over_canvas) return;
    mouse.over_canvas = over;
    if (over) process_client_pos(mouse.client[0], mouse.client[1]);
    update_geyser_hover();
}

/** event called on window.onmouseover: also fires, with coordinates, when the
 * page appears under a pointer that hasn't moved yet. */
function w_mouseover(e:MouseEvent) {
    note_pointer(e);
}

/** event called on canvas.onmouseleave */
function c_mouseleave() {
    splat.next_is_start = true;
    // a straight wall line keeps its anchor: its end can be dragged past the edge
    if (!wall_line_pending()) obstacle_splat.next_is_start = true;
    mouse.over_canvas = false;
    update_geyser_hover();
}

/** event called on canvas.onmousedown */
function c_mousedown(e:MouseEvent) {
    (document.activeElement as HTMLElement | null)?.blur();
    note_pointer(e);

    if (e.button === 3)
        return;

    if (_mouse_never_processed) {
        process_client_pos(e.clientX, e.clientY);
        _mouse_never_processed = false;
    }

    // right-click on a hovered geyser deletes it (before panning or the shorthand)
    if (e.button === 2 && geysers.hover && !mouse.m1_down && geyser_at(mouse.uv_pos) === geysers.hover) {
        const g = geysers.hover;
        set_geyser_hover(null);
        geyser_delete(g);
        _hover_candidate = null;
        return;
    }

    press(e.button);
}

/** shared by mouse and touch: 0 draws, 2 pans the force field. */
function press(button:number) {
    // a geyser hovered long enough is clickable with any tool: edit / move / re-aim it
    if (button === 0 && geysers.hover && !geysers_active() && geyser_at(mouse.uv_pos) === geysers.hover) {
        mouse.m1_down = true;
        mouse.m2_down = false;
        geyser_press(mouse.uv_pos, false);
        geysers.drag!.hover = true;
        set_geyser_hover(null);
        _hover_candidate = null;        // resting on it again after the release re-arms it
        return;
    }
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
    mouse.client_known = false;
}

/** event called on window.onmousemove */
function w_mousemove(e:MouseEvent) {
    // releases that happened outside the page never fire mouseup / keyup
    if (mouse.m1_down && (e.buttons & 1) === 0) cancel_press();
    if (!e.ctrlKey) keyboard.ctrl_down = false;   // only cleared here: pressing ctrl
    if (!e.shiftKey) keyboard.shift_down = false; // mid-stroke must not start a line

    note_pointer(e);
    mouse.over_canvas = (e.target as HTMLElement).id === "screen";
    process_client_pos(e.clientX, e.clientY);
    canvas_el.style.cursor = mouse.m2_down ? "grabbing" : "none";
    update_geyser_hover();
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
        renderer.request_color_clear(false, false, true);   // walls and geysers stay

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
    note_pointer(e);
    // only the canvas: over any panel, overlay or toast the wheel is theirs
    // (scrolling the help, the inspector, ...), never the brush or the zoom
    if (e.target !== canvas_el) return;
    mouse.over_canvas = true;
    process_client_pos(e.clientX, e.clientY);

    e.preventDefault();

    // normalize line/page modes to pixels
    const dy = -e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
    if (force.is_active)
        zoom_span(Math.exp(dy * 0.00025));    // wheel down: larger span, more of the field visible
    else
        ui_resize_brush(Math.exp(dy * 0.0012));   // wheel up: bigger brush (~12% per notch)
}

/** scales the visible world span of the force field. */
function zoom_span(factor:number) {
    force.span *= factor;
    force.span = Math.min(Math.max(force.span, 0.01), 200);
    renderer.request_color_clear(false, false, true);   // walls and geysers stay
    ui_field_span.refresh();

    ui_update_bounds();
}