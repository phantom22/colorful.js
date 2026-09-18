    /** this value is used to  */
let wave_id = 0,
    /** */
    choosen_palette = [] as color_data[],
    /** index of the color used from the current choosen palette of colors. */
    palette_color = 0,
    /** value used to filter out all the queued waves when filling or clearing
     * the entire grid. */
    queued_wave_count = 0,
    /** each wave_id lower or equal to this value will be discarded. */
    prevent_waves_last_id = 0;

function cpu_wave_start(
    ids:number|Set<number>, color_data?:color_data,
    _wave_id?:number
) {
    --queued_wave_count;
    queued_wave_count = Math.max(queued_wave_count, 0);

    const _state = _wave_id === undefined 
            ? ++wave_id
            : _wave_id;

    if (_state <= prevent_waves_last_id)
        return;

    let color: Uint8Array, fcolor: Float32Array, packed:number;
    if (color_data === undefined) {
        const data = choosen_palette[palette_color];
        color = data.color;
        if (choosen_palette.length > 1)
            palette_color = (palette_color+1) % choosen_palette.length;

        fcolor = data.fcolor;
        packed = data.packed;
    }
    else {
        color = color_data.color;
        fcolor = color_data.fcolor;
        packed = color_data.packed;
    }

    let next: Set<adj_node>;
    if (typeof ids === "number") {
        grid.adj_graph[ids].state = _state;
        if (wave_queue.has(ids)) {
            const offset = ids*4;
            grid.texture[offset] = Math.floor((color[0] + 255) * 0.5);
            grid.texture[offset+1] = Math.floor((color[1] + 255) * 0.5);
            grid.texture[offset+2] = Math.floor((color[2] + 255) * 0.5);
            grid.texture[offset+3] = 255;
        }
        else
            grid.texture_u32view[ids] = packed;
        
        next = new Set(grid.adj_graph[ids].next);
    }
    else {
        next = new Set();
        for (const id of ids) {
            const node = grid.adj_graph[id];
            node.state = _state;
            grid.texture_u32view[id] = packed;

            for (const nnext of node.next) {
                if (next.has(nnext))
                    continue;
                next.add(nnext);
            }
        }
    }

    texture_is_dirty = true;
    cpu_wave_propagate(next, _state, {color,fcolor,packed}, 0);
}

