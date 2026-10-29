"use strict";
/** event called by window.onload */
function main() {
    init_shaders();
    init_textures();
    init_ui();
    canvas_el.onmouseleave = c_mouseleave;
    canvas_el.onmousedown = c_mousedown;
    new ResizeObserver(update_viewport).observe(canvas_el);
    window.onmousemove = w_mousemove;
    window.onmouseup = w_mouseup;
    canvas_el.oncontextmenu = (e) => {
        e.preventDefault();
    };
    draw(0);
}
//
