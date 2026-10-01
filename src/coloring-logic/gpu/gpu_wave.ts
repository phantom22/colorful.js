if (gpu === 1) {
function gpu_wave_start(
    ids:number|Set<number>, color_data?:color_data,
    _wave_id?:number
) {
    const _state = _wave_id === undefined 
            ? ++stroke.wave_id
            : _wave_id;

    const brush = typeof ids === "number" ?
        new Set(grid.adj_graph[ids].brush) :
        new Set(ids);

    const fcolor = color_data !== undefined
        ? color_data.fcolor
        : stroke.choosen_palette[stroke.palette_color].fcolor;
    if (color_data === undefined && stroke.choosen_palette.length > 1) {
        stroke.palette_color = (stroke.palette_color+1) % stroke.choosen_palette.length;
    }
    const [r,g,b] = fcolor;

    const wcolor_dist = new Float32Array([r, g, b, 0.0]);
    const state_weights = new Float32Array([++stroke.wave_id, max_weight, 0.0, 0.0]);
    

    const target_tex0 = state_read_index === 0 ? state_weights_0 : state_weights_1;
    const target_tex1 = state_read_index === 0 ? wcolor_dist_0 : wcolor_dist_1;
    for (const id of brush) {
        const col = id % grid.texture_size,
              row = Math.floor(id / grid.texture_size);

        gl.bindTexture(gl.TEXTURE_2D, target_tex0);
        gl.texSubImage2D(
            gl.TEXTURE_2D, 0, col, row,
            1, 1, gl.RGBA, gl.FLOAT, state_weights
        );

        gl.bindTexture(gl.TEXTURE_2D, target_tex1);
        gl.texSubImage2D(
            gl.TEXTURE_2D, 0, col, row,
            1, 1, gl.RGBA, gl.FLOAT, wcolor_dist
        );
    }
}

function gpu_inward_wave() {
    const from = 6*(side_length-2)**2+1,
          to = 6*side_length**2,
          mod = 5,
          m = from % mod;
    const s = new Set() as Set<number>;
    for (let i=from; i<to; ++i) {
        if (i%mod === m) {
            s.add(i);
            gpu_wave_start(s);
            s.clear();
        }
    }
    gpu_wave_start(s);
}

function gpu_fill_grid(color?:color_data) {
    const clear_color = color === undefined ?
        get_color_data(grid_bg) :
        color;
    grid.texture_u32view.fill(clear_color.packed);
    grid.state_weights.fill(0.0)
    // start from 1, because there is no vertex id equal to zero
    for (let i=1; i<grid.adj_graph.length; ++i) {
        const offset = i*4;
        grid.wcolor_dist[offset] = 0;
        grid.wcolor_dist[offset+1] = 0;
        grid.wcolor_dist[offset+2] = 0;
        grid.wcolor_dist[offset+3] = 0;
    }
    
    stroke.wave_id = 0;
    renderer.texture_is_dirty = true;
    renderer.state_is_dirty = true;
}

wave_start = gpu_wave_start;
inward_wave = gpu_inward_wave;
fill_grid = gpu_fill_grid;
}