"use strict";
const stroke = {
    /** this set is used to both apply and remove the highlight color effect. */
    flat_queue: new Set(),
    /** this array encodes the individual queued strokes with their respective
     * color. */
    queue: [],
    /** default value set to -1, since this variable gets incremented by one
     * each time a new queued stroke is done (this also applied to the first
     * one). */
    count: -1,
    choosen_palette: [],
    /** index of the color used from the current choosen palette of colors. */
    palette_color: 0,
};
function process_stroke(hovered) {
    if (keyboard.ctrl_down) {
        fill_grid(stroke.choosen_palette[stroke.palette_color]);
    }
    else {
        set_splat(mouse.pos);
    }
}
// function remove_highlights() {  
//     const v = new Uint8Array([0,0,0]);
//     gl.bindBuffer(gl.ARRAY_BUFFER, hovered_buffer);
//     for (const id of stroke.flat_queue) {
//         const byte_offset = id*3-1;
//         gl.bufferSubData(gl.ARRAY_BUFFER, byte_offset, v);
//     }
//     gl.bindBuffer(gl.ARRAY_BUFFER, null);
//     stroke.flat_queue.clear();
// }
// function process_queued_strokes() {
//     if (stroke.flat_queue.size === 0)
//         return;
//     remove_highlights();
//     const mod = 3,
//           s = new Set() as Set<number>;
//     for (let i=0; i<stroke.queue.length; ++i) {
//         const q = stroke.queue[i];
//         const first = q.stroke.entries().next();
//         if (first.done === true)
//             continue;
//         const m = first.value[0] % mod;
//         for (const id of q.stroke) {
//             s.add(id);
//             if (id % mod === m) {
//                 wave_start(s, q.color_data);
//                 s.clear();
//             }
//         }
//         if (s.size > 0) {
//             wave_start(s, q.color_data);
//             s.clear();
//         }
//     }
//     stroke.queue = [];
//     stroke.count = -1;
// }
