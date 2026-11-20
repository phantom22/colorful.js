/** event called by window.onload */
function main() {
    init_webgl();
    init_textures();
    init_ui();

    canvas_el.onmouseleave = c_mouseleave;
    canvas_el.onmousedown = c_mousedown;
    new ResizeObserver(update_viewport).observe(canvas_el);
    window.onmousemove = w_mousemove;
    window.onmouseup = w_mouseup;
    canvas_el.oncontextmenu = (e:Event) => {
        e.preventDefault();
    };

    draw(0);
}

// add UI_FIELD_FLOAT, to have Precision > time be editable
// remove focus from toggle after clicking it