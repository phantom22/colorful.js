if (gpu === 1) {
function gpu_process_stroke(hovered:number) {
    if (hovered === 0 || hovered === mouse.last_hovered_id)
        return;

    if (keyboard.shift_down) {
        const brush = grid.adj_graph[hovered].brush;

        const newly_hovered = brush.difference(stroke.flat_queue);
        if (newly_hovered.size === 0)
            return;

        const current_color_packed = stroke.queue[stroke.count].color_data.packed;

        const v = new Uint8Array([1,1,1]);
        gl.bindBuffer(gl.ARRAY_BUFFER, hovered_buffer);
        for (const id of newly_hovered) {
            stroke.queue[stroke.count].stroke.add(id);
            stroke.flat_queue.add(id);

            const byte_offset = id*3-1;
            gl.bufferSubData(gl.ARRAY_BUFFER, byte_offset, v);
            grid.hover_texture_u32view[id] = current_color_packed;
        }

        renderer.hover_texture_is_dirty = true;
    }
    else if (keyboard.ctrl_down) {
        fill_grid(stroke.choosen_palette[stroke.palette_color]);
    }
    else {
        const brush = new Set(grid.adj_graph[hovered].brush);
        wave_start(brush);
    }

    mouse.last_hovered_id = hovered;
}

function gpu_remove_highlights() {  
    const v = new Uint8Array([0,0,0]);
    gl.bindBuffer(gl.ARRAY_BUFFER, hovered_buffer);
    for (const id of stroke.flat_queue) {
        const byte_offset = id*3-1;
        gl.bufferSubData(gl.ARRAY_BUFFER, byte_offset, v);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    stroke.flat_queue.clear();
}

function gpu_process_queued_strokes() {
    if (stroke.flat_queue.size === 0)
        return;

    gpu_remove_highlights();
    
    const mod = 3,
          s = new Set() as Set<number>;
    for (let i=0; i<stroke.queue.length; ++i) {
        const q = stroke.queue[i];

        const first = q.stroke.entries().next();
        if (first.done === true)
            continue;

        const m = first.value[0] % mod;

        for (const id of q.stroke) {
            s.add(id);
            if (id % mod === m) {
                wave_start(s, q.color_data);
                s.clear();
            }
        }
        if (s.size > 0) {
            wave_start(s, q.color_data);
            s.clear();
        }
    }

    stroke.queue = [];
    stroke.count = -1;
}

process_stroke = gpu_process_stroke;
remove_highlights = gpu_remove_highlights;
process_queued_strokes = gpu_process_queued_strokes;
}