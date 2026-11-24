/** quiet time after the last resize event before the sim is rebuilt. */
const RESIZE_SETTLE_MS = 200;
let _resize_timer = 0;

/** the canvas' laid-out CSS size. Used instead of window.innerWidth/Height,
 * which can be stale while docked devtools are still being laid out. */
function canvas_css_size(): [number, number] {
    canvas_rect = canvas_el.getBoundingClientRect();
    return [Math.max(1, Math.round(canvas_rect.width)), Math.max(1, Math.round(canvas_rect.height))];
}

/** most pixels the canvas draws (1920x1080). A bigger canvas gets a smaller
 * drawing buffer that the browser stretches to fit: the display pass costs
 * per pixel (84% of the frame at 4K, vs 41% at 1440x900) and the sim and dye
 * grids are much coarser than such a screen anyway. */
const MAX_DISPLAY_PIXELS = 1920 * 1080;

/** the canvas' CSS size as last applied, see apply_canvas_size. */
const canvas_css: [number, number] = [0, 0];

/** drawing buffer size for a CSS size, see MAX_DISPLAY_PIXELS. Never fewer
 * pixels than the dye resolution has texels (its inspector value, not the
 * dynamic one): finer dye drawn into a smaller buffer loses its detail. */
function canvas_buffer_size(w:number, h:number): [number, number] {
    const max = Math.max(MAX_DISPLAY_PIXELS, fluid.dye_resolution ** 2),
          s = Math.min(1, Math.sqrt(max / (w * h)));
    return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}

/** sizes the canvas drawing buffer to its CSS size (capped, see
 * MAX_DISPLAY_PIXELS). Returns true if the buffer changed. */
function apply_canvas_size() {
    const css = canvas_css_size();
    canvas_css[0] = css[0];
    canvas_css[1] = css[1];
    const [w, h] = canvas_buffer_size(css[0], css[1]);
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
    const css = canvas_css_size(), [w, h] = canvas_buffer_size(css[0], css[1]);
    if (w === canvas_el.width && h === canvas_el.height && !renderer.resizing) {
        // above the cap a CSS change can keep the same buffer: nothing to
        // rebuild, the picture just stretches, so the state now spans this size
        canvas_css[0] = css[0];
        canvas_css[1] = css[1];
        return;
    }

    if (!renderer.resizing) {
        renderer.resizing = true;
        state_cleanup(true);
    }
    clearTimeout(_resize_timer);
    _resize_timer = setTimeout(finish_resize, RESIZE_SETTLE_MS);
}

function finish_resize() {
    // CSS sizes: the state is carried over in screen space (sh_resample), and
    // the buffer is scaled differently from the CSS size on big screens
    const [old_w, old_h] = canvas_css;
    if (apply_canvas_size())
        resize_simulation(old_w, old_h, canvas_css[0], canvas_css[1]);
    renderer.resizing = false;
    sim_wake();
}
