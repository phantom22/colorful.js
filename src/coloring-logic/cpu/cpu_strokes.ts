// let wave_queue = new Set() as Set<number>,
//     queued_strokes = [] as {stroke:Set<number>, color_data:color_data}[],
//     stroke_count = -1;

const stroke = {
    /** this set is used to both apply and remove the highlight color effect. */
    flat_queue: new Set() as Set<number>,
    /** this array encodes the individual queued strokes with their respective
     * color. */
    queue: [] as {stroke:Set<number>, color_data:color_data}[],
    /** default value set to -1, since this variable gets incremented by one
     * each time a new queued stroke is done (this also applied to the first
     * one). */
    count: -1,
    /** this value is used to  */
    wave_id: 0,
    choosen_palette: [] as color_data[],
    /** index of the color used from the current choosen palette of colors. */
    palette_color: 0,
    /** gpu = 0: value used to filter out all the queued waves when filling or
     * clearing the entire grid. */
    queued_wave_count: 0,
    /** gpu = 0: each wave_id lower or equal to this value will be discarded. */
    prevent_waves_last_id: 0
};

let process_stroke: (hovered:number) => void,
    remove_highlights: () => void,
    process_queued_strokes: () => void;

if (gpu !== 1) {
function cpu_process_stroke(hovered:number) {
    if (hovered !== 0 && hovered !== mouse.last_hovered_id) {
        if (keyboard.shift_down) {
            const brush = grid.adj_graph[hovered].brush;

            const newly_hovered = brush.difference(stroke.flat_queue);
            if (newly_hovered.size === 0)
                return;

            for (const id of newly_hovered) {
                stroke.queue[stroke.count].stroke.add(id);
                stroke.flat_queue.add(id);

                const offset = id*4;
                grid.texture[offset] =
                    Math.min(Math.floor(grid.texture[offset] + 255) * 0.5, 255);
                grid.texture[offset+1] =
                    Math.min(Math.floor(grid.texture[offset+1] + 255) * 0.5, 255);
                grid.texture[offset+2] =
                    Math.min(Math.floor(grid.texture[offset+2] + 255) * 0.5, 255);
            }

            renderer.texture_is_dirty = true;
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
}

function cpu_remove_highlights() {
    for (const id of stroke.flat_queue) {
        const offset = id*4;
        grid.texture[offset] = Math.max(2*grid.texture[offset] - 255, 0);
        grid.texture[offset+1] = Math.max(2*grid.texture[offset+1] - 255, 0);
        grid.texture[offset+2] = Math.max(2*grid.texture[offset+2] - 255, 0);
        grid.texture[offset+3] = Math.max(2*grid.texture[offset+3] - 255, 0);
    }
    renderer.texture_is_dirty = true;
    stroke.flat_queue.clear();
}

function cpu_process_queued_strokes() {
    if (stroke.flat_queue.size === 0)
        return;

    cpu_remove_highlights();
    
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

process_stroke = cpu_process_stroke;
remove_highlights = cpu_remove_highlights;
process_queued_strokes = cpu_process_queued_strokes;
}