let wave_id = 0,
    palette_color = 0,
    queued_wave_count = 0,
    prevent_waves_last_id = 0

function wave_start(
    ids:number|Set<number>, color_packed?:number, color?:Uint8Array, fcolor?:Float32Array,
    _wave_id?:number
) {
    --queued_wave_count;
    queued_wave_count = Math.max(queued_wave_count, 0);

    const _state = _wave_id === undefined 
            ? ++wave_id
            : _wave_id;

    if (_state <= prevent_waves_last_id)
        return;

    if (color_packed === undefined || color === undefined || fcolor == undefined) {
        color = palette[palette_color];
        fcolor = new Float32Array([
            color[0] / 255, color[1] / 255, color[2] / 255
        ]);
        color_packed = packUint8(color);
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
            grid.texture_u32view[ids] = color_packed;
        
        next = new Set(grid.adj_graph[ids].next);
    }
    else {
        next = new Set();
        for (const id of ids) {
            const node = grid.adj_graph[id];
            node.state = _state;
            grid.texture_u32view[id] = color_packed;

            for (const nnext of node.next) {
                if (next.has(nnext))
                    continue;
                next.add(nnext);
            }
        }
    }

    texture_is_dirty = true;

    ++queued_wave_count;
    setTimeout(wave_propagate, wave_delay, 
        next, _state, color_packed, color, fcolor, 0
    );
}

function wave_propagate(
    ids:Set<adj_node>, state:number, color_packed:number, color:Uint8Array,
    fcolor:Float32Array, depth:number
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

    for (const node of ids) {
        if (node.state === state) {
            ids.delete(node);
            continue;
        }

        if (Math.random() <= new_wave_p)
            new_wave.add(node);

        const node_id = node.id,
              is_hovered = wave_queue.has(node_id);
        node.state = state;
        
        let avg_adj_col = [0, 0, 0];
        for (const adj_node of node.next) {
            const adj_id = adj_node.id,
                  offset = adj_id*4;

            if (wave_queue.has(adj_id)) {
                // remove applied white highlight color from adjacent nodes 
                avg_adj_col[0] += Math.max(Math.floor(2*grid.texture[offset] - 255), 0);
                avg_adj_col[1] += Math.max(Math.floor(2*grid.texture[offset+1] - 255), 0);
                avg_adj_col[2] += Math.max(Math.floor(2*grid.texture[offset+2] - 255), 0);
            }
            else {
                avg_adj_col[0] += grid.texture[offset];
                avg_adj_col[1] += grid.texture[offset+1];
                avg_adj_col[2] += grid.texture[offset+2];
            }
            

            if (ids.has(adj_node) || adj_node.state >= state)
                continue;
            collected.add(adj_node);
        }

        const inv_adj_count = 1 / node.next.size;
        avg_adj_col[0] *= inv_adj_count;
        avg_adj_col[1] *= inv_adj_count;
        avg_adj_col[2] *= inv_adj_count;

        if (factor > 0) {
            const _1_p = 1-factor,
                  p = factor;

            if (is_hovered)
                grid.texture_u32view[node_id] = packUint8(new Uint8Array([
                    Math.max(Math.floor((Math.floor(avg_adj_col[0] * _1_p + color[0] * p) + 255) * 0.5), 0),
                    Math.max(Math.floor((Math.floor(avg_adj_col[1] * _1_p + color[1] * p) + 255) * 0.5), 0),
                    Math.max(Math.floor((Math.floor(avg_adj_col[2] * _1_p + color[2] * p) + 255) * 0.5), 0),
                    255
                ]));
            else
                grid.texture_u32view[node_id] = packUint8(new Uint8Array([
                    Math.floor(avg_adj_col[0] * _1_p + color[0] * p),
                    Math.floor(avg_adj_col[1] * _1_p + color[1] * p),
                    Math.floor(avg_adj_col[2] * _1_p + color[2] * p),
                    255
                ]));
        }
        else if (factor >= 1) {
            if (is_hovered) {
                const offset = node_id * 4;
                grid.texture[offset] = Math.max(Math.floor((color[0] + 255) * 0.5), 0);
                grid.texture[offset+1] = Math.max(Math.floor((color[1] + 255) * 0.5), 0);
                grid.texture[offset+2] = Math.max(Math.floor((color[2] + 255) * 0.5), 0);
            }
            else
                grid.texture_u32view[node_id] = color_packed;
        }
        else {
            if (is_hovered)
                grid.texture_u32view[node_id] = packUint8(new Uint8Array([
                    Math.max(Math.floor((avg_adj_col[0] + 255) * 0.5), 0),
                    Math.max(Math.floor((avg_adj_col[1] + 255) * 0.5), 0),
                    Math.max(Math.floor((avg_adj_col[2] + 255) * 0.5), 0),
                    255
                ]));
            else
                grid.texture_u32view[node_id] = packUint8(new Uint8Array([
                    Math.floor(avg_adj_col[0]),
                    Math.floor(avg_adj_col[1]),
                    Math.floor(avg_adj_col[2]),
                    255
                ]));
        }
    }

    texture_is_dirty = true;

    // gl.bindTexture(gl.TEXTURE_2D, color_texture);
    // gl.texSubImage2D(
    //     gl.TEXTURE_2D, 0,
    //     0, 0,
    //     grid.texture_size, grid.texture_size,
    //     gl.RGBA, gl.UNSIGNED_BYTE, grid.texture
    // );

    for (const new_start of new_wave) {
        const new_id = new_start.id,
              offset = new_id*4,
              is_hovered = wave_queue.has(new_id);
        
        let new_color: Uint8Array, new_color_packed: number;
        if (is_hovered) {
            new_color = new Uint8Array([
                Math.max(2*grid.texture[offset] - 255, 0),
                Math.max(2*grid.texture[offset+1] - 255, 0),
                Math.max(2*grid.texture[offset+2] - 255, 0),
                255
            ]);
            new_color_packed = packUint8(new_color);
        }
        else {
            new_color = new Uint8Array([
                grid.texture[offset],
                grid.texture[offset+1],
                grid.texture[offset+2],
                255
            ]);
            new_color_packed = grid.texture_u32view[new_id];
        }
        
        let new_fcolor = new Float32Array([
            new_color[0] / 255,
            new_color[1] / 255,
            new_color[2] / 255
        ]);

        if (Math.random() <= new_color_p) {
            if (Math.random() <= new_color_compl_p) {
                new_color = new Uint8Array([
                    255 - color[0],
                    255 - color[1],
                    255 - color[2],
                    255
                ]);

                new_fcolor = new Float32Array([
                    1 - fcolor[0],
                    1 - fcolor[1],
                    1 - fcolor[2],
                    1
                ]);
            }
            else {
                // @ts-ignore
                new_color = new_color_packed = new_fcolor = undefined;
            }
        }
        
        ++queued_wave_count;
        setTimeout(wave_start, new_wave_delay, 
            new_id, new_color_packed, new_color, new_fcolor, ++wave_id
        );
    }

    if (collected.size === 0)
        return;

    ++queued_wave_count;
    setTimeout(
        wave_propagate, wave_delay, collected,
        state, color_packed, color, fcolor, depth+1
    );
}

function inward_wave() {
    const from = 6*(side_length-2)**2+1,
          to = 6*side_length**2,
          mod = 5,
          m = from % mod;
    const s = new Set() as Set<number>;
    for (let i=from; i<to; ++i) {
        if (i%mod === m) {
            s.add(i);
            wave_start(s);
            s.clear();
        }
    }
    wave_start(s);
}