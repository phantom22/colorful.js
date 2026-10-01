const mouse = {
    /** current frame's sampled mouse x position relative to the canvas. */
    x: -1,
    /** current frame's sampled mouse y position relative to the canvas. */
    y: -1,
    /** value set to true whenever the mouse's left button is pressed. */
    m1_down: false,
    /** value set to true only when mouse1_down is not true and the mouse's
      * wheel button is pressed. */
    m3_down: false,
    /** both values used for moving the camera when pressing mouse3. */
    prev_clientX: -1,
    prev_clientY: -1,
    /** value used to prevent checking multiple times, on the same frame, which
     * the mouse position and its related events. */
    last_sample_frame: -1,
    wheel_already_processed: false,
    wheel_zoom_factor: 8,
    trackpad_zoom_factor: 2,
    /** last hovered vertex id, used to prevent the same vertex from being
     * processed multiple times */
    last_hovered_id: -1
};

/** event called on canvas.onmouseleave */
function c_mouseleave() { 
    mouse.last_hovered_id = -1;
}

/** event called on canvas.onmousedown */
function c_mousedown(e:MouseEvent) {
    const frame = renderer.frame;
    if (e.button === 2 || mouse.last_sample_frame === frame)
        return;

    if (e.button === 0) {
        mouse.m1_down = true;
        mouse.m3_down = false;

        if (keyboard.shift_down) {
            /* change stroke color only if there were at least one new valid
            * non hovered vertex. */
            stroke.queue[++stroke.count] = {
                stroke: new Set(),
                color_data: stroke.choosen_palette[stroke.palette_color]
            };

            if (stroke.choosen_palette.length > 1) {
                stroke.palette_color = (stroke.palette_color+1) % stroke.choosen_palette.length;
            }
        }
    }
    else if (!mouse.m1_down && e.button === 1) {
        mouse.prev_clientX = e.clientX;
        mouse.prev_clientY = e.clientY;
        mouse.m3_down = true;
        mouse.last_sample_frame = frame;
        return;
    }
    else {
        return;
    }

    if (renderer.force_render_mask)
        return;

    mouse.x =
        Math.floor((e.clientX - canvas_rect.left) * width / canvas_rect.width);
    mouse.y =
        Math.floor((canvas_rect.bottom - e.clientY) * height / canvas_rect.height);

    renderer.request_mouse_sample = true;
    mouse.last_sample_frame = frame;
}

/** event called on window.onmousemove */
function w_mousemove(e:MouseEvent) {
    if ((!mouse.m1_down && !mouse.m3_down) || renderer.force_render_mask
        || mouse.last_sample_frame === renderer.frame)
        return; 

    const clientX = e.clientX,
          clientY = e.clientY;
    mouse.x =
        Math.floor((clientX - canvas_rect.left) * width / canvas_rect.width);
    mouse.y =
        Math.floor((canvas_rect.bottom - clientY) * height / canvas_rect.height);

    if (mouse.m3_down) {
        camera.x -= (clientX - mouse.prev_clientX) * camera.units_per_pixel_x;
        camera.y += (clientY - mouse.prev_clientY) * camera.units_per_pixel_y;

        camera.x =
            Math.max(Math.min(camera.x, camera.max_coord), camera.min_coord);
        camera.y =
            Math.max(Math.min(camera.y, camera.max_coord), camera.min_coord);

        mouse.prev_clientX = clientX;
        mouse.prev_clientY = clientY;
        
        renderer.update_view_proj_mat = true;
        renderer.force_render_mask = true;
    }
    else {
        renderer.request_mouse_sample = true;
        mouse.last_sample_frame = renderer.frame;
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
        mouse.m3_down = false;
    }

    if (e.button !== 0)
        return;

    mouse.m1_down = false;
    mouse.last_hovered_id = -1;
    mouse_down_on_color = false;
}

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

    if (mouse.wheel_already_processed)
        return;
    mouse.wheel_already_processed = true;

    const factor = event_triggered_by_trackpad(e)
        ? mouse.trackpad_zoom_factor * renderer.delta_time
        : mouse.wheel_zoom_factor * renderer.delta_time;
    camera.scale += e.deltaY < 0 ? factor : -factor;

    camera.scale =
        Math.min(Math.max(camera.scale, camera.min_scale), camera.max_scale);
    camera.units_per_pixel_x = 2 * camera.scale / canvas_rect.width;        
    camera.units_per_pixel_y = 2 * camera.scale / canvas_rect.height;

    renderer.update_view_proj_mat = true;
    renderer.force_render_mask = true;
}