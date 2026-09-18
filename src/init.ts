let gl: WebGL2RenderingContext,
    /** grid shader program. */
    p: ReturnType<typeof compile_and_use_shader_program>,
    /** grid vertex mask shader program. */
    mask_p: ReturnType<typeof compile_and_use_shader_program>,
    state_p: ReturnType<typeof compile_and_use_shader_program>,
    grid: ColorfulGrid,
    mask_texture:WebGLTexture,
    mask_fbo:WebGLFramebuffer,
    state_fbo0:WebGLFramebuffer,
    state_fbo1:WebGLFramebuffer,
    /** inner window aspect ratio. */
    ar:number,
    /** camera (orthographic) projection matrix. */
    view_proj_mat:Float32Array,
    /** window.innerWidth */
    width:number,
    /** window.innerHeight */
    height:number,
    /** grid vertex array object. */
    vao:WebGLVertexArrayObject,
    color_texture:WebGLTexture,
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
    canvas_rect: DOMRect,
    /** used for mouse movement scaling to properly move the camera,
     * recalculated both in update_viewport and in w_wheel */
    units_per_pixel_x: number,
    units_per_pixel_y: number;

let camera_x = 0,
    camera_y = 0,

    camera_coord_min = -0.5,
    camera_coord_max = 0.5,

    camera_scale_min = 0.0005,
    camera_scale = 1,
    camera_scale_max = 2;

let process_stroke: (hovered:number) => void,
    remove_highlights: () => void,
    process_queued_strokes: () => void,
    wave_start: (ids:number|Set<number>, color_data?:color_data,_wave_id?:number) => void,
    fill_grid: (color?:color_data) => void,
    inward_wave: () => void;

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
    units_per_pixel_x = 2 * camera_scale / canvas_rect.width;        
    units_per_pixel_y = 2 * camera_scale / canvas_rect.height;
    
    width = window.innerWidth;
    height = window.innerHeight;
    
    ar = width / height;
    view_proj_mat =
        create_view_projection_matrix(camera_x, camera_y, camera_scale, ar);

    canvas_el.width = width;
    canvas_el.height = height;

    if (gpu) {
        p = compile_and_use_shader_program(gl, "gpu-vert", "gpu-frag", [
            new uniform("!u_view_proj", GL_MAT4x4, NO_UPDATE, () => view_proj_mat),
            new uniform("u_texture", GL_TEXTURE, NO_UPDATE, () => 0),
            new uniform("u_state_weights", GL_TEXTURE, NO_UPDATE, () => 1),
            new uniform("u_wcolor_dist", GL_TEXTURE, NO_UPDATE, () => 2),
            new uniform("u_blend_value", GL_FLOAT, UPDATE, () => blend_value),
            new uniform("u_wave_decay", GL_FLOAT, UPDATE, () => wave_decay),
            new uniform("u_decay_min_radius", GL_FLOAT, UPDATE, () => decay_min_radius),
            new uniform("u_max_weight", GL_FLOAT, UPDATE, () => max_weight),
            new uniform("u_state_ramp_width", GL_FLOAT, NO_UPDATE, () => 20.0)
        ]);
    }
    else {
        p = compile_and_use_shader_program(gl, "cpu-vert", "cpu-frag", [
            new uniform("!u_view_proj", GL_MAT4x4, NO_UPDATE, () => view_proj_mat),
            new uniform("!u_texture", GL_TEXTURE, NO_UPDATE, () => 0),
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
   
    //////////////////////////////////
    //       MASK SHADER            //
    //////////////////////////////////

    mask_p = compile_and_use_shader_program(gl, "mask-vert", "mask-frag", [
        new uniform("!u_view_proj", GL_MAT4x4, NO_UPDATE, () => view_proj_mat),
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
        state_p = compile_and_use_shader_program(gl, "state-vert", "state-frag", [
            new uniform("u_state_weights", GL_TEXTURE, NO_UPDATE, () => 0),
            new uniform("u_wcolor_dist", GL_TEXTURE, NO_UPDATE, () => 1),
            new uniform("u_delta_time", GL_FLOAT, UPDATE, () => delta_time),
            new uniform("u_max_weight", GL_FLOAT, UPDATE, () => max_weight),
            new uniform("u_wave_decay", GL_FLOAT, UPDATE, () => wave_decay),
            new uniform("u_decay_min_radius", GL_FLOAT, UPDATE, () => decay_min_radius),
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

    if (gpu) {
        process_stroke = gpu_process_stroke;
        remove_highlights = gpu_remove_highlights;
        process_queued_strokes = gpu_process_queued_strokes;
        wave_start = gpu_wave_start;
        fill_grid = gpu_fill_grid;
        inward_wave = gpu_inward_wave;
    }
    else {
        process_stroke = cpu_process_stroke;
        remove_highlights = cpu_remove_highlights;
        process_queued_strokes = cpu_process_queued_strokes;
        wave_start = cpu_wave_start;
        fill_grid = cpu_fill_grid;
        inward_wave = cpu_inward_wave;
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