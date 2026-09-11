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
    wave_queue = new Set() as Set<number>;

window.onkeydown = (e:KeyboardEvent) => {
    if (e.key === "Shift") {
        shift_down = true;
    }
};

window.onkeyup = (e:KeyboardEvent) => {
    if (e.key === "Shift") {
        shift_down = false;
        let i = 0;
        for (const id of wave_queue) {
            setTimeout(wave_start, wave_delay * i++, id);
            wave_queue.delete(id);
        }
    }
};

const side_length = searchParams.getNumber("side_length", 32, 1),
      blend_value = searchParams.getNumber("blend_value", 0.008, 0,1),
      wave_delay = searchParams.getNumber("wave_delay", 20, 1),
      wave_decay = searchParams.getNumber("wave_decay", 0.99, 0,1),
      decay_min_radius = searchParams.getNumber("decay_min_radius", -2),
      new_wave_delay = searchParams.getNumber("new_wave_delay", 500, 1),
      new_wave_p = searchParams.getNumber("new_wave_p", 0.00015, 0,1),
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

window.history.replaceState({}, '',
    window.location.origin === "null" ? "" : window.location.origin
        + window.location.pathname
        + "?"
        + params.toString()
        + `&grid_bg=[${grid_bg}]`
);

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

canvas.onmouseleave = () => { mouse_down = false; hovered_id = undefined; }
canvas.onmousedown = (e:MouseEvent) => {
    if (mouse_down === true || e.button !== 0)
        return;

    palette_color = ++palette_color % palette_size;
    mouse_down = true;

    if (force_render_mask)
        return;

    const rect = canvas.getBoundingClientRect(),
          pixelX = Math.floor((e.clientX - rect.left) * width / rect.width),
          pixelY = Math.floor((rect.bottom - e.clientY) * height / rect.height);

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, mask_fbo);
    const pixel_data = new Uint32Array(1);
    gl.readPixels(
        pixelX, pixelY, 1, 1,
        gl.RED_INTEGER, gl.UNSIGNED_INT, pixel_data
    );
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);

    const hovered = pixel_data[0];
    if (hovered !== 0 && hovered !== hovered_id) {
        if (shift_down)
            wave_queue.add(hovered);
        else
            wave_start(hovered);
        hovered_id = hovered;
    }
}

canvas.onmousemove = (e:MouseEvent) => {
    if (mouse_down === false || force_render_mask)
        return;

    const rect = canvas.getBoundingClientRect(),
          pixelX = Math.floor((e.clientX - rect.left) * width / rect.width),
          pixelY = Math.floor((rect.bottom - e.clientY) * height / rect.height);

    gl.bindFramebuffer(gl.FRAMEBUFFER, mask_fbo);
    const pixel_data = new Uint32Array(1);
    gl.readPixels(
        pixelX, pixelY, 1, 1,
        gl.RED_INTEGER, gl.UNSIGNED_INT, pixel_data
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const hovered = pixel_data[0];
    if (hovered !== 0 && hovered !== hovered_id) {
        if (shift_down)
            wave_queue.add(hovered);
        else
            wave_start(hovered);
        hovered_id = hovered;
    }
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
        )

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
    p.useProgram();

    gl.bindVertexArray(vao);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, color_texture);
    gl.drawArrays(gl.TRIANGLES, 0, vertex_count);

    if (force_render_mask) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, mask_fbo);
        gl.viewport(0, 0, width, height);

        gl.clearBufferuiv(gl.COLOR, 0, new Uint32Array([0, 0, 0, 0]));

        mask_p.useProgram();
        gl.uniformMatrix4fv(mask_p.uniforms["u_proj"], false, proj_mat);

        gl.bindVertexArray(mask_vao);
        gl.drawArrays(gl.TRIANGLES, 0, vertex_count);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        force_render_mask = false;
    }

    requestAnimationFrame(draw);
}

let wave_id = 0,
    palette_color = -1;

function wave_start(
    id:number, color_packed?:number, color?:Uint8Array, fcolor?:Float32Array,
    _wave_id?:number
) {
    grid.adj_graph[id].state = _wave_id === undefined 
        ? ++wave_id
        : _wave_id;
    
    if (color_packed === undefined) {
        color = palette[palette_color];
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
    gl.texSubImage2D(
        gl.TEXTURE_2D, 0,
        0, 0,
        grid.texture_size, grid.texture_size,
        gl.RGBA, gl.UNSIGNED_BYTE, grid.texture
    );

    setTimeout(wave_propagate, wave_delay, 
        grid.adj_graph[id].next, wave_id, color_packed, color, fcolor, 0
    );
}

function wave_propagate(
    ids:Set<adj_node>, state:number, color_packed:number, color:Uint8Array,
    fcolor:Float32Array, depth:number
) {
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

        node.state = state;
        
        let avg_adj_col = [0, 0, 0];
        for (const next of node.next) {
            const offset = next.id*4;
            avg_adj_col[0] += grid.texture[offset];
            avg_adj_col[1] += grid.texture[offset+1];
            avg_adj_col[2] += grid.texture[offset+2];

            if (ids.has(next) || next.state >= state)
                continue;
            collected.add(next);
        }

        const inv_adj_count = 1 / node.next.size;
        avg_adj_col[0] *= inv_adj_count;
        avg_adj_col[1] *= inv_adj_count;
        avg_adj_col[2] *= inv_adj_count;

        if (factor > 0) {
            const _1_p = 1-factor,
                  p = factor;

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
    gl.texSubImage2D(
        gl.TEXTURE_2D, 0,
        0, 0,
        grid.texture_size, grid.texture_size,
        gl.RGBA, gl.UNSIGNED_BYTE, grid.texture
    );

    for (const new_start of new_wave) {
        const offset = new_start.id*4;
        
        let new_color = new Uint8Array([
                grid.texture[offset],
                grid.texture[offset+1],
                grid.texture[offset+2],
                255
            ]),
            new_color_packed = grid.texture_u32view[new_start.id],
            new_fcolor = new Float32Array([
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
        
        setTimeout(wave_start, new_wave_delay, 
            new_start.id, new_color_packed, new_color, new_fcolor, ++wave_id
        );
    }

    if (collected.size === 0)
        return;

    setTimeout(
        wave_propagate, wave_delay, collected,
        state, color_packed, color, fcolor, depth+1
    );
}