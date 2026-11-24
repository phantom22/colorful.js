let gl: WebGL2RenderingContext;

let vao:WebGLVertexArrayObject;

let quad_p: shader_program<[uniform<"tex_source", 7>, uniform<"tex_obstacles", 7>, uniform<"source_kind", 4>, uniform<"palette_type", 4>, uniform<"blur_type", 4>, uniform<"reference_value", 5>, uniform<"value_rescale_threshold", 5>, uniform<"rescale_factor", 5>, uniform<"interp", 5>, uniform<"interp_dt", 5>, uniform<"interp_blend", 4>]>,
    curl_velocity_fill_p: shader_program<[uniform<"scale", 5>, uniform<"amp", 5>, uniform<"div_mix", 5>, uniform<"seed", 5>]>,
    splat_p: shader_program<[uniform<"tex_obstacles", 7>, uniform<"point", 8>, uniform<"prev", 8>, uniform<"value", 10>, uniform<"brush_radius", 5>, uniform<"brush_strength", 5>, uniform<"additive", 5>, uniform<"steps", 5>]>,
    obstacle_splat_p: shader_program<[uniform<"point", 8>, uniform<"prev", 8>, uniform<"brush_radius", 5>, uniform<"outline_width", 5>, uniform<"erase", 5>]>,
    forcefield_p: shader_program<[uniform<"tex_velocity", 7>, uniform<"tex_obstacles", 7>, uniform<"center_worldpos", 8>, uniform<"window_width", 5>, uniform<"force_strength", 5>, uniform<"dt", 5>]>,
    velocity_advect_p: shader_program<[uniform<"tex_velocity", 7>, uniform<"tex_obstacles", 7>, uniform<"dt", 5>, uniform<"dissipation", 5>]>,
    dye_advect_p: shader_program<[uniform<"tex_velocity", 7>, uniform<"tex_dye", 7>, uniform<"tex_obstacles", 7>, uniform<"dt", 5>, uniform<"dissipation", 5>]>,
    curl_p: shader_program<[uniform<"tex_velocity", 7>, uniform<"tex_mask", 7>]>,
    curl_smooth_p: shader_program<[uniform<"tex_velocity", 7>, uniform<"tex_obstacles", 7>, uniform<"half_size", 5>]>,
    vorticity_confinement_p: shader_program<[uniform<"tex_velocity", 7>, uniform<"tex_curl", 7>, uniform<"tex_mask", 7>, uniform<"dt", 5>, uniform<"curl_strength", 5>, uniform<"max_velocity", 5>, uniform<"max_force", 5>]>,
    divergence_p: shader_program<[uniform<"tex_velocity", 7>, uniform<"tex_mask", 7>]>,
    gradient_subtract_p: shader_program<[uniform<"tex_pressure", 7>, uniform<"tex_velocity", 7>, uniform<"tex_mask", 7>]>,
    obstacle_mask_p: shader_program<[uniform<"tex_obstacles", 7>]>,
    wall_dist_h_p: shader_program<[uniform<"tex_obstacles", 7>]>,
    wall_dist_v_p: shader_program<[uniform<"tex_h", 7>]>,
    resample_p: shader_program<[uniform<"tex_source", 7>, uniform<"uv_scale", 8>, uniform<"value_scale", 10>, uniform<"fill", 10>]>;
    // reduction_pass_p: shader_program,

/** vorticity confinement works at the reference grid's scale: the curl is
 * smoothed and its slope measured over one reference texel (never less than a
 * real one), so eddies keep their size on screen at any sim resolution. */
const vc_spacing = () => Math.max(1, res_scale.sim);
/** half side of the curl averaging square, in vc_spacing units. */
let CURL_BOX = 1.25;

let canvas_el: HTMLCanvasElement,
    /** updated in update_viewport */
    canvas_rect: DOMRect;

