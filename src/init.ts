let gl: WebGL2RenderingContext,
    /** grid shader program. */
    p: shader_program,
    /** grid vertex mask shader program. */
    mask_p: shader_program,
    state_p: shader_program,
    grid: ColorfulGrid,
    mask_texture:WebGLTexture,
    mask_fbo:WebGLFramebuffer,
    state_fbo0:WebGLFramebuffer,
    state_fbo1:WebGLFramebuffer,
    /** camera (orthographic) projection matrix. */
    view_proj_mat:Float32Array,
    /** window.innerWidth */
    width:number,
    /** window.innerHeight */
    height:number,
    /** grid vertex array object. */
    vao:WebGLVertexArrayObject,
    color_texture:WebGLTexture,
    hover_texture:WebGLTexture,
    /** mask grid vertex array object. */
    mask_vao:WebGLVertexArrayObject,
    /** state grid vertex array object. */
    state_vao:WebGLVertexArrayObject,
    state_weights_0:WebGLTexture,
    wcolor_dist_0:WebGLTexture,
    state_weights_1:WebGLTexture,
    wcolor_dist_1:WebGLTexture,
    state_read_index: number,
    hovered_buffer: WebGLBuffer,
    /** grid.vertex_count */
    vertex_count: number,
    /** used to asynchronously read from gpu without cpu stalls. */
    pbos = [] as WebGLBuffer[],
    syncs = [] as (WebGLSync|null)[],
    pbo_count = 3,
    pbo_write_index = 0;

    /** canvas DOM element (#screen). */
let canvas_el: HTMLCanvasElement,
    /** color picker DOM element (#color-picker). */
    color_picker_el: HTMLElement,
    /** info curtain DOM element (#menu) */
    menu_el: HTMLElement,
    /** esc button DOM element (#esc-button). */
    esc_button_el: HTMLElement,
    /** updated in update_viewport */
    canvas_rect: DOMRect;

const camera = {
    x: 0,
    y: 0,
    scale: 1,
    /** inner window aspect ratio. */
    ar: 0,
    min_coord: -0.5,
    max_coord: 0.5,
    min_scale: 0.0005,
    max_scale: 2,
    /** used for mouse movement scaling to properly move the camera,
     * recalculated both in update_viewport and in w_wheel */
    units_per_pixel_x: 0,
    units_per_pixel_y: 0
}

