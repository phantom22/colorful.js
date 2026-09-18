    /** value set to true whenever the mouse's left button is pressed. */
let mouse1_down = false,
    /** value set to true only when mouse1_down is not true and the mouse's
     * wheel button is pressed. */
    mouse3_down = false,
    /** value used to prevent checking multiple times, on the same frame, which
     * the mouse position and its related events. */
    last_mouse_sample_frame = -1,
    /** both values used for moving the camera when pressing mouse3. */
    prev_clientX: number,
    prev_clientY: number,
    /** current frame's sampled mouse x position relative to the canvas. */
    mouse_x: number,
    /** current frame's sampled mouse y position relative to the canvas. */
    mouse_y: number;

/** event called on canvas.onmouseleave */
function c_mouseleave() { 
    // mouse1_down = false;
    // mouse3_down = false;
    // shift_down = false;
    // ctrl_down = false;
    hovered_id = undefined;
    // cpu_process_queued_strokes();
}

/** event called on canvas.onmousedown */
function c_mousedown(e:MouseEvent) {
    if (e.button === 2 || last_mouse_sample_frame === frame)
        return;

    if (e.button === 0) {
        mouse1_down = true;
        mouse3_down = false;
        if (!shift_down)
            palette_color = 0;
    }
    else if (!mouse1_down && e.button === 1) {
        prev_clientX = e.clientX;
        prev_clientY = e.clientY;
        mouse3_down = true;
        last_mouse_sample_frame = frame;
        return;
    }
    else {
        return;
    }

    if (force_render_mask)
        return;

    mouse_x =
        Math.floor((e.clientX - canvas_rect.left) * width / canvas_rect.width);
    mouse_y =
        Math.floor((canvas_rect.bottom - e.clientY) * height / canvas_rect.height);

    request_sample = true;
    last_mouse_sample_frame = frame;
}

/** event called on window.onmousemove */
function w_mousemove(e:MouseEvent) {
    if ((!mouse1_down && !mouse3_down) || force_render_mask
        || last_mouse_sample_frame === frame)
        return; 

    const clientX = e.clientX,
          clientY = e.clientY;
    mouse_x =
        Math.floor((clientX - canvas_rect.left) * width / canvas_rect.width);
    mouse_y =
        Math.floor((canvas_rect.bottom - clientY) * height / canvas_rect.height);

    if (mouse3_down) {
        camera_x -= (clientX - prev_clientX) * units_per_pixel_x;
        camera_y += (clientY - prev_clientY) * units_per_pixel_y;

        camera_x =
            Math.max(Math.min(camera_x, camera_coord_max), camera_coord_min);
        camera_y =
            Math.max(Math.min(camera_y, camera_coord_max), camera_coord_min);

        prev_clientX = clientX;
        prev_clientY = clientY;
        
        update_view_proj_mat = true;
        force_render_mask = true;
    }
    else {
        request_sample = true;
        last_mouse_sample_frame = frame;
    }
}

/** event called on window.onmouseup */
function w_mouseup(e:MouseEvent) {
    if (e.button === 2) {
        e.preventDefault();
        return;
    }

    if (e.button === 1) {
        // @ts-ignore
        prev_clientX = prev_clientY = undefined;
        mouse3_down = false;
    }

    if (e.button !== 0)
        return;

    broke_stroke = shift_down ? true : false;
    mouse1_down = false;
    hovered_id = undefined;
    mouse_down_on_color = false;
}

let wheel_already_processed = false,
    /** camera_scale max delta per second. */
    wheel_zoom_factor = 8,
    trackpad_zoom_factor = 2;

function event_triggered_by_trackpad(e:WheelEvent) {
    if (e.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) {
        return false;
    }
    else {
        const has_frac =
            !Number.isInteger(e.deltaY) || !Number.isInteger(e.deltaX);
        const small_delta =
            Math.abs(e.deltaY) < 50 && Math.abs(e.deltaX) < 50;
        return has_frac || small_delta;
    }
}
    
/** event called on canvas.onwheel */
function w_wheel(e:WheelEvent) {
    if (e.ctrlKey) {
        e.preventDefault();
        return;
    }

    if (wheel_already_processed)
        return;
    wheel_already_processed = true;

    const factor = event_triggered_by_trackpad(e)
        ? trackpad_zoom_factor * delta_time
        : wheel_zoom_factor * delta_time;
    camera_scale += e.deltaY < 0 ? factor : -factor;

    camera_scale =
        Math.min(Math.max(camera_scale, camera_scale_min), camera_scale_max);
    units_per_pixel_x = 2 * camera_scale / canvas_rect.width;        
    units_per_pixel_y = 2 * camera_scale / canvas_rect.height;

    update_view_proj_mat = true;
    force_render_mask = true;
}