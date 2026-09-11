let gl: WebGL2RenderingContext,
    canvas: HTMLCanvasElement,
    p: ReturnType<typeof compile_shader_program>,
    mask_p: ReturnType<typeof compile_shader_program>,
    grid: ColorfulGrid,
    vertex_count: number,
    mask_texture:WebGLTexture,
    mask_fbo:WebGLFramebuffer,
    ar:number,
    proj_mat:Float32Array,
    width:number,
    height:number,
    vao:WebGLVertexArrayObject,
    vertex_color_data:Uint8Array,
    color_texture:WebGLTexture,
    mask_vao:WebGLVertexArrayObject,
    force_render_mask = true,
    mouse_down = false,
    shift_down = false,
    hovered_id = undefined as undefined|number,
    wave_queue = new Set() as Set<number>,
    texture_is_dirty = false,
    frame = 0,
    last_mouse_sample_frame = -1,
    mouse_x: number,
    mouse_y: number,
    pixel_data = new Uint32Array(1),
    request_sample = false,
    request_clear = false,
    queued_wave_count = 0,
    prevent_waves_last_id = 0;

window.onkeydown = (e:KeyboardEvent) => {
    if (e.key === "Shift") {
        shift_down = true;
    }
};

window.onkeyup = (e:KeyboardEvent) => {
    if (e.key === "Shift") {
        shift_down = false;
        wave_start(wave_queue);
        wave_queue.clear();
    }
    else if (e.key === "p")
        ring_wave();
    else if (e.key === "c")
        request_clear = true;
};

const side_length = searchParams.getNumber("side_length", 32, 1),
      blend_value = searchParams.getNumber("blend_value", 0.008, 0,1),
      wave_delay = searchParams.getNumber("wave_delay", 30, 1),
      wave_decay = searchParams.getNumber("wave_decay", 0.99, 0,1),
      decay_min_radius = searchParams.getNumber("decay_min_radius", -2),
      new_wave_delay = searchParams.getNumber("new_wave_delay", 500, 1),
      new_wave_p = searchParams.getNumber("new_wave_p", 0.0002, 0,1),
      new_color_p = searchParams.getNumber("new_color_p", 0.1, 0,1),
      new_color_compl_p = searchParams.getNumber("new_color_compl_p", 0.5, 0,1),
      grid_bg = searchParams.getUint8Color("grid_bg"),
      params = new URLSearchParams([
        ["side_length", `${side_length}`],
        ["blend_value",`${blend_value}`],
        ["wave_delay", `${wave_delay}`],
        ["wave_decay", `${wave_decay}`],
        ["decay_min_radius", `${decay_min_radius}`],
        ["new_wave_delay", `${new_wave_delay}`],
        ["new_wave_p", `${new_wave_p}`],
        ["new_color_p", `${new_color_p}`],
        ["new_color_compl_p", `${new_color_compl_p}`]
      ]),
      palette = [
        new Uint8Array([255, 107, 107]), // coral red
        new Uint8Array([ 78, 205, 196]), // mint cyan
        new Uint8Array([255, 230, 109]), // pastel yellow
        new Uint8Array([ 26,  83,  92]), // deep teal
        new Uint8Array([255, 159,  28]), // bright amber
        new Uint8Array([ 43,  45,  66]), // midnight indigo
        new Uint8Array([239,  71, 111]), // neon raspberry
        new Uint8Array([  6, 214, 160]), // emerald seafoam
        new Uint8Array([ 17, 138, 178]), // electric cerulean
        new Uint8Array([247, 208, 138]), // warm gold
        new Uint8Array([114,   9, 183]), // deep violet
        new Uint8Array([247,  37, 133]), // vivid magenta
        new Uint8Array([ 76, 201, 240]), // sky cyan
        new Uint8Array([255, 123,   0]), // tangelo orange
        new Uint8Array([112, 224,   0]), // electric lime
        new Uint8Array([241, 250, 238]), // off-white highlight
      ],
      palette_size = palette.length;

window.history.replaceState({}, '', `?${params.toString()}&grid_bg=[${grid_bg}]`);

window.onload = () => {

canvas = document.getElementById("screen") as HTMLCanvasElement;
if (!(canvas instanceof HTMLCanvasElement))
    throw "Colorful.js: couldn't find canvas#screen element.";

gl = canvas.getContext("webgl2") as WebGL2RenderingContext;

//////////////////////////////////
//       MAIN SHADER            //
//////////////////////////////////

p = compile_shader_program(gl, "vertex-shader", "fragment-shader",
    [],
    ["u_proj","u_vertex_count","u_texture","u_texture_size"]
);
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
gl.uniform1ui(p.uniforms["u_vertex_count"], vertex_count);
gl.uniform1f(p.uniforms["u_texture_size"], grid.texture_size);
gl.uniform1i(p.uniforms["u_texture"], 0);

color_texture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, color_texture);

gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.RGBA8,
    grid.texture_size, grid.texture_size, 0,
    gl.RGBA, gl.UNSIGNED_BYTE, grid.texture
);

gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

//////////////////////////////////
//       MASK SHADER            //
//////////////////////////////////

mask_p = compile_shader_program(gl, "mask-vertex", "mask-fragment",
    [],
    ["u_proj"]
);
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

gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.R32UI,
    width, height, 0,
    gl.RED_INTEGER, gl.UNSIGNED_INT, null
);

gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

mask_fbo = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, mask_fbo);
gl.framebufferTexture2D(
    gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D, mask_texture, 0
)
gl.bindFramebuffer(gl.FRAMEBUFFER, null);

canvas.onmouseleave = () => { 
    mouse_down = false;
    hovered_id = undefined;
    if (wave_queue.size !== 0) {
        wave_start(wave_queue);
        wave_queue.clear();
    }
}
canvas.onmousedown = (e:MouseEvent) => {
    if (mouse_down === true || e.button !== 0 || last_mouse_sample_frame === frame)
        return;

    palette_color = ++palette_color % palette_size;
    mouse_down = true;

    if (force_render_mask)
        return;

    const rect = canvas.getBoundingClientRect();
    mouse_x = Math.floor((e.clientX - rect.left) * width / rect.width);
    mouse_y = Math.floor((rect.bottom - e.clientY) * height / rect.height);

    request_sample = true;
    last_mouse_sample_frame = frame;
}

canvas.onmousemove = (e:MouseEvent) => {
    if (mouse_down === false || force_render_mask || last_mouse_sample_frame === frame)
        return;

    const rect = canvas.getBoundingClientRect();
    mouse_x = Math.floor((e.clientX - rect.left) * width / rect.width);
    mouse_y = Math.floor((rect.bottom - e.clientY) * height / rect.height);

    request_sample = true;
    last_mouse_sample_frame = frame;
}

canvas.onmouseup = (e:MouseEvent) => {
    if (e.button !== 0)
        return;

    mouse_down = false;
    hovered_id = undefined;
}

canvas.onmouseleave = () => {
    mouse_down = false;
    hovered_id = undefined;
}

draw();

}

function update_viewport() {
    let _width = window.innerWidth,
        _height = window.innerHeight;

    if (_width !== width || _height !== height) {
        width = _width;
        height = _height;
        canvas.width = _width;
        canvas.height = _height;
        canvas.style.width = _width.toString();
        canvas.style.height = _height.toString();

        gl.bindTexture(gl.TEXTURE_2D, mask_texture);
        gl.texImage2D(
            gl.TEXTURE_2D, 0, gl.R32UI,
            width, height, 0,
            gl.RED_INTEGER, gl.UNSIGNED_INT, null
        );

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
        hovered_id = undefined;
    }
}

window.onresize = update_viewport;

function draw() {
    ++frame;

    if (request_clear) {
        const clear_color = packUint8(new Uint8Array([0, 0, 0, 255]));
        for (let i=0; i<grid.adj_graph.length; ++i)
            grid.texture_u32view[i] = clear_color;
        prevent_waves_last_id = wave_id + queued_wave_count;
        wave_id = prevent_waves_last_id + 1;
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

            gl.readPixels(
                mouse_x, mouse_y, 1, 1,
                gl.RED_INTEGER, gl.UNSIGNED_INT, pixel_data
            );

            const hovered = pixel_data[0];
            if (hovered !== 0 && hovered !== hovered_id) {
                if (shift_down) {
                    if (!wave_queue.has(hovered)) {
                        wave_queue.add(hovered);
                        const offset = hovered*4;
                        grid.texture[offset] = Math.min(Math.floor(grid.texture[offset] + 255) * 0.5, 255);
                        grid.texture[offset+1] = Math.min(Math.floor(grid.texture[offset+1] + 255) * 0.5, 255);
                        grid.texture[offset+2] = Math.min(Math.floor(grid.texture[offset+2] + 255) * 0.5, 255);
                    }

                    for (const adj of grid.adj_graph[hovered].next) {
                        const id = adj.id,
                            offset = id*4;
                        if (wave_queue.has(id))
                            continue;

                        wave_queue.add(id);
                        grid.texture[offset] = Math.min(Math.floor(grid.texture[offset] + 255) * 0.5, 255);
                        grid.texture[offset+1] = Math.min(Math.floor(grid.texture[offset+1] + 255) * 0.5, 255);
                        grid.texture[offset+2] = Math.min(Math.floor(grid.texture[offset+2] + 255) * 0.5, 255);
                    }

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
            request_sample = false;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    p.useProgram();
    if (texture_is_dirty) {
        gl.bindTexture(gl.TEXTURE_2D, color_texture);
        gl.texSubImage2D(
            gl.TEXTURE_2D, 0,
            0, 0,
            grid.texture_size, grid.texture_size,
            gl.RGBA, gl.UNSIGNED_BYTE, grid.texture
        );
        texture_is_dirty = false;
    }

    gl.bindVertexArray(vao);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, color_texture);
    gl.drawArrays(gl.TRIANGLES, 0, vertex_count);

    requestAnimationFrame(draw);
}

let wave_id = 0,
    palette_color = -1;

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

function ring_wave() {
    const from = 6*(side_length-2)**2+1,
          to = 6*side_length**2,
          mod = 5,
          m = from % mod;
    const s = new Set() as Set<number>;
    ++palette_color;
    for (let i=from; i<to; ++i) {
        if (i%mod === m) {
            s.add(i);
            wave_start(s);
            s.clear();
        }
    }
    wave_start(s);
}