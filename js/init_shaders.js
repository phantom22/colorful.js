"use strict";
let gl;
let vao;
let quad_p, checkboard_fill_p, curl_velocity_fill_p, splat_p, obstacle_splat_p, forcefield_p, velocity_advect_p, dye_advect_p, curl_p, blur_p, vorticity_confinement_p, divergence_p, pressure_jacobi_p, gradient_subtract_p, rescale_p, 
// reduction_pass_p: shader_program,
diffusion_pass_p;
let canvas_el, 
/** updated in update_viewport */
canvas_rect;
function recompile_forcefield(get_velocity) {
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
            new uniform("relax", GL_FLOAT, U_UPDATE, () => force.pure_vector_field ? force.relaxation : -1.0),
            new uniform("time", GL_FLOAT, U_UPDATE, () => renderer.time)
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
    catch (e) {
        return e;
    }
}
function init_shaders() {
    canvas_el = document.getElementById("screen");
    if (!(canvas_el instanceof HTMLCanvasElement))
        throw "Colorful.js: couldn't find 'canvas#screen' element.";
    gl = canvas_el.getContext("webgl2");
    if (gl === null)
        throw "Colorful.js: couldn't get WebGL2RenderingContext.";
    const ext1 = gl.getExtension("EXT_color_buffer_float");
    if (!ext1)
        throw "EXT_color_buffer_float is not supported on this hardware";
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
        new uniform("dims", GL_VEC2, U_INIT, [4, 4]),
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
        new uniform("relax", GL_FLOAT, U_UPDATE, () => force.pure_vector_field ? force.relaxation : -1.0),
        new uniform("time", GL_FLOAT, U_UPDATE, () => renderer.time)
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
