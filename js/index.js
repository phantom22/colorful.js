const searchParams = new (class {
    url;
    constructor() {
        this.url = new URL(window.location.href);
    }
    getNumber(p, fallback = 0) {
        const v = this.url.searchParams.get(p);
        // @ts-ignore
        return v === null || isNaN(v) ? fallback : Number(v);
    }
    getBoolean(p) {
        return this.url.searchParams.get(p) === "true";
    }
    getString(p) {
        return this.url.searchParams.get(p) || "";
    }
});
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
    gl.shaderSource(v, v_src);
    gl.compileShader(v);
    if (!gl.getShaderParameter(v, gl.COMPILE_STATUS))
        throw "Colorful.js: compile_shader(): failed to compile vertex " +
            "shader, reason: " + gl.getShaderInfoLog(v);
    const f = gl.createShader(gl.FRAGMENT_SHADER);
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
        o.uniforms[key] = gl.getUniformLocation(p, key);
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
function packUint8(color) {
    return (color[3] << 24) | (color[2] << 16) | (color[1] << 8) | color[0];
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
                    this.adj_map[t] = [t + 1, t + triangle_count - 1];
                else if (s !== 5)
                    this.adj_map[t] = [t - 1, t + 1];
                else
                    this.adj_map[t] = [t - triangle_count + 1, t - 1];
                if (!last_layer)
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
let gl, canvas, p, mask_p, grid, vertex_count, mask_texture, mask_fbo, ar, proj_mat, width, height, vao, vertex_color_data, color_texture;
const side_length = searchParams.getNumber("side_length", 20), blend_value = searchParams.getNumber("blend_value", 0), wave_delay = searchParams.getNumber("wave_delay", 20), wave_decay = searchParams.getNumber("wave_decay", 0.99), decay_min_radius = searchParams.getNumber("decay_min_radius", -2), new_wave_delay = searchParams.getNumber("new_wave_delay", 500), new_wave_p = searchParams.getNumber("new_wave_p", 0.00015), new_color_p = searchParams.getNumber("new_color_p", 0.1), new_color_compl_p = searchParams.getNumber("new_color_compl_p", 0.5), params = new URLSearchParams([
    ["side_length", String(side_length)],
    ["blend_value", String(blend_value)],
    ["wave_delay", String(wave_delay)],
    ["wave_decay", String(wave_decay)],
    ["decay_min_radius", String(decay_min_radius)],
    ["new_wave_delay", String(new_wave_delay)],
    ["new_wave_p", String(new_wave_p)],
    ["new_color_p", String(new_color_p)],
    ["new_color_compl_p", String(new_color_compl_p)],
]), palette = [
    new Uint8Array([255, 107, 107]),
    new Uint8Array([78, 205, 196]),
    new Uint8Array([255, 230, 109]),
    new Uint8Array([26, 83, 92]),
    new Uint8Array([255, 159, 28]),
    new Uint8Array([43, 45, 66]),
    new Uint8Array([239, 71, 111]),
    new Uint8Array([6, 214, 160]),
    new Uint8Array([17, 138, 178]),
    new Uint8Array([247, 208, 138]),
    new Uint8Array([114, 9, 183]),
    new Uint8Array([247, 37, 133]),
    new Uint8Array([76, 201, 240]),
    new Uint8Array([255, 123, 0]),
    new Uint8Array([112, 224, 0]),
    new Uint8Array([241, 250, 238]), // off-white highlight
], palette_size = palette.length;
window.history.replaceState({}, '', window.location.pathname + "?" + params.toString());
window.onload = () => {
    canvas = document.getElementById("screen");
    if (!(canvas instanceof HTMLCanvasElement))
        throw "Colorful.js: couldn't find canvas#screen element.";
    gl = canvas.getContext("webgl2");
    //////////////////////////////////
    //       MAIN SHADER            //
    //////////////////////////////////
    p = compile_shader_program(gl, "vertex-shader", "fragment-shader", [], ["u_proj", "u_vertex_count", "u_texture", "u_texture_size"]);
    p.useProgram();
    width = window.innerWidth,
        height = window.innerHeight;
    ar = width / height;
    proj_mat = create_orthographic_matrix(-ar, ar, -1, 1, -1, 1);
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = width.toString();
    canvas.style.height = height.toString();
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    grid = new ColorfulGrid(side_length, new Uint8Array([0, 0, 0, 255]));
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
    gl.uniform1ui(p.uniforms["u_vertex_count"], vertex_count);
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
    const mask_vao = gl.createVertexArray();
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
    canvas.onclick = (e) => {
        const rect = canvas.getBoundingClientRect(), pixelX = Math.floor((e.clientX - rect.left) * width / rect.width), pixelY = Math.floor((rect.bottom - e.clientY) * height / rect.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, mask_fbo);
        gl.viewport(0, 0, width, height);
        gl.clearBufferuiv(gl.COLOR, 0, new Uint32Array([0, 0, 0, 0]));
        mask_p.useProgram();
        gl.uniformMatrix4fv(mask_p.uniforms["u_proj"], false, proj_mat);
        gl.bindVertexArray(mask_vao);
        gl.drawArrays(gl.TRIANGLES, 0, vertex_count);
        const pixel_data = new Uint32Array(1);
        gl.readPixels(pixelX, pixelY, 1, 1, gl.RED_INTEGER, gl.UNSIGNED_INT, pixel_data);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const id = pixel_data[0];
        if (id === 0)
            return;
        wave_start(id);
    };
    draw();
};
function update_viewport() {
    let _width = window.innerWidth, _height = window.innerHeight;
    if (_width !== width || _height !== height) {
        width = _width;
        height = _height;
        canvas.width = _width;
        canvas.height = _height;
        canvas.style.width = _width.toString();
        canvas.style.height = _height.toString();
        gl.bindTexture(gl.TEXTURE_2D, mask_texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32UI, width, height, 0, gl.RED_INTEGER, gl.UNSIGNED_INT, null);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        ar = _width / _height;
        proj_mat = create_orthographic_matrix(-ar, ar, -1, 1, -1, 1);
        p.useProgram();
        gl.uniformMatrix4fv(p.uniforms["u_proj"], false, proj_mat);
        mask_p.useProgram();
        gl.uniformMatrix4fv(mask_p["u_proj"], false, proj_mat);
    }
}
window.onresize = update_viewport;
function draw() {
    p.useProgram();
    gl.bindVertexArray(vao);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, color_texture);
    gl.drawArrays(gl.TRIANGLES, 0, vertex_count);
    requestAnimationFrame(draw);
}
let wave_id = 0, last_palette_color = -1;
function wave_start(id, color_packed, color, fcolor) {
    grid.adj_graph[id].state = ++wave_id;
    if (color_packed === undefined) {
        last_palette_color = ++last_palette_color % palette_size;
        color = palette[last_palette_color];
        fcolor = new Float32Array([
            color[0] / 255, color[1] / 255, color[2] / 255
        ]);
        // fcolor = new Float32Array([Math.random(),Math.random(),Math.random()]);
        // color = new Uint8Array([
        //     Math.floor(fcolor[0]*256),
        //     Math.floor(fcolor[1]*256),
        //     Math.floor(fcolor[2]*256),
        //     255
        // ]);
        color_packed = packUint8(color);
    }
    grid.texture_u32view[id] = color_packed;
    gl.bindTexture(gl.TEXTURE_2D, color_texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, grid.texture_size, grid.texture_size, gl.RGBA, gl.UNSIGNED_BYTE, grid.texture);
    setTimeout(wave_propagate, wave_delay, grid.adj_graph[id].next, wave_id, color_packed, color, fcolor, 0);
}
function wave_propagate(ids, state, color_packed, color, fcolor, depth) {
    const collected = new Set(), new_wave = new Set();
    let factor = blend_value;
    if (wave_decay < 1)
        factor *= wave_decay ** Math.max(depth - decay_min_radius - 1, 0);
    for (const node of ids) {
        if (node.state > state) {
            ids.delete(node);
            continue;
        }
        if (Math.random() <= new_wave_p)
            new_wave.add(node);
        node.state = state;
        let avg_adj_col = [0, 0, 0];
        for (const next of node.next) {
            const offset = next.id * 4;
            avg_adj_col[0] += grid.texture[offset];
            avg_adj_col[1] += grid.texture[offset + 1];
            avg_adj_col[2] += grid.texture[offset + 2];
            if (ids.has(next) || next.state >= state)
                continue;
            collected.add(next);
        }
        const inv_adj_count = 1 / node.next.size;
        avg_adj_col[0] *= inv_adj_count;
        avg_adj_col[1] *= inv_adj_count;
        avg_adj_col[2] *= inv_adj_count;
        if (factor > 0) {
            const _1_p = 1 - factor, p = factor;
            grid.texture_u32view[node.id] = packUint8(new Uint8Array([
                Math.floor(avg_adj_col[0] * _1_p + color[0] * p),
                Math.floor(avg_adj_col[1] * _1_p + color[1] * p),
                Math.floor(avg_adj_col[2] * _1_p + color[2] * p),
                255
            ]));
        }
        else if (factor >= 1)
            grid.texture_u32view[node.id] = color_packed;
        else {
            grid.texture_u32view[node.id] = packUint8(new Uint8Array([
                Math.floor(avg_adj_col[0]),
                Math.floor(avg_adj_col[1]),
                Math.floor(avg_adj_col[2]),
                255
            ]));
        }
    }
    gl.bindTexture(gl.TEXTURE_2D, color_texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, grid.texture_size, grid.texture_size, gl.RGBA, gl.UNSIGNED_BYTE, grid.texture);
    for (const new_start of new_wave) {
        const offset = new_start.id * 4;
        let new_color = new Uint8Array([
            grid.texture[offset],
            grid.texture[offset + 1],
            grid.texture[offset + 2],
            255
        ]), new_color_packed = grid.texture_u32view[new_start.id], new_fcolor = new Float32Array([
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
            new_color = undefined;
            new_color_packed = undefined;
            new_fcolor = undefined;
        }
        setTimeout(wave_start, new_wave_delay, new_start.id, new_color_packed, new_color, new_fcolor);
    }
    if (collected.size === 0)
        return;
    setTimeout(wave_propagate, wave_delay, collected, state, color_packed, color, fcolor, depth + 1);
}