function recompile_forcefield(get_velocity:string): null | string {
    try {
        let t = new shader_program("forcefield_tmp", quad_vert, sh_forcefield(get_velocity).trim(), [
            new uniform("tex_velocity", GL_TEXTURE, U_INIT, 0),
            new uniform("tex_obstacles", GL_TEXTURE, U_INIT, 2),
        new uniform("tex_wall", GL_TEXTURE, U_INIT, 4),
            new uniform("dissipation", GL_FLOAT, U_UPDATE, () => per_step(fluid.velocity_dissipation)),
            new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders),
            new uniform("center_worldpos", GL_VEC2, U_UPDATE, () => force.center),
            new uniform("window_width", GL_FLOAT, U_UPDATE, () => force.span),
            new uniform("force_strength", GL_FLOAT, U_UPDATE, () => force.strength * res_scale.sim),
            new uniform("dt", GL_FLOAT, U_UPDATE, renderer.fixed_dt_getter),
            new uniform("replace", GL_FLOAT, U_UPDATE, () => mouse.m2_down ? 1.0 : 0.0),
            new uniform("relax", GL_FLOAT, U_UPDATE, () => force.pure_vector_field ? force.relaxation : -1.0),
            new uniform("time", GL_FLOAT, U_UPDATE, () => renderer.time)
        ]).finish();     // compile errors now, for the editor
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

function init_webgl() {
    canvas_el = document.getElementById("screen") as HTMLCanvasElement;
    if (!(canvas_el instanceof HTMLCanvasElement))
        throw "Colorful.js: couldn't find 'canvas#screen' element.";

    // one opaque full-screen quad per frame: MSAA, alpha, depth and stencil
    // would only add work (the MSAA resolve alone cost ~1/3 of the frame)
    gl = canvas_el.getContext("webgl2", {
        antialias: false, alpha: false, depth: false, stencil: false,
    }) as WebGL2RenderingContext;
    if (gl === null)
        throw "Colorful.js: couldn't get WebGL2RenderingContext.";

    const ext1 = gl.getExtension("EXT_color_buffer_float");
    if (!ext1) throw "EXT_color_buffer_float is not supported on this hardware";
    check_readback();

    apply_canvas_size();
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
        new uniform("interp", GL_FLOAT),
        new uniform("interp_dt", GL_FLOAT),
        new uniform("interp_blend", GL_INT),
        new uniform("tex_prev", GL_TEXTURE, U_INIT, 4),
        new uniform("auto_exposure", GL_INT, U_UPDATE, () => fluid.display.auto_exposure),
        new uniform("tex_exposure", GL_TEXTURE, U_INIT, 2),
        new uniform("exposure", GL_FLOAT, U_UPDATE, () => fluid.display.exposure),
        new uniform("arrows", GL_INT, U_UPDATE, () => fluid.display.arrows),
        new uniform("arrow_rows", GL_FLOAT, U_UPDATE, () => fluid.display.arrow_rows),
        new uniform("screen_px", GL_VEC2, U_UPDATE, () => [gl.drawingBufferWidth, gl.drawingBufferHeight]),
        new uniform("tex_velocity", GL_TEXTURE, U_INIT, 3),
        new uniform("arrow_ref", GL_FLOAT, U_UPDATE, () => fluid.display.velocity.ref * res_scale.sim),
        new uniform("arrow_gradient", GL_INT, U_UPDATE, () => fluid.display_mode === DISPLAY_PRESSURE ? 1 : 0),
    ]);

    vao = create_vertex_array();
    create_buffer_vec2(quad, 0);

    curl_velocity_fill_p = new shader_program("curl_velocity_fill", quad_vert, sh_curl_velocity_noise, [
        new uniform("scale", GL_FLOAT),
        new uniform("amp", GL_FLOAT),
        new uniform("div_mix", GL_FLOAT),
        new uniform("seed", GL_FLOAT),
    ]);

    splat_p = new shader_program("splat", quad_vert, sh_splat, [
        new uniform("tex_obstacles", GL_TEXTURE, U_INIT, 1),
        new uniform("steps", GL_FLOAT),
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

    // the force field runs inside the velocity advection, see sh_forcefield
    forcefield_p = new shader_program("forcefield", quad_vert, sh_forcefield(force.glsl.src), [
        new uniform("tex_velocity", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_obstacles", GL_TEXTURE, U_INIT, 2),
        new uniform("tex_wall", GL_TEXTURE, U_INIT, 4),
        new uniform("dissipation", GL_FLOAT, U_UPDATE, () => per_step(fluid.velocity_dissipation)),
        new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders),
        new uniform("center_worldpos", GL_VEC2, U_UPDATE, () => force.center),
        new uniform("window_width", GL_FLOAT, U_UPDATE, () => force.span),
        new uniform("force_strength", GL_FLOAT, U_UPDATE, () => force.strength * res_scale.sim),
        new uniform("dt", GL_FLOAT, U_UPDATE, renderer.fixed_dt_getter),
        new uniform("replace", GL_FLOAT, U_UPDATE, () => mouse.m2_down ? 1.0 : 0.0),
        new uniform("relax", GL_FLOAT, U_UPDATE, () => force.pure_vector_field ? force.relaxation : -1.0),
        new uniform("time", GL_FLOAT, U_UPDATE, () => renderer.time)
    ]);

    velocity_advect_p = new shader_program("velocity_advect", quad_vert, sh_sim_velocity_advect, [
        new uniform("tex_velocity", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_wall", GL_TEXTURE, U_INIT, 4),
        new uniform("tex_obstacles", GL_TEXTURE, U_INIT, 2),
        new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders),
        new uniform("dt", GL_FLOAT, U_UPDATE, renderer.fixed_dt_getter),
        new uniform("dissipation", GL_FLOAT, U_UPDATE, () => per_step(fluid.velocity_dissipation))
    ]);

    dye_advect_p = new shader_program("dye_advect", quad_vert, sh_sim_dye_advect, [
        new uniform("tex_velocity", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_wall", GL_TEXTURE, U_INIT, 4),
        new uniform("tex_dye", GL_TEXTURE, U_INIT, 1),
        new uniform("tex_obstacles", GL_TEXTURE, U_INIT, 2),
        new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders),
        new uniform("dt", GL_FLOAT, U_UPDATE, renderer.fixed_dt_getter),
        new uniform("dissipation", GL_FLOAT, U_UPDATE, () => per_step(fluid.dye_dissipation)),
        new uniform("bg_log", GL_VEC3, U_UPDATE, () => fluid.bg.subarray(0, 3)),
        new uniform("tex_curl", GL_TEXTURE, U_INIT, 3),
        new uniform("diffuse", GL_INT, U_UPDATE, () => diffusion_active() ? 1 : 0),
        new uniform("base_diffusion", GL_FLOAT, U_UPDATE, () => fluid.base_diffusion),
        new uniform("curl_diffusion", GL_FLOAT, U_UPDATE, () => fluid.curl_diffusion),
        new uniform("velocity_diffusion", GL_FLOAT, U_UPDATE, () => fluid.velocity_diffusion / res_scale.sim),
        new uniform("max_diffusion", GL_FLOAT, U_UPDATE, () => fluid.max_diffusion),
        new uniform("diffusion_radius", GL_FLOAT, U_UPDATE, () => fluid.diffusion_texel_radius * res_scale.dye)
    ]);

    curl_p = new shader_program("curl", quad_vert, sh_sim_curl, [
        new uniform("tex_velocity", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_mask", GL_TEXTURE, U_INIT, 1),
    ]);

    curl_smooth_p = new shader_program("curl_smooth", quad_vert, sh_sim_curl_smooth, [
        new uniform("tex_velocity", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_obstacles", GL_TEXTURE, U_INIT, 2),
        new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders),
        new uniform("half_size", GL_FLOAT, U_UPDATE, () => CURL_BOX * vc_spacing()),
    ]);

    vorticity_confinement_p = new shader_program("vorticity_confinement", quad_vert, sh_sim_vorticity_confinement, [
        new uniform("tex_velocity", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_curl", GL_TEXTURE, U_INIT, 1),
        new uniform("tex_mask", GL_TEXTURE, U_INIT, 2),
        new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders),
        new uniform("dt", GL_FLOAT, U_UPDATE, renderer.fixed_dt_getter),
        new uniform("curl_strength", GL_FLOAT, U_UPDATE, () => fluid.curl_strength),
        new uniform("max_velocity", GL_FLOAT, U_UPDATE, () => fluid.max_velocity * res_scale.sim),
        new uniform("max_force", GL_FLOAT, U_UPDATE, () => fluid.max_force * res_scale.sim),
        new uniform("drag", GL_FLOAT, U_UPDATE, () => fluid.drag),
        new uniform("spacing", GL_FLOAT, U_UPDATE, vc_spacing)
    ]);

    divergence_p = new shader_program("divergence", quad_vert, sh_sim_divergence, [
        new uniform("tex_velocity", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_mask", GL_TEXTURE, U_INIT, 1),
    ]);

    gradient_subtract_p = new shader_program("gradient_subtract", quad_vert, sh_sim_gradient_subtract, [
        new uniform("tex_pressure", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_velocity", GL_TEXTURE, U_INIT, 1),
        new uniform("tex_mask", GL_TEXTURE, U_INIT, 2),
        new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders),
    ]);

    obstacle_mask_p = new shader_program("obstacle_mask", quad_vert, sh_obstacle_mask, [
        new uniform("tex_obstacles", GL_TEXTURE, U_INIT, 0),
        new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders),
    ]);
    wall_dist_h_p = new shader_program("wall_dist_h", quad_vert, sh_wall_dist_h, [
        new uniform("tex_obstacles", GL_TEXTURE, U_INIT, 0),
        new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders),
    ]);
    wall_dist_v_p = new shader_program("wall_dist_v", quad_vert, sh_wall_dist_v, [
        new uniform("tex_h", GL_TEXTURE, U_INIT, 0),
        new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders),
    ]);

    resample_p = new shader_program("resample", quad_vert, sh_resample, [
        new uniform("tex_source", GL_TEXTURE, U_INIT, 0),
        new uniform("uv_scale", GL_VEC2),
        new uniform("value_scale", GL_VEC4),
        new uniform("fill", GL_VEC4),
    ]);

    // reduction_pass_p = new shader_program("reduction_pass", quad_vert, sh_reduction_pass, [
    //     new uniform("tex_source", GL_TEXTURE, U_INIT, 0),
    //     new uniform("source_kind", GL_INT),
    //     new uniform("block_size", GL_INT, U_INIT, 8),
    //     new uniform("first_pass", GL_INT)
    // ]);

    init_multigrid_programs();
    init_exposure_programs();
}