function cpu_wave_propagate(
    ids:Set<adj_node>, state:number, color_data:color_data, depth:number
) {
    --queued_wave_count;
    queued_wave_count = Math.max(queued_wave_count, 0);

    if (state <= prevent_waves_last_id)
        return;

    const collected = new Set() as Set<adj_node>,
          new_wave = new Set() as Set<adj_node>;

    let factor = blend_value;
    if (wave_decay < 1)
        factor *= wave_decay ** Math.max(depth-decay_min_radius-1, 0);

    const {color,packed} = color_data;
    for (const node of ids) {
        if (node.state === state) {
            ids.delete(node);
            continue;
        }

        if (Math.random() <= new_wave_p)
            new_wave.add(node);

        const node_id = node.id,
              offset = node_id*4,
              is_hovered = wave_queue.has(node_id);
        node.state = state;
        
        let avg_r = 0, avg_g = 0, avg_b = 0;
        for (const adj_node of node.next) {
            const adj_id = adj_node.id,
                  adj_offset = adj_id*4;

            if (wave_queue.has(adj_id)) {
                /** remove applied white highlight color from adjacent nodes 
                 * before adding the true color to the total sum */
                avg_r +=
                    Math.max(Math.floor(2*grid.texture[adj_offset] - 255), 0);
                avg_g +=
                    Math.max(Math.floor(2*grid.texture[adj_offset+1] - 255), 0);
                avg_b +=
                    Math.max(Math.floor(2*grid.texture[adj_offset+2] - 255), 0);
            }
            else {
                avg_r += grid.texture[adj_offset];
                avg_g += grid.texture[adj_offset+1];
                avg_b += grid.texture[adj_offset+2];
            }
            
            if (ids.has(adj_node) || adj_node.state >= state)
                continue;
            collected.add(adj_node);
        }

        const inv_adj_count = 1 / node.next.size;
        avg_r *= inv_adj_count;
        avg_g *= inv_adj_count;
        avg_b *= inv_adj_count;

        if (factor >= 1) {
            if (is_hovered) {
                grid.texture[offset] =
                    Math.max(Math.floor((avg_r + 255) * 0.5), 0);
                grid.texture[offset+1] =
                    Math.max(Math.floor((avg_g + 255) * 0.5), 0);
                grid.texture[offset+2] =
                    Math.max(Math.floor((avg_b + 255) * 0.5), 0);
                grid.texture[offset+3] = 255;
            }
            else
                grid.texture_u32view[node_id] = packed;
        }
        else if (factor > 0) {
            const p_in = 1-factor,
                  p = factor;

            if (is_hovered) {
                grid.texture[offset] =
                    Math.max(Math.floor((Math.floor(avg_r * p_in + color[0] * p) + 255) * 0.5), 0);
                grid.texture[offset+1] =
                    Math.max(Math.floor((Math.floor(avg_g * p_in + color[1] * p) + 255) * 0.5), 0);
                grid.texture[offset+2] =
                    Math.max(Math.floor((Math.floor(avg_b * p_in + color[2] * p) + 255) * 0.5), 0);
                grid.texture[offset+3] = 255;
            }
            else {
                grid.texture[offset] = Math.floor(avg_r * p_in + color[0] * p);
                grid.texture[offset+1] = Math.floor(avg_g * p_in + color[1] * p);
                grid.texture[offset+2] = Math.floor(avg_b * p_in + color[2] * p);
                grid.texture[offset+3] = 255;
            }
        }
        else {
            if (is_hovered) {
                grid.texture[offset] =
                    Math.max(Math.floor((avg_r + 255) * 0.5), 0);
                grid.texture[offset+1] =
                    Math.max(Math.floor((avg_g + 255) * 0.5), 0);
                grid.texture[offset+2] =
                    Math.max(Math.floor((avg_b + 255) * 0.5), 0);
                grid.texture[offset+3] = 255;
            }
            else {
                grid.texture[offset] = Math.floor(avg_r);
                grid.texture[offset+1] = Math.floor(avg_g);
                grid.texture[offset+2] = Math.floor(avg_b);
                grid.texture[offset+3] = 255;
            }
        }
    }

    texture_is_dirty = true;

    for (const new_start of new_wave) {
        const new_id = new_start.id,
              new_offset = new_id*4,
              is_hovered = wave_queue.has(new_id);
        
        let new_color: Uint8Array | undefined;//, new_color_packed: number;
        let new_color_data: color_data | undefined;
        if (Math.random() <= new_color_p) {
            if (Math.random() <= new_color_compl_p)
                new_color = new Uint8Array([
                    255 - color[0],
                    255 - color[1],
                    255 - color[2],
                    255
                ]);
            else new_color = undefined;
        }
        else {
            if (is_hovered) {
                new_color = new Uint8Array([
                    Math.max(2*grid.texture[new_offset] - 255, 0),
                    Math.max(2*grid.texture[new_offset+1] - 255, 0),
                    Math.max(2*grid.texture[new_offset+2] - 255, 0),
                    255
                ]);
            }
            else {
                new_color = new Uint8Array([
                    grid.texture[new_offset],
                    grid.texture[new_offset+1],
                    grid.texture[new_offset+2],
                    255
                ]);
            }
        }


        if (new_color !== undefined)
            new_color_data = get_color_data(new_color);

        ++queued_wave_count;
        setTimeout(cpu_wave_start, new_wave_delay, 
            new_id, new_color_data, ++wave_id
        );
    }

    if (collected.size === 0)
        return;

    ++queued_wave_count;
    setTimeout(
        cpu_wave_propagate, wave_delay,
        collected, state, color_data, depth+1
    );
}

function cpu_inward_wave() {
    const from = 6*(side_length-2)**2+1,
          to = 6*side_length**2,
          mod = 5,
          m = from % mod;
    const s = new Set() as Set<number>;
    for (let i=from; i<to; ++i) {
        if (i%mod === m) {
            s.add(i);
            cpu_wave_start(s);
            s.clear();
        }
    }
    cpu_wave_start(s);
}

function cpu_fill_grid(color?:color_data) {
    const clear_color = color === undefined ?
        pack_uint8(grid_bg) :
        color.packed;
    grid.texture_u32view.fill(clear_color);
    grid.texture_u32view[0] = 0;

    if (queued_wave_count > 0) {
        prevent_waves_last_id = wave_id + queued_wave_count;
        wave_id = prevent_waves_last_id + 1;
    }

    texture_is_dirty = true;
}