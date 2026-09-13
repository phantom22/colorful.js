const searchParams = new (class {
    url;
    constructor() {
        this.url = new URL(window.location.href);
    }
    getNumber(p, fallback = 0, lower = -Infinity, upper = Infinity) {
        const v = this.url.searchParams.get(p), nv = Number(v);
        // @ts-ignore
        return v === null || isNaN(v) ? fallback : Math.min(Math.max(nv, lower), upper);
    }
    getUint8Color(p, fallback = new Uint8Array([0, 0, 0, 255])) {
        const v = this.url.searchParams.get(p);
        if (v === null)
            return fallback;
        try {
            const av = JSON.parse(v), o = new Uint8Array(4);
            if (!Array.isArray(av))
                return fallback;
            const l = av.length;
            if (l < 3 || l > 4)
                return fallback;
            for (let i = 0; i < 3; ++i) {
                const val = av[i];
                if (val < 0 || val > 255 || val === undefined)
                    return fallback;
                o[i] = val;
            }
            if (l === 3)
                o[3] = 255;
            else if (av[3] !== undefined && av[3] >= 0 && av[3] <= 255)
                o[3] = av[3];
            else
                return fallback;
            return Uint8Array.from(av);
        }
        catch (e) {
            return fallback;
        }
    }
    getBoolean(p) {
        return this.url.searchParams.get(p) === "true";
    }
    getString(p, fallback = "") {
        return this.url.searchParams.get(p) || fallback;
    }
});
const side_length = searchParams.getNumber("side_length", 32, 1), blend_value = searchParams.getNumber("blend_value", 0.008, 0, 1), wave_delay = searchParams.getNumber("wave_delay", 30, 1), wave_decay = searchParams.getNumber("wave_decay", 0.99, 0, 1), decay_min_radius = searchParams.getNumber("decay_min_radius", -2), new_wave_delay = searchParams.getNumber("new_wave_delay", 500, 1), new_wave_p = searchParams.getNumber("new_wave_p", 0.0002, 0, 1), new_color_p = searchParams.getNumber("new_color_p", 0.1, 0, 1), new_color_compl_p = searchParams.getNumber("new_color_compl_p", 0.5, 0, 1), grid_bg = searchParams.getUint8Color("grid_bg"), params = new URLSearchParams([
    ["side_length", `${side_length}`],
    ["blend_value", `${blend_value}`],
    ["wave_delay", `${wave_delay}`],
    ["wave_decay", `${wave_decay}`],
    ["decay_min_radius", `${decay_min_radius}`],
    ["new_wave_delay", `${new_wave_delay}`],
    ["new_wave_p", `${new_wave_p}`],
    ["new_color_p", `${new_color_p}`],
    ["new_color_compl_p", `${new_color_compl_p}`]
]);
{
    const updated_search_params = `?${params.toString()}&grid_bg=[${grid_bg}]`;
    if (window.location.search !== updated_search_params)
        window.history.replaceState({}, '', updated_search_params);
}
let last_picked_color_el;
function update_palette_picker() {
    let i = 0;
    const ch = palette_grid_el.children;
    for (; i < ch.length; ++i) {
        // @ts-ignore
        palette_grid_el.children[i].style.backgroundColor =
            `rgba(${palette[i].toString()})`;
    }
    for (; i < palette.length; ++i) {
        const bttn = document.createElement("button");
        bttn.style.backgroundColor = `rgba(${palette[i].toString()})`;
        const v = i;
        bttn.onclick = () => {
            palette_color = v;
            last_picked_color_el.classList.remove("picked");
            bttn.classList.add("picked");
            last_picked_color_el = bttn;
        };
        palette_grid_el.appendChild(bttn);
    }
    if (last_picked_color_el === undefined) {
        // @ts-ignore
        last_picked_color_el = palette_grid_el.children[0];
        last_picked_color_el.classList.add("picked");
    }
}
let show_info = false;
function toggle_info() {
    show_info = show_info ? false : true;
    curtain_el.style.visibility = show_info ? "visible" : "hidden";
    shift_down = false;
    ctrl_down = false;
    mouse_down = false;
    wave_queue.clear();
}
// const palette = [
//     new Uint8Array([255, 107, 107]), // coral red
//     new Uint8Array([ 78, 205, 196]), // mint cyan
//     new Uint8Array([255, 230, 109]), // pastel yellow
//     new Uint8Array([ 26,  83,  92]), // deep teal
//     new Uint8Array([255, 159,  28]), // bright amber
//     new Uint8Array([ 43,  45,  66]), // midnight indigo
//     new Uint8Array([239,  71, 111]), // neon raspberry
//     new Uint8Array([  6, 214, 160]), // emerald seafoam
//     new Uint8Array([ 17, 138, 178]), // electric cerulean
//     new Uint8Array([247, 208, 138]), // warm gold
//     new Uint8Array([114,   9, 183]), // deep violet
//     new Uint8Array([247,  37, 133]), // vivid magenta
//     new Uint8Array([ 76, 201, 240]), // sky cyan
//     new Uint8Array([255, 123,   0]), // tangelo orange
//     new Uint8Array([112, 224,   0]), // electric lime
//     new Uint8Array([241, 250, 238]), // off-white highlight
//     new Uint8Array([255, 255, 255]),
//     new Uint8Array([  0,   0,   0])
// ];
const palette = [
    new Uint8Array([170, 20, 45]),
    new Uint8Array([235, 50, 65]),
    new Uint8Array([255, 120, 140]),
    new Uint8Array([180, 35, 20]),
    new Uint8Array([242, 75, 40]),
    new Uint8Array([255, 140, 110]),
    new Uint8Array([185, 60, 10]),
    new Uint8Array([248, 110, 20]),
    new Uint8Array([255, 160, 80]),
    new Uint8Array([180, 95, 5]),
    new Uint8Array([245, 155, 15]),
    new Uint8Array([255, 185, 45]),
    new Uint8Array([165, 125, 0]),
    new Uint8Array([235, 195, 10]),
    new Uint8Array([255, 215, 55]),
    new Uint8Array([120, 145, 5]),
    new Uint8Array([175, 215, 15]),
    new Uint8Array([205, 240, 50]),
    new Uint8Array([30, 145, 35]),
    new Uint8Array([60, 210, 65]),
    new Uint8Array([115, 240, 105]),
    new Uint8Array([5, 140, 75]),
    new Uint8Array([15, 205, 115]),
    new Uint8Array([75, 240, 150]),
    new Uint8Array([5, 130, 130]),
    new Uint8Array([10, 195, 195]),
    new Uint8Array([65, 235, 225]),
    new Uint8Array([10, 115, 170]),
    new Uint8Array([20, 175, 240]),
    new Uint8Array([85, 215, 255]),
    new Uint8Array([25, 85, 190]),
    new Uint8Array([45, 135, 255]),
    new Uint8Array([115, 180, 255]),
    new Uint8Array([55, 60, 200]),
    new Uint8Array([90, 100, 255]),
    new Uint8Array([150, 160, 255]),
    new Uint8Array([90, 45, 195]),
    new Uint8Array([140, 80, 255]),
    new Uint8Array([180, 135, 255]),
    new Uint8Array([130, 30, 180]),
    new Uint8Array([190, 60, 245]),
    new Uint8Array([215, 115, 255]),
    new Uint8Array([160, 20, 140]),
    new Uint8Array([235, 45, 205]),
    new Uint8Array([255, 105, 230]),
    new Uint8Array([165, 15, 90]),
    new Uint8Array([240, 40, 140]),
    new Uint8Array([255, 110, 180]),
    new Uint8Array([230, 230, 230]),
    new Uint8Array([255, 255, 255]),
    new Uint8Array([230, 230, 230]),
    new Uint8Array([96, 96, 96]),
    new Uint8Array([128, 128, 128]),
    new Uint8Array([160, 160, 160]),
    new Uint8Array([0, 0, 0]),
    new Uint8Array([32, 32, 32]),
    new Uint8Array([64, 64, 64])
];
function compile_shader_program(gl, vertex_id, fragment_id, attributes = [], uniforms = []) {
    if (gl === null || gl === undefined)
        throw "Colorful.js: compile_shader_program(): the passed WebGL " +
            "context is null or undefined";
    if (!Array.isArray(uniforms))
        throw "Colorful.js: compile_shader_program(): uniforms must be an " +
            "array of string";
    if (!Array.isArray(attributes))
        throw "Colorful.js: compile_shader_program(): attributes must be an " +
            "array of string";
    const v_el = document.getElementById(vertex_id), f_el = document.getElementById(fragment_id);
    if (!(v_el instanceof HTMLScriptElement) || v_el.type !== "x-shader/vs")
        throw "Colorful.js: compile_shader_program(): vertex source element " +
            // @ts-ignore
            "is expected to be of a <script> element of type 'x-shader/vs' (got " + v_el.type + ")";
    if (!(f_el instanceof HTMLScriptElement) || f_el.type !== "x-shader/fs")
        throw "Colorful.js: compile_shader_program(): fragment source element " +
            "is expected to be of a <script> element of type 'x-shader/vs'";
    const v_src = v_el.textContent.trimStart(), f_src = f_el.textContent.trimStart();
    const v = gl.createShader(gl.VERTEX_SHADER);
    if (v === null)
        throw "Colorful.js: couldn't create vertex shader";
    gl.shaderSource(v, v_src);
    gl.compileShader(v);
    if (!gl.getShaderParameter(v, gl.COMPILE_STATUS))
        throw "Colorful.js: compile_shader(): failed to compile vertex " +
            "shader, reason: " + gl.getShaderInfoLog(v);
    const f = gl.createShader(gl.FRAGMENT_SHADER);
    if (f === null)
        throw "Colorful.js: couldn't create fragment shader";
    gl.shaderSource(f, f_src);
    gl.compileShader(f);
    if (!gl.getShaderParameter(f, gl.COMPILE_STATUS))
        throw "Colorful.js: compile_shader(): failed to compile fragment " +
            "shader, reason: " + gl.getShaderInfoLog(f);
    const p = gl.createProgram();
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
        throw "Colorful.js: compile_shader(): failed to link shader program, " +
            "reason: " + gl.getProgramInfoLog(p);
    const o = {
        vertex: v,
        fragment: f,
        program: p,
        attributes: {},
        uniforms: {},
        useProgram() { gl.useProgram(p); }
    };
    for (const key of uniforms) {
        const loc = gl.getUniformLocation(p, key);
        if (loc === null)
            throw `Colorful.js: the specified uniform named '${key}' is not`
                + " defined within the shader.";
        o.uniforms[key] = loc;
    }
    for (const key of attributes) {
        o.attributes[key] = gl.getAttribLocation(p, key);
    }
    return o;
}
function create_orthographic_matrix(l, r, b, t, n, f) {
    return new Float32Array([
        2 / (r - l), 0, 0, 0,
        0, 2 / (t - b), 0, 0,
        0, 0, -2 / (f - n), 0,
        -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1
    ]);
}
const _pack_buffer = new ArrayBuffer(4), _pack8 = new Uint8Array(_pack_buffer), _pack32 = new Uint32Array(_pack_buffer);
/** This approach was used to guarantee endian compatibility. */
function packUint8(color) {
    _pack8[0] = color[0];
    _pack8[1] = color[1];
    _pack8[2] = color[2];
    _pack8[3] = 255;
    return _pack32[0]; // Guaranteed exact memory layout for current CPU
}
class adj_node {
    constructor(id) {
        this.id = id;
        this.state = 0;
        this.next = new Set();
    }
}
class ColorfulGrid {
    constructor(side_length, color = new Uint8Array([255, 255, 255, 255])) {
        if (!Number.isInteger(side_length) || side_length < 1)
            throw `ColorfulGrid: side_length must be an integer greater than 1`;
        this.side_length = side_length;
        const num_triangles = 6 * side_length ** 2;
        this.vertex_count = num_triangles * 3;
        this.adj_map = Array(num_triangles + 1);
        this.mesh = new Float32Array(num_triangles * 2 * 3);
        const _2_side = side_length * 2;
        const points = Array.from({ length: _2_side + 1 }, () => Array.from({ length: _2_side + 1 }, () => Array(2)));
        let a = 0, b = 0;
        {
            const step = 1 / side_length, sqrt_step = Math.sqrt(3) / 2 * step;
            for (let a = 0; a <= _2_side; ++a) {
                for (let b = 0; b <= _2_side; ++b) {
                    const u = b - side_length, v = a - side_length;
                    points[a][b][0] = (u - 0.5 * v) * step;
                    points[a][b][1] = v * sqrt_step;
                }
            }
        }
        /**
         * Offset to be applied to `a` and `b` during the construction of the
         *  hexagon mesh. Both parameters are used in the matrix of points that
         *  will define the mesh itself.
         *
         * Each vertex lies on the point matrix defined by
         *  [b/_2l, 0.75 + (b/2 - a) * _2l] where 0 <= a,b <= 2*side_length,
         *      and _2l = side_length.
         *
         * The hexagon is built starting from the center (depth=d=0) up to
         *  d=side_length, one side at a time.
         *
         * Each side consists of `2*d-1` triangles and, apart from `d=0`, each
         *  depth has two different triangle arrangements.
         *
         * Those arrangements are [v1,v2,v3] and [v4,v5,v6] (at zero depth the
         *  first arrangement is used).
         *
         * v1,v2,v3,v4,v5 and v6 where chosen carefully so that after
         *  constructing the last [v1,v2,v3] of the side there is no need to
         *  move the anchor point before building the next side; while, after
         *  each [v1,v2,v3] and [v4,v5,v6] pair, the anchor moves to v5.
         *
         * The following datastructure, hovewer holds the information only for
         *  [v2,v3,v5] since v1=v4=[0,0] and v2=v6.
         */
        const side_vertex_order = [
            [[1, 0], [0, -1], [1, 1]],
            [[1, 1], [1, 0], [0, 1]],
            [[0, 1], [1, 1], [-1, 0]],
            [[-1, 0], [0, 1], [-1, -1]],
            [[-1, -1], [-1, 0], [0, -1]],
            [[0, -1], [-1, -1], [1, 0]]
        ];
        /** flat vertex coordinate index. */
        let v = 0;
        /** both a and b refer to the exact center of the point matrix. */
        b = a = side_length;
        let triangle_id = 0;
        /** d=depth starting from the center of the hexagon. */
        for (let d = 0; d < side_length; ++d) {
            /** `2*d-1` is the number of triangles per side at depth d. */
            const pair_count = Math.floor((2 * d + 1) / 2), last_layer = d === side_length - 1, triangle_count = 6 * (2 * d + 1);
            /** s=current side, starting from the upper right, clock-wise. */
            for (let s = 0; s < 6; ++s) {
                const deltas = side_vertex_order[s], next_layer_adj = 2 * (3 + s + 6 * d) + 1, 
                /** f(d,s) = 2*(3+s+6*d) + 1
                 * f(d-1,s) = f(d,s) - 12 */
                prev_layer_adj = next_layer_adj - 12;
                for (let p = 0; p < pair_count; ++p) {
                    const delta_a = deltas[2][1], delta_b = deltas[2][0];
                    const v1 = points[a][b], v2 = points[a + deltas[0][1]][b + deltas[0][0]], v3 = points[a + deltas[1][1]][b + deltas[1][0]], v5 = points[a + delta_a][b + delta_b];
                    this.mesh[v] = v1[0];
                    this.mesh[v + 1] = v1[1];
                    this.mesh[v + 2] = v2[0];
                    this.mesh[v + 3] = v2[1];
                    this.mesh[v + 4] = v3[0];
                    this.mesh[v + 5] = v3[1];
                    const t1 = ++triangle_id;
                    if (s === 0 && p === 0)
                        this.adj_map[t1] =
                            [t1 + 1, t1 + triangle_count - 1, t1 + next_layer_adj];
                    else
                        this.adj_map[t1] = [t1 - 1, t1 + 1, t1 + next_layer_adj];
                    this.mesh[v + 6] = v1[0];
                    this.mesh[v + 7] = v1[1];
                    this.mesh[v + 8] = v5[0];
                    this.mesh[v + 9] = v5[1];
                    this.mesh[v + 10] = v2[0];
                    this.mesh[v + 11] = v2[1];
                    const t2 = ++triangle_id;
                    this.adj_map[t2] = [t2 - prev_layer_adj, t2 - 1, t2 + 1];
                    a = a + delta_a;
                    b = b + delta_b;
                    v = v + 12;
                }
                /** last triangle for the side s at depth d. */
                const v1 = points[a][b], v2 = points[a + deltas[0][1]][b + deltas[0][0]], v3 = points[a + deltas[1][1]][b + deltas[1][0]];
                this.mesh[v] = v1[0];
                this.mesh[v + 1] = v1[1];
                this.mesh[v + 2] = v2[0];
                this.mesh[v + 3] = v2[1];
                this.mesh[v + 4] = v3[0];
                this.mesh[v + 5] = v3[1];
                const t = ++triangle_id;
                if (s === 0)
                    if (d === 0)
                        this.adj_map[t] =
                            [t + 1, t + triangle_count - 1, t + next_layer_adj];
                    else
                        this.adj_map[t] = [t - 1, t + 1, t + next_layer_adj];
                else if (s !== 5)
                    this.adj_map[t] = [t - 1, t + 1];
                else
                    this.adj_map[t] = [t - triangle_count + 1, t - 1];
                if (!last_layer && s !== 0)
                    this.adj_map[t][2] = t + next_layer_adj;
                v = v + 6;
            }
            /** when last (upper left) side is done, the last access point is
             *      [a=center-d, b=center].
             * a must be decreased once to move up to the next depth level. */
            --a;
        }
        this.ids = new Uint32Array(num_triangles * 3);
        for (let i = 0; i < num_triangles; ++i) {
            const id = i + 1, base_i = i * 3;
            this.ids[base_i] = id;
            this.ids[base_i + 1] = id;
            this.ids[base_i + 2] = id;
        }
        const texture_size = Math.ceil(Math.sqrt(this.vertex_count));
        this.texture = new Uint8Array(texture_size * texture_size * 4);
        this.texture_size = texture_size;
        const u32view = new Uint32Array(this.texture.buffer);
        u32view.fill((color[3] << 24) | (color[2] << 16) | (color[1] << 8) | color[0]);
        this.texture_u32view = u32view;
        this.adj_graph = Array(num_triangles + 1);
        for (let id = 1; id < this.adj_map.length; ++id) {
            this.adj_graph[id] = new adj_node(id);
            const adj_ids = this.adj_map[id];
            for (let j = 0; j < adj_ids.length; ++j) {
                const nid = adj_ids[j];
                if (nid > id)
                    break;
                this.adj_graph[id].next.add(this.adj_graph[nid]);
                this.adj_graph[nid].next.add(this.adj_graph[id]);
            }
        }
    }
}
function update_viewport() {
    let _width = window.innerWidth, _height = window.innerHeight;
    if (_width !== width || _height !== height) {
        width = _width;
        height = _height;
        canvas_el.width = _width;
        canvas_el.height = _height;
        canvas_el.style.width = _width.toString();
        canvas_el.style.height = _height.toString();
        gl.bindTexture(gl.TEXTURE_2D, mask_texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32UI, width, height, 0, gl.RED_INTEGER, gl.UNSIGNED_INT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        ar = _width / _height;
        proj_mat = create_orthographic_matrix(-ar, ar, -1, 1, -1, 1);
        p.useProgram();
        gl.uniformMatrix4fv(p.uniforms["u_proj"], false, proj_mat);
        mask_p.useProgram();
        gl.uniformMatrix4fv(mask_p.uniforms["u_proj"], false, proj_mat);
        force_render_mask = true;
        mouse_down = false;
        shift_down = false;
        ctrl_down = false;
        queued_strokes = [];
        wave_queue.clear();
        hovered_id = undefined;
    }
}
let wave_id = 0, palette_color = 0, queued_wave_count = 0, prevent_waves_last_id = 0;
function wave_start(ids, color_packed, color, fcolor, _wave_id) {
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
    let next;
    if (typeof ids === "number") {
        grid.adj_graph[ids].state = _state;
        if (wave_queue.has(ids)) {
            const offset = ids * 4;
            grid.texture[offset] = Math.floor((color[0] + 255) * 0.5);
            grid.texture[offset + 1] = Math.floor((color[1] + 255) * 0.5);
            grid.texture[offset + 2] = Math.floor((color[2] + 255) * 0.5);
            grid.texture[offset + 3] = 255;
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
    setTimeout(wave_propagate, wave_delay, next, _state, color_packed, color, fcolor, 0);
}
function wave_propagate(ids, state, color_packed, color, fcolor, depth) {
    --queued_wave_count;
    queued_wave_count = Math.max(queued_wave_count, 0);
    if (state <= prevent_waves_last_id)
        return;
    const collected = new Set(), new_wave = new Set();
    let factor = blend_value;
    if (wave_decay < 1)
        factor *= wave_decay ** Math.max(depth - decay_min_radius - 1, 0);
    for (const node of ids) {
        if (node.state === state) {
            ids.delete(node);
            continue;
        }
        if (Math.random() <= new_wave_p)
            new_wave.add(node);
        const node_id = node.id, is_hovered = wave_queue.has(node_id);
        node.state = state;
        let avg_adj_col = [0, 0, 0];
        for (const adj_node of node.next) {
            const adj_id = adj_node.id, offset = adj_id * 4;
            if (wave_queue.has(adj_id)) {
                // remove applied white highlight color from adjacent nodes 
                avg_adj_col[0] += Math.max(Math.floor(2 * grid.texture[offset] - 255), 0);
                avg_adj_col[1] += Math.max(Math.floor(2 * grid.texture[offset + 1] - 255), 0);
                avg_adj_col[2] += Math.max(Math.floor(2 * grid.texture[offset + 2] - 255), 0);
            }
            else {
                avg_adj_col[0] += grid.texture[offset];
                avg_adj_col[1] += grid.texture[offset + 1];
                avg_adj_col[2] += grid.texture[offset + 2];
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
            const _1_p = 1 - factor, p = factor;
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
                grid.texture[offset + 1] = Math.max(Math.floor((color[1] + 255) * 0.5), 0);
                grid.texture[offset + 2] = Math.max(Math.floor((color[2] + 255) * 0.5), 0);
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
        const new_id = new_start.id, offset = new_id * 4, is_hovered = wave_queue.has(new_id);
        let new_color, new_color_packed;
        if (is_hovered) {
            new_color = new Uint8Array([
                Math.max(2 * grid.texture[offset] - 255, 0),
                Math.max(2 * grid.texture[offset + 1] - 255, 0),
                Math.max(2 * grid.texture[offset + 2] - 255, 0),
                255
            ]);
            new_color_packed = packUint8(new_color);
        }
        else {
            new_color = new Uint8Array([
                grid.texture[offset],
                grid.texture[offset + 1],
                grid.texture[offset + 2],
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
        setTimeout(wave_start, new_wave_delay, new_id, new_color_packed, new_color, new_fcolor, ++wave_id);
    }
    if (collected.size === 0)
        return;
    ++queued_wave_count;
    setTimeout(wave_propagate, wave_delay, collected, state, color_packed, color, fcolor, depth + 1);
}
function inward_wave() {
    const from = 6 * (side_length - 2) ** 2 + 1, to = 6 * side_length ** 2, mod = 5, m = from % mod;
    const s = new Set();
    for (let i = from; i < to; ++i) {
        if (i % mod === m) {
            s.add(i);
            wave_start(s);
            s.clear();
        }
    }
    wave_start(s);
}
let hovered_id = undefined, wave_queue = new Set(), queued_strokes = [], broke_stroke = false, stroke_count = -1;
function process_stroke(hovered) {
    if (hovered !== 0 && hovered !== hovered_id) {
        if (shift_down) {
            if (!wave_queue.has(hovered)) {
                wave_queue.add(hovered);
                if (broke_stroke) {
                    queued_strokes[++stroke_count] = new Set();
                    broke_stroke = false;
                }
                queued_strokes[stroke_count].add(hovered);
                const offset = hovered * 4;
                grid.texture[offset] =
                    Math.min(Math.floor(grid.texture[offset] + 255) * 0.5, 255);
                grid.texture[offset + 1] =
                    Math.min(Math.floor(grid.texture[offset + 1] + 255) * 0.5, 255);
                grid.texture[offset + 2] =
                    Math.min(Math.floor(grid.texture[offset + 2] + 255) * 0.5, 255);
            }
            for (const adj of grid.adj_graph[hovered].next) {
                const id = adj.id, offset = id * 4;
                if (wave_queue.has(id))
                    continue;
                queued_strokes[stroke_count].add(hovered);
                wave_queue.add(id);
                grid.texture[offset] =
                    Math.min(Math.floor(grid.texture[offset] + 255) * 0.5, 255);
                grid.texture[offset + 1] =
                    Math.min(Math.floor(grid.texture[offset + 1] + 255) * 0.5, 255);
                grid.texture[offset + 2] =
                    Math.min(Math.floor(grid.texture[offset + 2] + 255) * 0.5, 255);
            }
            texture_is_dirty = true;
        }
        else if (ctrl_down) {
            const clear_color = packUint8(palette[palette_color]);
            for (let i = 0; i < grid.adj_graph.length; ++i)
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
function process_queued_strokes() {
    for (let i = 0; i < queued_strokes.length; ++i) {
        const q = queued_strokes[i];
        let s = new Set(), mod = 5, m;
        for (const id of q) {
            if (m === undefined) {
                m = id % mod;
            }
            s.add(id);
            if (id % mod === m) {
                wave_start(s);
                s.clear();
            }
        }
        if (s.size > 0) {
            wave_start(s);
            s.clear();
        }
    }
    wave_queue.clear();
    queued_strokes = [];
    stroke_count = -1;
}
let pixel_data = new Uint32Array(1), force_render_mask = true, texture_is_dirty = false, request_sample = false, request_clear = false, frame = 0;
function draw() {
    ++frame;
    if (request_clear) {
        const clear_color = packUint8(grid_bg);
        for (let i = 0; i < grid.adj_graph.length; ++i)
            grid.texture_u32view[i] = clear_color;
        if (queued_wave_count > 0) {
            prevent_waves_last_id = wave_id + queued_wave_count;
            wave_id = prevent_waves_last_id + 1;
        }
        request_clear = false;
        texture_is_dirty = true;
    }
    if (force_render_mask || request_sample) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, mask_fbo);
        gl.readBuffer(gl.COLOR_ATTACHMENT0);
        if (force_render_mask) {
            gl.viewport(0, 0, width, height);
            gl.clearBufferuiv(gl.COLOR, 0, new Uint32Array([0, 0, 0, 0]));
            mask_p.useProgram();
            gl.uniformMatrix4fv(mask_p.uniforms["u_proj"], false, proj_mat);
            gl.bindVertexArray(mask_vao);
            gl.drawArrays(gl.TRIANGLES, 0, vertex_count);
            force_render_mask = false;
        }
        if (request_sample && gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
            gl.readPixels(mouse_x, mouse_y, 1, 1, gl.RED_INTEGER, gl.UNSIGNED_INT, pixel_data);
            process_stroke(pixel_data[0]);
            request_sample = false;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    p.useProgram();
    if (texture_is_dirty) {
        gl.bindTexture(gl.TEXTURE_2D, color_texture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, grid.texture_size, grid.texture_size, gl.RGBA, gl.UNSIGNED_BYTE, grid.texture);
        texture_is_dirty = false;
    }
    gl.bindVertexArray(vao);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, color_texture);
    gl.drawArrays(gl.TRIANGLES, 0, vertex_count);
    requestAnimationFrame(draw);
}
let gl, p, mask_p, grid, vertex_count, mask_texture, mask_fbo, ar, proj_mat, width, height, vao, vertex_color_data, color_texture, mask_vao;
let canvas_el, palette_grid_el, curtain_el, esc_button_el;
function init() {
    canvas_el = document.getElementById("screen");
    if (!(canvas_el instanceof HTMLCanvasElement))
        throw "Colorful.js: couldn't find 'canvas#screen' element.";
    palette_grid_el = document.getElementById("palette-grid");
    if (palette_grid_el === null)
        throw "Colorful.js: couldn't find '#palette-grid' element.";
    curtain_el = document.getElementById("info-curtain");
    if (curtain_el === null)
        throw "Colorful.js: couldn't find '#info-curtain' element.";
    esc_button_el = document.getElementById("esc-button");
    if (esc_button_el === null)
        throw "Colorful.js: couldn't find '#esc-button' element.";
    esc_button_el.onclick = toggle_info;
    gl = canvas_el.getContext("webgl2");
    update_palette_picker();
    //////////////////////////////////
    //       MAIN SHADER            //
    //////////////////////////////////
    p = compile_shader_program(gl, "vertex-shader", "fragment-shader", [], ["u_proj", "u_texture", "u_texture_size"]);
    p.useProgram();
    width = window.innerWidth,
        height = window.innerHeight;
    ar = width / height;
    proj_mat = create_orthographic_matrix(-ar, ar, -1, 1, -1, 1);
    canvas_el.width = width;
    canvas_el.height = height;
    canvas_el.style.width = width.toString();
    canvas_el.style.height = height.toString();
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    grid = new ColorfulGrid(side_length, grid_bg);
    vertex_count = grid.vertex_count;
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const pos_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pos_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, grid.mesh, gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
    const id_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, id_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, grid.ids, gl.STATIC_DRAW);
    gl.vertexAttribIPointer(1, 1, gl.UNSIGNED_INT, 0, 0);
    gl.enableVertexAttribArray(1);
    gl.uniformMatrix4fv(p.uniforms["u_proj"], false, proj_mat);
    // gl.uniform1ui(p.uniforms["u_vertex_count"], vertex_count);
    gl.uniform1f(p.uniforms["u_texture_size"], grid.texture_size);
    gl.uniform1i(p.uniforms["u_texture"], 0);
    color_texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, color_texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, grid.texture_size, grid.texture_size, 0, gl.RGBA, gl.UNSIGNED_BYTE, grid.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    //////////////////////////////////
    //       MASK SHADER            //
    //////////////////////////////////
    mask_p = compile_shader_program(gl, "mask-vertex", "mask-fragment", [], ["u_proj"]);
    mask_p.useProgram();
    gl.uniformMatrix4fv(mask_p.uniforms["u_proj"], false, proj_mat);
    mask_vao = gl.createVertexArray();
    gl.bindVertexArray(mask_vao);
    const mask_pos_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, mask_pos_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, grid.mesh, gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
    const mask_id_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, mask_id_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, grid.ids, gl.STATIC_DRAW);
    gl.vertexAttribIPointer(1, 1, gl.UNSIGNED_INT, 0, 0);
    gl.enableVertexAttribArray(1);
    mask_texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, mask_texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32UI, width, height, 0, gl.RED_INTEGER, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    mask_fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, mask_fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, mask_texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    canvas_el.onmouseleave = c_mouseleave;
    canvas_el.onmousedown = c_mousedown;
    canvas_el.onmousemove = c_mousemove;
    canvas_el.onmouseup = c_mouseup;
    draw();
}
let shift_down = false, ctrl_down = false;
function w_keydown(e) {
    if (e.key === "Shift") {
        shift_down = true;
        broke_stroke = true;
        stroke_count = -1;
    }
    else if (e.key === "Control") {
        ctrl_down = true;
    }
}
function w_keyup(e) {
    if (e.key === "Shift") {
        shift_down = false;
        process_queued_strokes();
    }
    else if (e.key === "Control")
        ctrl_down = false;
    else if (e.key === "p")
        inward_wave();
    else if (e.key === "c")
        request_clear = true;
    else if (e.key === "Escape") {
        toggle_info();
    }
}
window.onkeydown = w_keydown;
window.onkeyup = w_keyup;
let mouse_down = false, last_mouse_sample_frame = -1, mouse_x, mouse_y;
function c_mouseleave() {
    mouse_down = false;
    shift_down = false;
    ctrl_down = false;
    hovered_id = undefined;
    if (wave_queue.size !== 0) {
        wave_start(wave_queue);
        wave_queue.clear();
    }
}
function c_mousedown(e) {
    if (mouse_down === true || e.button !== 0
        || last_mouse_sample_frame === frame)
        return;
    // palette_color = ++palette_color % palette.length;
    mouse_down = true;
    if (force_render_mask)
        return;
    const rect = canvas_el.getBoundingClientRect();
    mouse_x = Math.floor((e.clientX - rect.left) * width / rect.width);
    mouse_y = Math.floor((rect.bottom - e.clientY) * height / rect.height);
    request_sample = true;
    last_mouse_sample_frame = frame;
}
function c_mousemove(e) {
    if (mouse_down === false || force_render_mask
        || last_mouse_sample_frame === frame)
        return;
    const rect = canvas_el.getBoundingClientRect();
    mouse_x = Math.floor((e.clientX - rect.left) * width / rect.width);
    mouse_y = Math.floor((rect.bottom - e.clientY) * height / rect.height);
    request_sample = true;
    last_mouse_sample_frame = frame;
}
function c_mouseup(e) {
    if (e.button !== 0)
        return;
    broke_stroke = shift_down ? true : false;
    mouse_down = false;
    hovered_id = undefined;
}
function w_mouseleave() {
    mouse_down = false;
    shift_down = false;
    ctrl_down = false;
    hovered_id = undefined;
    process_queued_strokes();
}
function w_blur() {
    mouse_down = false;
    shift_down = false;
    ctrl_down = false;
    hovered_id = undefined;
    wave_queue.clear();
    queued_strokes = [];
    stroke_count = -1;
}
window.onresize = update_viewport;
window.onblur = w_blur;
window.onmouseleave = w_mouseleave;
window.onload = init;
