"use strict";
let gl, 
/** quad shader program. */
quad_p, checkboard_fill_p, curl_velocity_fill_p, splat_p, obstacle_splat_p, forcefield_p, velocity_advect_p, dye_advect_p, curl_p, blur_p, vorticity_confinement_p, divergence_p, pressure_jacobi_p, gradient_subtract_p, rescale_p, reduction_pass_p, diffusion_pass_p, quad, vao, velocity_tex, velocity_fbo, dye_tex, dye_fbo, pressure_tex, pressure_fbo, divergence_tex, divergence_fbo, curl_tex, curl_fbo, curl_smooth_tex, curl_smooth_fbo, obstacles_tex, obstacles_fbo, velocity_read, pressure_read, dye_read, reduction_sim_tex = [], reduction_sim_fbo = [], reduction_sim_1x1_tex = [], reduction_sim_1x1_fbo = [], reduction_sim_read, reduction_dye_tex = [], reduction_dye_fbo = [], reduction_dye_1x1_tex = [], reduction_dye_1x1_fbo = [], reduction_dye_read;
/** canvas DOM element (#screen). */
let canvas_el, 
/** updated in update_viewport */
canvas_rect, ui_toolbar, ui_status, ui_views, ui_inspector, ui_palette, ui_bounds, ui_brush_s, ui_wall_s, ui_force_s, ui_fluid_s, ui_open_borders, ui_field_strength, ui_field_center, ui_visualizer_s, ui_container, ui_force_btn, ui_borders_btn, ui_fluid_bg;
function update_bounds() {
    const h = force.span * 0.25;
    ui_bounds.update(force.center[0], force.center[1], h * ASPECT_NUM, h);
}
function set_force_active(on) {
    if (on === force.is_active)
        return;
    force.is_active = on;
    ui_force_s.toggle_visibility();
    ui_bounds.toggle_visibility();
}
/** event called by window.onload */
function init() {
    canvas_el = document.getElementById("screen");
    if (!(canvas_el instanceof HTMLCanvasElement))
        throw "Colorful.js: couldn't find 'canvas#screen' element.";
    gl = canvas_el.getContext("webgl2");
    if (gl === null)
        throw "Colorful.js: couldn't get WebGL2RenderingContext.";
    const ext1 = gl.getExtension("EXT_color_buffer_float");
    if (!ext1)
        throw "EXT_color_buffer_float is not supported on this hardware";
    //////////////////////////////////
    //         MAIN SHADER          //
    //////////////////////////////////
    update_viewport();
    quad = new Quad();
    //////////////////////////////////
    //         MAIN SHADER          //
    //////////////////////////////////
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
    create_buffer_vec2(quad.uvs, 0);
    //////////////////////////////////
    //     CHECKBOARD FILL SHADER   //
    //////////////////////////////////
    checkboard_fill_p = new shader_program("checkerboard_fill", quad_vert, sh_checkerboard_fill, [
        new uniform("dims", GL_VEC2, U_INIT, [4, 4]),
        new uniform("color_a", GL_VEC3, U_UPDATE, force.color_a_getter),
        new uniform("color_b", GL_VEC3, U_UPDATE, force.color_b_getter)
    ]);
    //////////////////////////////////
    //   CURL VELOCITY FILL SHADER  //
    //////////////////////////////////
    curl_velocity_fill_p = new shader_program("curl_velocity_fill", quad_vert, sh_curl_velocity_noise, [
        new uniform("scale", GL_FLOAT),
        new uniform("amp", GL_FLOAT),
        new uniform("div_mix", GL_FLOAT),
        new uniform("seed", GL_FLOAT),
    ]);
    //////////////////////////////////
    //         SPLAT SHADER         //
    //////////////////////////////////
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
    //////////////////////////////////
    //     OBSTACLE SPLAT SHADER    //
    //////////////////////////////////
    obstacle_splat_p = new shader_program("obstacle_splat", quad_vert, sh_obstacle_splat, [
        new uniform("point", GL_VEC2),
        new uniform("prev", GL_VEC2),
        new uniform("brush_radius", GL_FLOAT),
        new uniform("feather", GL_FLOAT, U_UPDATE, () => obstacle_splat.feather),
        new uniform("erase", GL_FLOAT)
    ]);
    //////////////////////////////////
    //         FORCE SHADER         //
    //////////////////////////////////
    forcefield_p = new shader_program("forcefield", quad_vert, sh_forcefield, [
        new uniform("tex_velocity", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_obstacles", GL_TEXTURE, U_INIT, 1),
        new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders),
        new uniform("center_worldpos", GL_VEC2, U_UPDATE, () => force.center),
        new uniform("window_width", GL_FLOAT, U_UPDATE, () => force.span),
        new uniform("force_strength", GL_FLOAT, U_UPDATE, () => force.strength),
        new uniform("dt", GL_FLOAT, U_UPDATE, renderer.fixed_dt_getter),
    ]);
    //////////////////////////////////
    //        ADVECT SHADER         //
    //////////////////////////////////
    velocity_advect_p = new shader_program("velocity_advect", quad_vert, sh_sim_velocity_advect, [
        new uniform("tex_velocity", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_obstacles", GL_TEXTURE, U_INIT, 2),
        new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders),
        new uniform("dt", GL_FLOAT, U_UPDATE, renderer.fixed_dt_getter),
        new uniform("dissipation", GL_FLOAT, U_UPDATE, () => fluid.velocity_dissipation)
    ]);
    //////////////////////////////////
    //       DYE ADVECT SHADER      //
    //////////////////////////////////
    color_logarithm(fluid.bg, bg);
    dye_advect_p = new shader_program("dye_advect", quad_vert, sh_sim_dye_advect, [
        new uniform("tex_velocity", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_dye", GL_TEXTURE, U_INIT, 1),
        new uniform("tex_obstacles", GL_TEXTURE, U_INIT, 2),
        new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders),
        new uniform("dt", GL_FLOAT, U_UPDATE, renderer.fixed_dt_getter),
        new uniform("dissipation", GL_FLOAT, U_UPDATE, () => fluid.dye_dissipation),
        new uniform("bg_log", GL_VEC3, U_UPDATE, () => fluid.bg.subarray(0, 3))
    ]);
    //////////////////////////////////
    //         CURL SHADER          //
    //////////////////////////////////
    curl_p = new shader_program("curl", quad_vert, sh_sim_curl, [
        new uniform("tex_velocity", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_obstacles", GL_TEXTURE, U_INIT, 1),
        new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders),
    ]);
    //////////////////////////////////
    //      CURL BLUR SHADER        //
    //////////////////////////////////
    blur_p = new shader_program("blur", quad_vert, sh_blur, [
        new uniform("tex_source", GL_TEXTURE, U_INIT, 0),
    ]);
    //////////////////////////////////
    //       VORTICITY SHADER       //
    //////////////////////////////////
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
    //////////////////////////////////
    //      DIVERGENCE SHADER       //
    //////////////////////////////////
    divergence_p = new shader_program("divergence", quad_vert, sh_sim_divergence, [
        new uniform("tex_velocity", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_obstacles", GL_TEXTURE, U_INIT, 1),
        new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders)
    ]);
    //////////////////////////////////
    //    PRESSURE JACOBI SHADER    //
    //////////////////////////////////
    pressure_jacobi_p = new shader_program("pressure_jacobi", quad_vert, sh_sim_pressure_jacobi, [
        new uniform("tex_pressure", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_divergence", GL_TEXTURE, U_INIT, 1),
        new uniform("tex_obstacles", GL_TEXTURE, U_INIT, 2),
        new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders)
    ]);
    //////////////////////////////////
    //   GRADIENT SUBTRACT SHADER   //
    //////////////////////////////////
    gradient_subtract_p = new shader_program("gradient_subtract", quad_vert, sh_sim_gradient_subtract, [
        new uniform("tex_pressure", GL_TEXTURE, U_INIT, 0),
        new uniform("tex_velocity", GL_TEXTURE, U_INIT, 1),
        new uniform("tex_obstacles", GL_TEXTURE, U_INIT, 2),
        new uniform("open_borders", GL_INT, U_UPDATE, () => fluid.open_borders),
    ]);
    //////////////////////////////////
    //         SCALE SHADER         //
    //////////////////////////////////
    rescale_p = new shader_program("rescale", quad_vert, sh_scale, [
        new uniform("tex_source", GL_TEXTURE, U_INIT, 0),
        new uniform("value", GL_FLOAT, U_UPDATE, () => fluid.jacobi_scale),
    ]);
    //////////////////////////////////
    //     REDUCTION PASS SHADER    //
    //////////////////////////////////
    // reduction_pass_p = new shader_program("reduction_pass", quad_vert, sh_reduction_pass, [
    //     new uniform("tex_source", GL_TEXTURE, U_INIT, 0),
    //     new uniform("source_kind", GL_INT),
    //     new uniform("block_size", GL_INT, U_INIT, 8),
    //     new uniform("first_pass", GL_INT)
    // ]);
    //////////////////////////////////
    //     DIFFUSION PASS SHADER    //
    //////////////////////////////////
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
    //////////////////////////////////
    //       SYM TEXTURE SETUP      //
    //////////////////////////////////
    const vel_0 = RGBA16F_texture(N1, N2), vel_1 = RGBA16F_texture(N1, N2), dye_0 = RGBA16F_texture(M1, M2), dye_1 = RGBA16F_texture(M1, M2), press_0 = R16F_texture(N1, N2), press_1 = R16F_texture(N1, N2), vel_fbo_0 = frame_buffer(vel_0), vel_fbo_1 = frame_buffer(vel_1), dye_fbo_0 = frame_buffer(dye_0), dye_fbo_1 = frame_buffer(dye_1), press_fbo_0 = frame_buffer(press_0), press_fbo_1 = frame_buffer(press_1);
    velocity_tex = [vel_0, vel_1];
    dye_tex = [dye_0, dye_1];
    pressure_tex = [press_0, press_1];
    divergence_tex = R16F_texture(N1, N2);
    curl_tex = create_texture(N1, N2, gl.R16F, gl.RED, gl.HALF_FLOAT, null, gl.LINEAR, gl.CLAMP_TO_EDGE);
    curl_smooth_tex = create_texture(N1, N2, gl.R16F, gl.RED, gl.HALF_FLOAT, null, gl.LINEAR, gl.CLAMP_TO_EDGE);
    obstacles_tex = create_texture(N1, N2, gl.R8, gl.RED, gl.UNSIGNED_BYTE, null, gl.LINEAR, gl.CLAMP_TO_EDGE);
    velocity_fbo = [vel_fbo_0, vel_fbo_1];
    dye_fbo = [dye_fbo_0, dye_fbo_1];
    pressure_fbo = [press_fbo_0, press_fbo_1];
    divergence_fbo = frame_buffer(divergence_tex);
    curl_fbo = frame_buffer(curl_tex);
    curl_smooth_fbo = frame_buffer(curl_smooth_tex);
    obstacles_fbo = frame_buffer(obstacles_tex);
    // reduction_textures(reduction_sim_tex, reduction_sim_fbo, N1, N2, 8);
    // const sim_1x1_0 = create_texture(1,1,gl.RG16F,gl.RG,gl.HALF_FLOAT,null,gl.NEAREST,gl.CLAMP_TO_EDGE);
    // const tex = 
    // out_tex.push(tex);
    // out_fbo.push(frame_buffer(tex));
    // reduction_textures(reduction_dye_tex, reduction_dye_fbo, M1, M2, 8);
    // init
    gl.viewport(0, 0, M1, M2);
    texture_fill(dye_fbo_0, fluid.bg);
    texture_fill(dye_fbo_1, fluid.bg);
    const zero = new Float32Array([0.0, 0.0, 0.0, 0.0]);
    texture_fill(vel_fbo_1, zero);
    texture_fill(press_fbo_0, zero);
    texture_fill(press_fbo_1, zero);
    texture_fill(divergence_fbo, zero);
    texture_fill(curl_fbo, zero);
    texture_fill(curl_smooth_fbo, zero);
    texture_fill(obstacles_fbo, zero);
    gl.viewport(0, 0, N1, N2);
    gl.enable(gl.BLEND);
    curl_velocity_fill_p.use_program();
    curl_velocity_fill_p.uniforms["scale"].set(5.0);
    curl_velocity_fill_p.uniforms["amp"].set(50.0);
    curl_velocity_fill_p.uniforms["div_mix"].set(0.1);
    curl_velocity_fill_p.uniforms["seed"].set(Math.random());
    gl.bindFramebuffer(gl.FRAMEBUFFER, vel_fbo_0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    velocity_read = 0;
    pressure_read = 0;
    dye_read = 0;
    reduction_dye_read = 0;
    reduction_sim_read = 0;
    //////////////////////////////////
    //            EVENTS            //
    //////////////////////////////////
    canvas_el.onmouseleave = c_mouseleave;
    canvas_el.onmousedown = c_mousedown;
    new ResizeObserver(update_viewport).observe(canvas_el);
    window.onmousemove = w_mousemove;
    window.onmouseup = w_mouseup;
    canvas_el.oncontextmenu = (e) => {
        e.preventDefault();
    };
    //////////////////////////////////
    //            EVENTS            //
    //////////////////////////////////
    ui_bounds = new UI_BOUNDS();
    ui_status = new UI_STATUS();
    ui_inspector = new UI_INSPECTOR();
    ui_palette = ui_inspector.palette(palette_color_data, stroke.palette_color, i => { stroke.palette_color = i; }, c => { stroke.choosen_palette.push(c); });
    ui_brush_s = ui_inspector.section("Brush");
    ui_brush_s.slider({ label: "dye radius", obj: splat, key: "dye_radius", min: 1e-4, max: 0.01, log: true });
    ui_brush_s.slider({ label: "dye strength", obj: splat, key: "dye_strength", min: 0, max: 1 });
    ui_brush_s.slider({ label: "force radius", obj: splat, key: "velocity_radius", min: 1e-4, max: 0.02, log: true });
    ui_brush_s.slider({ label: "force strength", obj: splat, key: "velocity_strength", min: 0, max: 1 });
    ui_brush_s.slider({ label: "mouse motion scale", obj: splat, key: "force_scale", min: 0, max: 2 });
    ui_wall_s = ui_inspector.section("wall");
    ui_wall_s.slider({ label: "radius", obj: obstacle_splat, key: "radius", min: 0.002, max: 0.05, log: true });
    ui_wall_s.slider({ label: "feather", obj: obstacle_splat, key: "feather", min: 0.0005, max: 0.01, log: true });
    ui_force_s = ui_inspector.section("Force field");
    ui_field_center = ui_force_s.vec2({ label: "center", obj: force, key: "center", step: 0.01, onChange: update_bounds });
    ui_field_strength = ui_force_s.slider({ label: "strength", obj: force, key: "strength", min: 1, max: 10000 });
    ui_force_s.slider({ label: "window", obj: force, key: "span", min: 0.5, max: 200, log: true, onChange: update_bounds });
    ui_fluid_s = ui_inspector.section("Fluid");
    ui_fluid_bg = ui_fluid_s.color(({
        label: "background", obj: fluid, key: "bg_arr", onPick: () => {
            // @ts-ignore
            color_logarithm(fluid.bg, fluid.bg_arr);
            renderer.request_color_clear = { pending: true, noise: false };
        },
        frozen: () => fluid.display_mode === DISPLAY_DYE ? undefined : fluid.bg_arr,
    }));
    ui_fluid_s.slider({ label: "jacobi iters", obj: fluid, key: "jacobi_iterations", min: 0, max: 300, int: true });
    ui_fluid_s.slider({ label: "jacobi scale", obj: fluid, key: "jacobi_scale", min: 0, max: 1 });
    ui_fluid_s.slider({ label: "curl strength", obj: fluid, key: "curl_strength", min: 0, max: 60 });
    ui_fluid_s.slider({ label: "vel. dissip.", obj: fluid, key: "velocity_dissipation", min: 0.9, max: 1, step: 0.0001 });
    ui_fluid_s.slider({ label: "diff. base", obj: fluid, key: "base_diffusion", min: 0, max: 10 });
    ui_fluid_s.slider({ label: "diff. curl", obj: fluid, key: "curl_diffusion", min: 0, max: 2 });
    ui_fluid_s.slider({ label: "diff. speed", obj: fluid, key: "velocity_diffusion", min: 0, max: 0.5 });
    ui_fluid_s.slider({ label: "diff. max", obj: fluid, key: "max_diffusion", min: 0, max: 30 });
    ui_fluid_s.slider({ label: "diff. radius", obj: fluid, key: "diffusion_texel_radius", min: 1, max: 12 });
    ui_fluid_s.slider({ label: "max velocity", obj: fluid, key: "max_velocity", min: 50, max: 1500 });
    ui_open_borders = ui_fluid_s.toggle({ label: "open borders", obj: fluid, key: "open_borders", int: true });
    const SECTION_OF_TOOL = {
        [MOUSE_MODE_DYE_FORCE]: "Brush", [MOUSE_MODE_DYE]: "Brush",
        [MOUSE_MODE_FORCE]: "Brush", [MOUSE_MODE_WALL]: "Wall",
    };
    ui_toolbar = new UI_TOOLBAR([
        { id: MOUSE_MODE_DYE_FORCE, tip: "Dye + Force", icon: TOOL_ICONS[0], key: "q" },
        { id: MOUSE_MODE_DYE, tip: "Dye", icon: TOOL_ICONS[1], key: "w" },
        { id: MOUSE_MODE_FORCE, tip: "Force", icon: TOOL_ICONS[2], key: "e" },
        { id: MOUSE_MODE_WALL, tip: "Wall", icon: TOOL_ICONS[3], key: "r", separator: true },
    ], mouse.mode, id => {
        ui_status.tool(MODE2STR[id]);
        ui_inspector.focus(SECTION_OF_TOOL[id]);
        if (mouse.mode === id)
            return;
        const prev = mouse.mode;
        mouse.mode = id;
        if (id === MOUSE_MODE_WALL || prev === MOUSE_MODE_WALL) {
            ui_brush_s.toggle_visibility();
            ui_wall_s.toggle_visibility();
            ui_palette.toggle_visibility();
        }
        ui_fluid_bg.show();
        ui_visualizer_s.refresh();
    });
    ui_force_btn = ui_toolbar.add_toggle({
        tip: "Force field  [F]", icon: FORCE_ICON, initial: force.is_active, onToggle: set_force_active,
    });
    ui_borders_btn = ui_toolbar.add_toggle({
        tip: "Open borders toogle [TAB]", icon: BORDERS_ICON, initial: fluid.open_borders === 1, onToggle: (v) => {
            if (v === !!fluid.open_borders)
                return;
            fluid.open_borders = v ? 1 : 0;
            ui_open_borders.show();
        }
    });
    const display_obj = () => {
        switch (fluid.display_mode) {
            case DISPLAY_VELOCITY:
                return fluid.display.velocity;
            case DISPLAY_PRESSURE:
                return fluid.display.pressure;
            case DISPLAY_CURL:
                return fluid.display.curl;
            default:
                return fluid.display.divergence;
        }
    };
    const display_max = () => {
        if (fluid.display_mode === DISPLAY_VELOCITY)
            return fluid.max_velocity;
        else if (fluid.display_mode === DISPLAY_DIVERGENCE)
            return 50;
        else
            return fluid.max_force * 2;
    };
    const PALETTE_OPTIONS = [
        { value: PALETTE_VIRIDIS, name: "viridis" },
        { value: PALETTE_HUE_BRIGHTNESS, name: "hsv" },
        { value: PALETTE_TURBO, name: "turbo" },
        { value: PALETTE_DIVERGING, name: "diverging" },
    ];
    ui_visualizer_s = ui_inspector.section("visualizer");
    ui_visualizer_s.enum({
        label: "palette",
        obj: fluid,
        key: "display_palette",
        options: () => fluid.display_mode === DISPLAY_DIVERGENCE ? [PALETTE_OPTIONS[3]] : [PALETTE_OPTIONS[0], PALETTE_OPTIONS[1], PALETTE_OPTIONS[2]],
        // divergence view forces the diverging palette, dye ignores palettes entirely
        frozen: () => fluid.display_mode === DISPLAY_DIVERGENCE ? PALETTE_DIVERGING
            : undefined,
    });
    ui_visualizer_s.slider({ label: "ref", obj: display_obj, key: "ref", min: 0, max: display_max });
    ui_visualizer_s.slider({ label: "thresh", obj: display_obj, key: "thresh", min: 0, max: 1 });
    ui_visualizer_s.slider({ label: "k", obj: display_obj, key: "k", min: 0, max: 1 });
    if (mouse.mode === MOUSE_MODE_WALL)
        ui_brush_s.toggle_visibility();
    else
        ui_wall_s.toggle_visibility();
    if (fluid.display_mode === DISPLAY_DYE)
        ui_visualizer_s.toggle_visibility();
    if (!force.is_active) {
        ui_force_s.toggle_visibility();
        ui_bounds.toggle_visibility();
    }
    ui_views = new UI_VIEW_SELECT(Object.keys(DISPLAY2STR).map((_, i) => ({ id: i, name: DISPLAY2STR[i], key: String(i + 1) })), fluid.display_mode, id => {
        const prev = fluid.display_mode;
        if (id === prev)
            return;
        fluid.display_mode = id;
        if (prev === DISPLAY_DYE || id === DISPLAY_DYE)
            ui_visualizer_s.toggle_visibility();
        ui_visualizer_s.refresh();
        ui_fluid_bg.show();
    });
    ui_container = $("hud");
    update_bounds();
    document.getElementById("hud")?.classList.toggle("hidden");
    draw(0);
}
