    /** last hovered vertex id, used to prevent the same vertex from being
     * processed multiple times */
let hovered_id = undefined as undefined|number,
    /** this set is used to both apply and remove the highlight color effect. */
    wave_queue = new Set() as Set<number>,
    /** this array encodes the individual queued strokes with their respective
     * color. */
    queued_strokes = [] as {stroke:Set<number>, color_data:color_data}[],
    /** this value is set to true whenever the left mouse button is lifted. */
    broke_stroke = false,
    /** default value set to -1, since this variable gets incremented by one
     * each time a new queued stroke is done (this also applied to the first
     * one). */
    stroke_count = -1;

function cpu_process_stroke(hovered:number) {
    if (hovered !== 0 && hovered !== hovered_id) {
        if (shift_down) {
            if (!wave_queue.has(hovered)) {
                wave_queue.add(hovered);

                if (broke_stroke) {
                    queued_strokes[++stroke_count] = {
                        stroke: new Set(),
                        color_data: choosen_palette[palette_color]
                    };

                    if (choosen_palette.length > 1)
                        palette_color = (palette_color+1) % choosen_palette.length;
                
                    broke_stroke = false;
                }

                queued_strokes[stroke_count].stroke.add(hovered);

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

                queued_strokes[stroke_count].stroke.add(id);
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
            cpu_fill_grid(choosen_palette[palette_color]);
        }
        else {
            const brush = new Set(grid.adj_graph[hovered].brush);
            cpu_wave_start(brush);
        }
        hovered_id = hovered;
    }
}

function cpu_remove_highlights() {
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

function cpu_process_queued_strokes() {
    if (wave_queue.size === 0)
        return;

    cpu_remove_highlights();
    
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
                cpu_wave_start(s, q.color_data);
                s = new Set();
            }
        }
        if (s.size > 0) {
            cpu_wave_start(s, q.color_data);
            s.clear();
        }
    }

    queued_strokes = [];
    stroke_count = -1;
}