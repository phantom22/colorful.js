/** quiet time after the last resize event before the sim is rebuilt. */
const RESIZE_SETTLE_MS = 200;
let _resize_timer = 0;

/** the canvas' laid-out CSS size. Used instead of window.innerWidth/Height,
 * which can be stale while docked devtools are still being laid out. */
function canvas_css_size(): [number, number] {
    canvas_rect = canvas_el.getBoundingClientRect();
    return [Math.max(1, Math.round(canvas_rect.width)), Math.max(1, Math.round(canvas_rect.height))];
}

/** sizes the canvas drawing buffer to its CSS size. Returns true if it changed. */
function apply_canvas_size() {
    const [w, h] = canvas_css_size();
    if (w === canvas_el.width && h === canvas_el.height)
        return false;

    canvas_el.width = w;
    canvas_el.height = h;
    return true;
}

/** ResizeObserver and window resize callback. The first event pauses the sim
 * (the browser keeps stretching the last frame), the rebuild happens once the
 * resize settles. */
function update_viewport() {
    const [w, h] = canvas_css_size();
    if (w === canvas_el.width && h === canvas_el.height && !renderer.resizing)
        return;

    if (!renderer.resizing) {
        renderer.resizing = true;
        state_cleanup();
    }
    clearTimeout(_resize_timer);
    _resize_timer = setTimeout(finish_resize, RESIZE_SETTLE_MS);
}

function finish_resize() {
    const old_w = canvas_el.width, old_h = canvas_el.height;
    if (apply_canvas_size())
        resize_simulation(old_w, old_h, canvas_el.width, canvas_el.height);
    renderer.resizing = false;
}
