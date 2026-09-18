function gpu_process_stroke(hovered:number) {
    if (hovered !== 0 && hovered !== hovered_id) {
        if (shift_down) {
            const brush = grid.adj_graph[hovered].brush;

            // @ts-ignore
            const newly_hovered = brush.difference(wave_queue);
            if (newly_hovered.size === 0)
                return;

            /* change stroke color only if there were at least one new valid
             * non hovered vertex. */
            if (broke_stroke) {
                queued_strokes[++stroke_count] = {
                    stroke: new Set(),
                    color_data: choosen_palette[palette_color]
                };

                if (choosen_palette.length > 1)
                    palette_color = (palette_color+1) % choosen_palette.length;
            
                broke_stroke = false;
            }

            for (const id of newly_hovered) {
                queued_strokes[stroke_count].stroke.add(id);
                wave_queue.add(id);
            }

            const v = new Uint8Array([1,1,1]);
            gl.bindBuffer(gl.ARRAY_BUFFER, hovered_buffer);
            for (const id of newly_hovered) {
                const byte_offset = id*3-1;
                gl.bufferSubData(gl.ARRAY_BUFFER, byte_offset, v);
            }
        }
        else if (ctrl_down) {
            gpu_fill_grid(choosen_palette[palette_color]);
        }
        else {
            const brush = new Set(grid.adj_graph[hovered].brush);
            gpu_wave_start(brush);
        }
        hovered_id = hovered;
    }
}

function gpu_remove_highlights() {  
    const v = new Uint8Array([0,0,0]);
    gl.bindBuffer(gl.ARRAY_BUFFER, hovered_buffer);
    for (const id of wave_queue) {
        const byte_offset = id*3-1;
        gl.bufferSubData(gl.ARRAY_BUFFER, byte_offset, v);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    wave_queue.clear();
}

function gpu_process_queued_strokes() {
    if (wave_queue.size === 0)
        return;

    gpu_remove_highlights();
    
    for (let i=0; i<queued_strokes.length; ++i) {
        const q = queued_strokes[i];

        let s = new Set() as Set<number>,
            mod = 3,
            m: undefined|number;
        
        for (const id of q.stroke) {
            if (m === undefined) {
                m = id % mod;
            }

            s.add(id);
            if (id % mod === m) {
                gpu_wave_start(s, q.color_data);
                s = new Set();
            }
        }
        if (s.size > 0) {
            gpu_wave_start(s, q.color_data);
            s.clear();
        }
    }

    queued_strokes = [];
    stroke_count = -1;
}