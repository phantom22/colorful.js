"use strict";
function complementary_color(color) {
    return new Uint8Array([
        255 - color[0], 255 - color[1], 255 - color[2], 255
    ]);
}
function complementary_fcolor(color) {
    return new Float16Array([
        1 - color[0], 1 - color[1], 1 - color[2]
    ]);
}
function uint8_to_float32(color) {
    return new Float32Array([
        color[0] / 255, color[1] / 255, color[2] / 255, 1
    ]);
}
function uint8_to_float16(color) {
    return new Float16Array([
        color[0] / 255, color[1] / 255, color[2] / 255, 1
    ]);
}
function get_color_data(color) {
    return {
        color,
        fcolor: uint8_to_float16(color)
    };
}
function luminance(color) {
    return 0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2];
}
function incr_palette() {
    const cp = stroke.choosen_palette;
    if (cp.length === 1)
        return;
    stroke.palette_color = (stroke.palette_color + 1) % cp.length;
}
function decr_palette() {
    const cp = stroke.choosen_palette, L = cp.length, c = stroke.palette_color;
    if (L === 1)
        return;
    stroke.palette_color = c === 0 ? L - 1 : c - 1;
}
function color_logarithm(to, from) {
    to[0] = -Math.log(Math.max(from[0], 0.02));
    to[1] = -Math.log(Math.max(from[1], 0.02));
    to[2] = -Math.log(Math.max(from[2], 0.02));
    to[3] = 1.0;
}
