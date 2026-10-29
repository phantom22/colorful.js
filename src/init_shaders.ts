let gl: WebGL2RenderingContext;

let vao:WebGLVertexArrayObject;

let quad_p: shader_program<[uniform<"tex_source", 7>, uniform<"tex_obstacles", 7>, uniform<"source_kind", 4>, uniform<"palette_type", 4>, uniform<"blur_type", 4>, uniform<"reference_value", 5>, uniform<"value_rescale_threshold", 5>, uniform<"rescale_factor", 5>]>,
    checkboard_fill_p: shader_program<[uniform<"color_a", 9>, uniform<"color_b", 9>, uniform<"dims", 8>]>,
    curl_velocity_fill_p: shader_program<[uniform<"scale", 5>, uniform<"amp", 5>, uniform<"div_mix", 5>, uniform<"seed", 5>]>,
    splat_p: shader_program<[uniform<"tex_source", 7>, uniform<"tex_obstacles", 7>, uniform<"point", 8>, uniform<"prev", 8>, uniform<"value", 10>, uniform<"brush_radius", 5>, uniform<"brush_strength", 5>, uniform<"additive", 5>]>,
    obstacle_splat_p: shader_program<[uniform<"point", 8>, uniform<"prev", 8>, uniform<"brush_radius", 5>, uniform<"outline_width", 5>, uniform<"erase", 5>]>,
    forcefield_p: shader_program<[uniform<"tex_velocity", 7>, uniform<"tex_obstacles", 7>, uniform<"center_worldpos", 8>, uniform<"window_width", 5>, uniform<"force_strength", 5>, uniform<"dt", 5>]>,
    velocity_advect_p: shader_program<[uniform<"tex_velocity", 7>, uniform<"tex_obstacles", 7>, uniform<"dt", 5>, uniform<"dissipation", 5>]>,
    dye_advect_p: shader_program<[uniform<"tex_velocity", 7>, uniform<"tex_dye", 7>, uniform<"tex_obstacles", 7>, uniform<"dt", 5>, uniform<"dissipation", 5>]>,
    curl_p: shader_program<[uniform<"tex_velocity", 7>, uniform<"tex_obstacles", 7>]>,
    blur_p: shader_program<[uniform<"tex_source", 7>]>,
    vorticity_confinement_p: shader_program<[uniform<"tex_velocity", 7>, uniform<"tex_curl", 7>, uniform<"tex_obstacles", 7>, uniform<"dt", 5>, uniform<"curl_strength", 5>, uniform<"max_velocity", 5>, uniform<"max_force", 5>]>,
    divergence_p: shader_program<[uniform<"tex_velocity", 7>, uniform<"tex_obstacles", 7>]>,
    pressure_jacobi_p: shader_program<[uniform<"tex_pressure", 7>, uniform<"tex_divergence", 7>, uniform<"tex_obstacles", 7>]>,
    gradient_subtract_p: shader_program<[uniform<"tex_pressure", 7>, uniform<"tex_velocity", 7>, uniform<"tex_obstacles", 7>]>,
    rescale_p: shader_program<[uniform<"tex_source", 7>, uniform<"value", 5>]>,
    // reduction_pass_p: shader_program,
    diffusion_pass_p: shader_program<[uniform<"tex_dye", 7>, uniform<"tex_curl", 7>, uniform<"tex_velocity", 7>, uniform<"tex_obstacles", 7>, uniform<"dt", 5>, uniform<"base_diffusion", 5>, uniform<"curl_diffusion", 5>, uniform<"velocity_diffusion", 5>, uniform<"max_diffusion", 5>, uniform<"diffusion_radius", 5>]>;

let canvas_el: HTMLCanvasElement,
    /** updated in update_viewport */
    canvas_rect: DOMRect;

function recompile_forcefield(get_velocity:string): null | string {
    try {
        let t = new shader_program("forcefield_tmp", quad_vert, sh_forcefield(get_velocity).trim(), [
            new uniform("tex_velocity", GL_TEXTURE, U_INIT, 0),
            new uniform("tex_obstacles", GL_TEXTURE, U_INIT, 1),
            new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders),
            new uniform("center_worldpos", GL_VEC2, U_UPDATE, () => force.center),
            new uniform("window_width", GL_FLOAT, U_UPDATE, () => force.span),
            new uniform("force_strength", GL_FLOAT, U_UPDATE, () => force.strength),
            new uniform("dt", GL_FLOAT, U_UPDATE, renderer.fixed_dt_getter),
            new uniform("replace", GL_FLOAT, U_UPDATE, () => mouse.m2_down ? 1.0 : 0.0),
            new uniform("relax", GL_FLOAT, U_UPDATE, () => force.pure_vector_field ? force.relaxation : -1.0)
        ]);
        const { program, vertex, fragment } = shaders["forcefield"];
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        gl.deleteProgram(program);
        for (const u in t.uniforms) {
            // @ts-ignore
            t.uniforms[u].owner = "forcefield";
        }
        shaders["forcefield"] = t;
        delete shaders["forcefield_tmp"];
        forcefield_p = t;
        return null;
    }
    catch(e) {
        return e as string;
    }
}

