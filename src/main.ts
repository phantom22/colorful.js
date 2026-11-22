/** event called by window.onload */
function main() {
    init_webgl();
    init_textures();
    init_ui();

    canvas_el.onmouseleave = c_mouseleave;
    document.documentElement.addEventListener("mouseleave", d_mouseleave);
    canvas_el.onmousedown = c_mousedown;
    new ResizeObserver(update_viewport).observe(canvas_el);
    window.addEventListener("resize", update_viewport);
    window.onmousemove = w_mousemove;
    window.onmouseup = w_mouseup;
    // passive:false so preventDefault stops scrolling and the emulated mouse events
    canvas_el.addEventListener("touchstart", c_touchstart, {passive:false});
    canvas_el.addEventListener("touchmove", c_touchmove, {passive:false});
    canvas_el.addEventListener("touchend", c_touchend, {passive:false});
    canvas_el.addEventListener("touchcancel", c_touchend, {passive:false});
    canvas_el.oncontextmenu = (e:Event) => {
        e.preventDefault();
    };

    draw(0);
}