let mouse_down = false,
    last_mouse_sample_frame = -1,
    mouse_x: number,
    mouse_y: number;

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

function c_mousedown(e:MouseEvent) {
    if (mouse_down === true || e.button !== 0
        || last_mouse_sample_frame === frame)
        return;

    // palette_color = ++palette_color % palette.length;
    mouse_down = true;

    if (force_render_mask)
        return;

    const rect = canvas_el.getBoundingClientRect();
    mouse_x = Math.floor((e.clientX - rect.left) * width / rect.width);
    mouse_y = Math.floor((rect.bottom - e.clientY) * height / rect.height);

    request_sample = true;
    last_mouse_sample_frame = frame;
}

function c_mousemove(e:MouseEvent) {
    if (mouse_down === false || force_render_mask
        || last_mouse_sample_frame === frame)
        return;

    const rect = canvas_el.getBoundingClientRect();
    mouse_x = Math.floor((e.clientX - rect.left) * width / rect.width);
    mouse_y = Math.floor((rect.bottom - e.clientY) * height / rect.height);

    request_sample = true;
    last_mouse_sample_frame = frame;
}

function c_mouseup(e:MouseEvent) {
    if (e.button !== 0)
        return;

    broke_stroke = shift_down ? true : false;
    mouse_down = false;
    hovered_id = undefined;
}