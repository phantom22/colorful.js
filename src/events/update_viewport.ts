/** event called on window.onresize */
function update_viewport() {
    const r = canvas_el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(r.width), h = Math.round(r.height * dpr);
    canvas_rect = r;
    // const w = window.innerWidth, h = window.innerHeight;

    if (w !== canvas_el.width || h !== canvas_el.height) {
        canvas_el.width = w;
        canvas_el.height = h;
        mouse.m1_down = false;
        keyboard.shift_down = false;
        keyboard.ctrl_down = false;
    }
}