/** event called by window.onload */
function init() {
    canvas_el = document.getElementById("screen") as HTMLCanvasElement;
    if (!(canvas_el instanceof HTMLCanvasElement))
        throw "Colorful.js: couldn't find 'canvas#screen' element.";

    color_picker_el = document.getElementById("color-picker") as HTMLElement;
    if (color_picker_el === null)
        throw "Colorful.js: couldn't find '#color-picker' element.";

    menu_el = document.getElementById("menu") as HTMLElement;
    if (menu_el === null)
        throw "Colorful.js: couldn't find '#menu' element.";

    esc_button_el = document.getElementById("esc-button") as HTMLElement;
    if (esc_button_el === null)
        throw "Colorful.js: couldn't find '#esc-button' element.";
    esc_button_el.onclick = dom_toggle_menu;

    gl = canvas_el.getContext("webgl2") as WebGL2RenderingContext;

    const ext = gl.getExtension("EXT_color_buffer_float");
    if (!ext) throw "EXT_color_buffer_float is not supported on this hardware";

    dom_update_color_picker();

    //////////////////////////////////
    //         MAIN SHADER          //
    //////////////////////////////////

    canvas_rect = canvas_el.getBoundingClientRect();
    camera.units_per_pixel_x = 2 * camera.scale / canvas_rect.width;        
    camera.units_per_pixel_y = 2 * camera.scale / canvas_rect.height;
    
    width = window.innerWidth;
    height = window.innerHeight;
    
    camera.ar = width / height;
    view_proj_mat =
        create_view_projection_matrix(camera.x, camera.y, camera.scale, camera.ar);

    canvas_el.width = width;
    canvas_el.height = height;

    if (gpu) {
        p = new shader_program("main", gpu_vert, gpu_frag, [
            new uniform("!u_view_proj", GL_MAT4x4, U_INIT, () => view_proj_mat),
            new uniform("u_texture", GL_TEXTURE, U_INIT, 0),
            new uniform("u_state_weights", GL_TEXTURE, U_INIT, 1),
            new uniform("u_wcolor_dist", GL_TEXTURE, U_INIT, 2),
            new uniform("u_hcolor", GL_TEXTURE, U_INIT, 3),
            // new uniform("u_blend_value", GL_FLOAT, U_INIT, blend_value),
            // new uniform("u_wave_decay", GL_FLOAT, U_INIT, wave_decay),
            // new uniform("u_decayt_min_radius", GL_FLOAT, U_INIT, decay_min_radius),
        ]);
    }
    else {
        p = new shader_program("main", cpu_vert, cpu_frag, [
            new uniform("!u_view_proj", GL_MAT4x4, U_INIT, () => view_proj_mat),
            new uniform("!u_texture", GL_TEXTURE, U_INIT, 0),
        ]);
    }

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

    grid = new ColorfulGrid(side_length, gpu, grid_bg, brush_size);

    vertex_count = grid.vertex_count;

    //////////////////////////////////
    //       MAIN SHADER            //
    //////////////////////////////////

    vao = create_vertex_array();
    const pos_buffer = create_buffer_vec2(grid.mesh, 0),
          id_buffer = create_buffer_uint32(grid.ids, 1);
    create_buffer_vec2(grid.uvs, 2);           // uv_buffer
    if (gpu) {
        create_buffer_vec2(grid.adj_uvs_1, 3); // adj1_buffer
        create_buffer_vec2(grid.adj_uvs_2, 4); // adj2_buffer
        create_buffer_vec2(grid.adj_uvs_3, 5); // adj3_buffer
        hovered_buffer = create_dyn_buffer_uint8(grid.hovered, 6);
    }

    color_texture = create_RGBA_texture(grid.texture_size, grid.texture);
    hover_texture = create_RGBA_texture(grid.texture_size, grid.hover_texture);

    //////////////////////////////////
    //       MASK SHADER            //
    //////////////////////////////////

    mask_p = new shader_program("mask", mask_vert, mask_frag, [
        new uniform("!u_view_proj", GL_MAT4x4, 0, () => view_proj_mat),
    ]);
    
    mask_vao = create_vertex_array();

    bind_vec2_attr(pos_buffer, 0);
    bind_uint32_attr(id_buffer, 1);

    mask_texture = create_R32UI_texture(width, height);

    mask_fbo = create_frame_buffer(mask_texture);

    //////////////////////////////////
    //       STATE SHADER           //
    //////////////////////////////////

    if (gpu) {
        state_p = new shader_program("state", state_vert, state_frag, [
            new uniform("u_state_weights", GL_TEXTURE, U_INIT, 0),
            new uniform("u_wcolor_dist", GL_TEXTURE, U_INIT, 1),
            new uniform("u_delta_time", GL_FLOAT, U_UPDATE | U_INIT, () => renderer.delta_time),
            // new uniform("u_wave_decay", GL_FLOAT, U_INIT, wave_decay),
            // new uniform("u_decay_min_radius", GL_FLOAT, U_INIT, decay_min_radius),
            new uniform("u_state_rate", GL_FLOAT, U_UPDATE | U_INIT, () => rate_from_ms(state_rate), (v:number) => not_saturated(ms_from_rate(v))),
            new uniform("u_weight_decay", GL_FLOAT, U_UPDATE | U_INIT, () => rate_from_ms(weight_decay), (v:number) => not_saturated(ms_from_rate(v))),
            new uniform("u_diffusion_rate", GL_FLOAT, U_UPDATE | U_INIT, () => rate_from_ms(diffusion_rate), (v:number) => not_saturated(ms_from_rate(v))),
        ]);

        state_vao = create_vertex_array();
        create_buffer_uint32(grid.cell_ids, 0);
        create_buffer_vec2(grid.cell_uvs, 1);
        create_buffer_vec2(grid.cell_adj_uvs_1, 2);
        create_buffer_vec2(grid.cell_adj_uvs_2, 3);
        create_buffer_vec2(grid.cell_adj_uvs_3, 4);

        state_weights_0 = create_RGBA32F_texture(grid.texture_size, grid.state_weights);
        wcolor_dist_0 = create_RGBA32F_texture(grid.texture_size, grid.wcolor_dist);
        state_fbo0 = create_frame_buffer2(state_weights_0, wcolor_dist_0);

        state_weights_1 = create_RGBA32F_texture(grid.texture_size, grid.state_weights);
        wcolor_dist_1 = create_RGBA32F_texture(grid.texture_size, grid.wcolor_dist);
        state_fbo1 = create_frame_buffer2(state_weights_1, wcolor_dist_1);

        state_read_index = 0;
    }

    //////////////////////////////////
    //       MASK SHADER PBOS       //
    //////////////////////////////////

    for (let i=0; i<pbo_count; ++i) {
        const pbo = gl.createBuffer();
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
        gl.bufferData(gl.PIXEL_PACK_BUFFER, 4, gl.STREAM_READ);
        pbos.push(pbo);
        syncs.push(null);
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

    canvas_el.onmouseleave = c_mouseleave;
    canvas_el.onmousedown = c_mousedown;
    window.onmousemove = w_mousemove;
    color_picker_el.onmousemove = w_mousemove;
    window.onmouseup = w_mouseup;
    canvas_el.oncontextmenu = (e:Event) => {
        e.preventDefault();
    };

    draw(0);
}