function init_shaders() {
    canvas_el = document.getElementById("screen") as HTMLCanvasElement;
    if (!(canvas_el instanceof HTMLCanvasElement))
        throw "Colorful.js: couldn't find 'canvas#screen' element.";

    gl = canvas_el.getContext("webgl2") as WebGL2RenderingContext;
    if (gl === null)
        throw "Colorful.js: couldn't get WebGL2RenderingContext.";

    const ext1 = gl.getExtension("EXT_color_buffer_float");
    if (!ext1) throw "EXT_color_buffer_float is not supported on this hardware";

    update_viewport();
    const quad = new Float32Array([
        0, 1, 1, 0, 0, 0,
        0, 1, 1, 1, 1, 0,
    ]);

    quad_p = new shader_program("quad", quad_vert, quad_frag, [
        new uniform("tex_source", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_obstacles", GL_TEXTURE, U_INIT, 1),
        new uniform("source_kind", GL_INT),
        new uniform("palette_type", GL_INT),
        new uniform("blur_type", GL_INT),
        new uniform("reference_value", GL_FLOAT),
        new uniform("value_rescale_threshold", GL_FLOAT),
        new uniform("rescale_factor", GL_FLOAT),
    ]);

    vao = create_vertex_array();
    create_buffer_vec2(quad, 0);

    checkboard_fill_p = new shader_program("checkerboard_fill", quad_vert, sh_checkerboard_fill, [
        new uniform("dims", GL_VEC2, U_INIT, [4,4]),
        new uniform("color_a", GL_VEC3, U_UPDATE, force.color_a_getter),
        new uniform("color_b", GL_VEC3, U_UPDATE, force.color_b_getter)
    ]);

    curl_velocity_fill_p = new shader_program("curl_velocity_fill", quad_vert, sh_curl_velocity_noise, [
        new uniform("scale", GL_FLOAT),
        new uniform("amp", GL_FLOAT),
        new uniform("div_mix", GL_FLOAT),
        new uniform("seed", GL_FLOAT),
    ]);

    splat_p = new shader_program("splat", quad_vert, sh_splat, [
        new uniform("tex_source", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_obstacles", GL_TEXTURE, U_INIT, 1),
        new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders),
        new uniform("point", GL_VEC2),
        new uniform("prev", GL_VEC2),
        new uniform("value", GL_VEC4),
        new uniform("brush_radius", GL_FLOAT),
        new uniform("brush_strength", GL_FLOAT),
        new uniform("additive", GL_FLOAT)
    ]);

    obstacle_splat_p = new shader_program("obstacle_splat", quad_vert, sh_obstacle_splat, [
        new uniform("point", GL_VEC2),
        new uniform("prev", GL_VEC2),
        new uniform("brush_radius", GL_FLOAT),
        new uniform("outline_width", GL_FLOAT, U_UPDATE, () => obstacle_splat.outline_width),
        new uniform("erase", GL_FLOAT)
    ]);

    forcefield_p = new shader_program("forcefield", quad_vert, sh_forcefield(force.glsl), [
        new uniform("tex_velocity", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_obstacles", GL_TEXTURE, U_INIT, 1),
        new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders),
        new uniform("center_worldpos", GL_VEC2, U_UPDATE, () => force.center),
        new uniform("window_width", GL_FLOAT, U_UPDATE, () => force.span),
        new uniform("force_strength", GL_FLOAT, U_UPDATE, () => force.strength),
        new uniform("dt", GL_FLOAT, U_UPDATE, renderer.fixed_dt_getter),
        new uniform("replace", GL_FLOAT, U_UPDATE, () => mouse.m2_down ? 1.0 : 0.0),
        new uniform("relax", GL_FLOAT, U_UPDATE, () => force.pure_vector_field ? force.relaxation : -1.0)
    ]);

    velocity_advect_p = new shader_program("velocity_advect", quad_vert, sh_sim_velocity_advect, [
        new uniform("tex_velocity", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_obstacles", GL_TEXTURE, U_INIT, 2),
        new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders),
        new uniform("dt", GL_FLOAT, U_UPDATE, renderer.fixed_dt_getter),
        new uniform("dissipation", GL_FLOAT, U_UPDATE, () => fluid.velocity_dissipation)
    ]);

    dye_advect_p = new shader_program("dye_advect", quad_vert, sh_sim_dye_advect, [
        new uniform("tex_velocity", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_dye", GL_TEXTURE, U_INIT, 1),
        new uniform("tex_obstacles", GL_TEXTURE, U_INIT, 2),
        new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders),
        new uniform("dt", GL_FLOAT, U_UPDATE, renderer.fixed_dt_getter),
        new uniform("dissipation", GL_FLOAT, U_UPDATE, () => fluid.dye_dissipation),
        new uniform("bg_log", GL_VEC3, U_UPDATE, () => fluid.bg.subarray(0, 3))
    ]);

    curl_p = new shader_program("curl", quad_vert, sh_sim_curl, [
        new uniform("tex_velocity", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_obstacles", GL_TEXTURE, U_INIT, 1),
        new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders),
    ]);

    blur_p = new shader_program("blur", quad_vert, sh_blur, [
        new uniform("tex_source", GL_TEXTURE, U_INIT, 0),
    ]);

    vorticity_confinement_p = new shader_program("vorticity_confinement", quad_vert, sh_sim_vorticity_confinement, [
        new uniform("tex_velocity", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_curl", GL_TEXTURE, U_INIT, 1),
        new uniform("tex_obstacles", GL_TEXTURE, U_INIT, 2),
        new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders),
        new uniform("dt", GL_FLOAT, U_UPDATE, renderer.fixed_dt_getter),
        new uniform("curl_strength", GL_FLOAT, U_UPDATE, () => fluid.curl_strength),
        new uniform("max_velocity", GL_FLOAT, U_UPDATE, () => fluid.max_velocity),
        new uniform("max_force", GL_FLOAT, U_UPDATE, () => fluid.max_force),
    ]);

    divergence_p = new shader_program("divergence", quad_vert, sh_sim_divergence, [
        new uniform("tex_velocity", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_obstacles", GL_TEXTURE, U_INIT, 1),
        new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders)
    ]);

    pressure_jacobi_p = new shader_program("pressure_jacobi", quad_vert, sh_sim_pressure_jacobi, [
        new uniform("tex_pressure", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_divergence", GL_TEXTURE, U_INIT, 1),
        new uniform("tex_obstacles", GL_TEXTURE, U_INIT, 2),
        new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders)
    ]);

    gradient_subtract_p = new shader_program("gradient_subtract", quad_vert, sh_sim_gradient_subtract, [
        new uniform("tex_pressure", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_velocity", GL_TEXTURE, U_INIT, 1),
        new uniform("tex_obstacles", GL_TEXTURE, U_INIT, 2),
        new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders),
    ]);

    rescale_p = new shader_program("rescale", quad_vert, sh_scale, [
        new uniform("tex_source", GL_TEXTURE, U_INIT, 0),
        new uniform("value", GL_FLOAT, U_UPDATE, () => fluid.jacobi_scale),
    ]);

    // reduction_pass_p = new shader_program("reduction_pass", quad_vert, sh_reduction_pass, [
    //     new uniform("tex_source", GL_TEXTURE, U_INIT, 0),
    //     new uniform("source_kind", GL_INT),
    //     new uniform("block_size", GL_INT, U_INIT, 8),
    //     new uniform("first_pass", GL_INT)
    // ]);

    diffusion_pass_p = new shader_program("diffusion_pass", quad_vert, sh_sim_diffusion_pass, [
        new uniform("tex_dye", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_curl", GL_TEXTURE, U_INIT, 1),
        new uniform("tex_velocity", GL_TEXTURE, U_INIT, 2),
        new uniform("tex_obstacles", GL_TEXTURE, U_INIT, 3),
        new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders),
        new uniform("dt", GL_FLOAT, U_UPDATE, renderer.fixed_dt_getter),
        new uniform("base_diffusion", GL_FLOAT, U_UPDATE, () => fluid.base_diffusion),
        new uniform("curl_diffusion", GL_FLOAT, U_UPDATE, () => fluid.curl_diffusion),
        new uniform("velocity_diffusion", GL_FLOAT, U_UPDATE, () => fluid.velocity_diffusion),
        new uniform("max_diffusion", GL_FLOAT, U_UPDATE, () => fluid.max_diffusion),
        new uniform("diffusion_radius", GL_FLOAT, U_UPDATE, () => fluid.diffusion_texel_radius)
    ]);
}