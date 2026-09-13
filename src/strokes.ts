let hovered_id = undefined as undefined|number,
    wave_queue = new Set() as Set<number>,
    queued_strokes = [] as Set<number>[],
    broke_stroke = false,
    stroke_count = -1;

function process_stroke(hovered:number) {
    if (hovered !== 0 && hovered !== hovered_id) {
        if (shift_down) {
            if (!wave_queue.has(hovered)) {
                wave_queue.add(hovered);

                if (broke_stroke) {
                    queued_strokes[++stroke_count] = new Set();
                    broke_stroke = false;
                }

                queued_strokes[stroke_count].add(hovered);

                const offset = hovered*4;
                grid.texture[offset] =
                    Math.min(Math.floor(grid.texture[offset] + 255) * 0.5, 255);
                grid.texture[offset+1] =
                    Math.min(Math.floor(grid.texture[offset+1] + 255) * 0.5, 255);
                grid.texture[offset+2] =
                    Math.min(Math.floor(grid.texture[offset+2] + 255) * 0.5, 255);
            }

            for (const adj of grid.adj_graph[hovered].next) {
                const id = adj.id,
                    offset = id*4;
                if (wave_queue.has(id))
                    continue;

                queued_strokes[stroke_count].add(id);
                wave_queue.add(id);

                grid.texture[offset] =
                    Math.min(Math.floor(grid.texture[offset] + 255) * 0.5, 255);
                grid.texture[offset+1] =
                    Math.min(Math.floor(grid.texture[offset+1] + 255) * 0.5, 255);
                grid.texture[offset+2] =
                    Math.min(Math.floor(grid.texture[offset+2] + 255) * 0.5, 255);
            }

            texture_is_dirty = true;
        }
        else if (ctrl_down) {
            const clear_color = packUint8(palette[palette_color]);
            for (let i=0; i<grid.adj_graph.length; ++i)
                grid.texture_u32view[i] = clear_color;

            // if (queued_wave_count > 0) {
            //     prevent_waves_last_id = wave_id + queued_wave_count;
            //     wave_id = prevent_waves_last_id + 1;
            // }

            texture_is_dirty = true;
        }
        else {
            const brush = new Set([hovered]);
            for (const adj of grid.adj_graph[hovered].next)
                brush.add(adj.id);
            wave_start(brush);
        }
        hovered_id = hovered;
    }
}

function remove_highlights() {
    for (const id of wave_queue) {
        const offset = id*4;
        grid.texture[offset] = Math.max(2*grid.texture[offset] - 255, 0);
        grid.texture[offset+1] = Math.max(2*grid.texture[offset+1] - 255, 0);
        grid.texture[offset+2] = Math.max(2*grid.texture[offset+2] - 255, 0);
        grid.texture[offset+3] = Math.max(2*grid.texture[offset+3] - 255, 0);
    }
    texture_is_dirty = true;
    wave_queue.clear();
}

function process_queued_strokes() {
    remove_highlights();
    for (let i=0; i<queued_strokes.length; ++i) {
        const q = queued_strokes[i];
        // let q_brush = new Set() as Set<number>;
        // for (const id of q) {
        //     q_brush.add(id);
        //     for (const next of grid.adj_graph[id].next)
        //         q_brush.add(next.id);
        // }

        let s = new Set() as Set<number>,
            mod = 3,
            m: undefined|number;
        
        for (const id of q) {
            if (m === undefined) {
                m = id % mod;
            }

            s.add(id);
            if (id % mod === m) {
                wave_start(s);
                s = new Set();
            }
        }
        if (s.size > 0) {
            wave_start(s);
            s.clear();
        }
    }

    queued_strokes = [];
    stroke_count = -1;
}