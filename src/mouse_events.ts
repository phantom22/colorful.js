    /** value set to true whenever the mouse's left button is pressed. */
let mouse_down = false,
    /** value used to prevent checking multiple times, on the same frame, which
     * the mouse position and its related events. */
    last_mouse_sample_frame = -1,
    /** current frame's sampled mouse x position relative to the canvas. */
    mouse_x: number,
    /** current frame's sampled mouse y position relative to the canvas. */
    mouse_y: number;

/** event called on canvas.onmouseleave */
function c_mouseleave() { 
    mouse_down = false;
    shift_down = false;
    ctrl_down = false;
    hovered_id = undefined;
    if (wave_queue.size !== 0) {
        wave_start(wave_queue);
        wave_queue.clear();
    }
}

/** event called on canvas.onmousedown */
function c_mousedown(e:MouseEvent) {
    if (mouse_down || e.button !== 0 || last_mouse_sample_frame === frame)
        return;

    mouse_down = true;

    if (force_render_mask)
        return;

    const rect = canvas_el.getBoundingClientRect();
    mouse_x = Math.floor((e.clientX - rect.left) * width / rect.width);
    mouse_y = Math.floor((rect.bottom - e.clientY) * height / rect.height);

    request_sample = true;
    last_mouse_sample_frame = frame;
}

/** event called on canvas.onmousemove */
function c_mousemove(e:MouseEvent) {
    if (!mouse_down || force_render_mask || last_mouse_sample_frame === frame)
        return;

    const rect = canvas_el.getBoundingClientRect();
    mouse_x = Math.floor((e.clientX - rect.left) * width / rect.width);
    mouse_y = Math.floor((rect.bottom - e.clientY) * height / rect.height);

    request_sample = true;
    last_mouse_sample_frame = frame;
}

/** event called on canvas.onmouseup */
function c_mouseup(e:MouseEvent) {
    if (e.button !== 0)
        return;

    broke_stroke = shift_down ? true : false;
    mouse_down = false;
    hovered_id = undefined;
}