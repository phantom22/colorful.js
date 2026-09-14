let gl: WebGL2RenderingContext,
    /** grid shader program. */
    p: ReturnType<typeof compile_shader_program>,
    /** grid vertex mask shader program. */
    mask_p: ReturnType<typeof compile_shader_program>,
    grid: ColorfulGrid,
    mask_texture:WebGLTexture,
    mask_fbo:WebGLFramebuffer,
    /** inner window aspect ratio. */
    ar:number,
    /** camera (orthographic) projection matrix. */
    proj_mat:Float32Array,
    /** window.innerWidth */
    width:number,
    /** window.innerHeight */
    height:number,
    /** grid vertex array object. */
    vao:WebGLVertexArrayObject,
    color_texture:WebGLTexture,
    /** mask grid vertex array object. */
    mask_vao:WebGLVertexArrayObject,
    /** grid.vertex_count */
    vertex_count: number;

    /** canvas DOM element (#screen). */
let canvas_el: HTMLCanvasElement,
    /** color picker DOM element (#palette-grid). */
    palette_grid_el: HTMLElement,
    /** info curtain DOM element (#info-curtain) */
    curtain_el: HTMLElement,
    /** esc button DOM element (#esc-button). */
    esc_button_el: HTMLElement;

/** event called by window.onload */
function init() {
    canvas_el = document.getElementById("screen") as HTMLCanvasElement;
    if (!(canvas_el instanceof HTMLCanvasElement))
        throw "Colorful.js: couldn't find 'canvas#screen' element.";

    palette_grid_el = document.getElementById("palette-grid") as HTMLElement;
    if (palette_grid_el === null)
        throw "Colorful.js: couldn't find '#palette-grid' element.";

    curtain_el = document.getElementById("info-curtain") as HTMLElement;
    if (curtain_el === null)
        throw "Colorful.js: couldn't find '#info-curtain' element.";

    esc_button_el = document.getElementById("esc-button") as HTMLElement;
    if (esc_button_el === null)
        throw "Colorful.js: couldn't find '#esc-button' element.";
    esc_button_el.onclick = toggle_info;

    gl = canvas_el.getContext("webgl2") as WebGL2RenderingContext;

    update_palette_picker();

    //////////////////////////////////
    //       MAIN SHADER            //
    //////////////////////////////////

    p = compile_shader_program(gl, "vertex-shader", "fragment-shader",
        [],
        ["u_proj","u_texture","u_texture_size"]
    );
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

    canvas_el.onmouseleave = c_mouseleave;
    canvas_el.onmousedown = c_mousedown;
    canvas_el.onmousemove = c_mousemove;
    canvas_el.onmouseup = c_mouseup;

    draw();
}