"use strict";
let __dye_radius = 0.000835;
const splat = {
    point: new Float32Array(2),
    dye_radius: __dye_radius,
    dye_strength: 0.45,
    velocity_radius: __dye_radius + 0.001,
    velocity_strength: 0.6,
    force_scale: 0.3,
    prev: new Float32Array(2),
    next_is_start: true,
    queue: []
};
const obstacle_splat = {
    radius: 0.008,
    feather: 0.003,
    erase: 0,
    next_is_start: true,
    queue: [],
    prev: new Float32Array(2)
};
const stroke = {
    choosen_palette: palette_color_data,
    /** index of the color used from the current choosen palette of colors. */
    palette_color: 0,
};
function dispatch_splat(uv_pos, start, color_data) {
    if (mouse.mode === MOUSE_MODE_WALL)
        set_obstacle_splat(uv_pos, start);
    else
        set_dye_splat(uv_pos, start, color_data);
}
function set_dye_splat(uv_pos, start, color_data) {
    const fcolor = color_data !== undefined
        ? color_data.fcolor
        : stroke.choosen_palette[stroke.palette_color].fcolor;
    const log_color = new Float16Array(4);
    color_logarithm(log_color, fcolor);
    splat.queue.push({
        uv: Float32Array.from(uv_pos),
        rgba: log_color,
        start: splat.next_is_start || start,
        no_dye: mouse.mode === MOUSE_MODE_FORCE,
        no_force: mouse.mode === MOUSE_MODE_DYE
    });
    splat.next_is_start = false;
}
function set_obstacle_splat(uv_pos, start) {
    obstacle_splat.queue.push({
        uv: Float32Array.from(uv_pos),
        erase: keyboard.shift_down ? 1.0 : 0.0,
        start: obstacle_splat.next_is_start || start
    });
    obstacle_splat.next_is_start = false;
}
function run_splats() {
    if (splat.queue.length === 0)
        return;
    splat_p.use_program();
    const _k1 = N1 * splat.force_scale / renderer.fixed_delta_time, _k2 = N2 * splat.force_scale / renderer.fixed_delta_time;
    gl.activeTexture(gl.TEXTURE0);
    for (const s of splat.queue) {
        if (s.start)
            splat.prev.set(s.uv);
        splat_p.uniforms["point"].set(s.uv);
        splat_p.uniforms["prev"].set(splat.prev);
        const [u, v] = s.uv;
        // velocity run
        if (!s.no_force) {
            const k1 = !s.start ? _k1 : 0, k2 = !s.start ? _k2 : 0;
            splat_p.uniforms["value"].set([(u - splat.prev[0]) * k1, (v - splat.prev[1]) * k2, 0, 0]);
            gl.viewport(0, 0, N1, N2);
            splat_p.uniforms["brush_radius"].set(splat.velocity_radius);
            splat_p.uniforms["brush_strength"].set(splat.velocity_strength);
            splat_p.uniforms["additive"].set(1.0);
            gl.bindTexture(gl.TEXTURE_2D, velocity_tex[velocity_read]);
            gl.bindFramebuffer(gl.FRAMEBUFFER, velocity_fbo[1 - velocity_read]);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            velocity_read = 1 - velocity_read;
        }
        // dye run
        if (!s.no_dye) {
            splat_p.uniforms["value"].set(s.rgba);
            gl.viewport(0, 0, M1, M2);
            splat_p.uniforms["brush_radius"].set(splat.dye_radius);
            splat_p.uniforms["brush_strength"].set(splat.dye_strength);
            splat_p.uniforms["additive"].set(0.0);
            gl.bindTexture(gl.TEXTURE_2D, dye_tex[dye_read]);
            gl.bindFramebuffer(gl.FRAMEBUFFER, dye_fbo[1 - dye_read]);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            dye_read = 1 - dye_read;
        }
        splat.prev.set(s.uv);
    }
    splat.queue.length = 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
function fill_grid(color, add_noise = false) {
    if (color === undefined) {
        color = new Float32Array(4);
        color_logarithm(color, stroke.choosen_palette[stroke.palette_color].fcolor);
    }
    texture_fill(dye_fbo[dye_read], color);
    const rgba16fv = new Float32Array([0.0, 0.0, 0.0, 0.0]);
    texture_fill(pressure_fbo[pressure_read], rgba16fv);
    texture_fill(curl_fbo, rgba16fv);
    texture_fill(divergence_fbo, rgba16fv);
    texture_fill(obstacles_fbo, rgba16fv);
    if (add_noise) {
        curl_velocity_fill_p.use_program();
        curl_velocity_fill_p.uniforms["seed"].set(Math.random());
        gl.bindFramebuffer(gl.FRAMEBUFFER, velocity_fbo[velocity_read]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    else {
        texture_fill(velocity_fbo[velocity_read], rgba16fv);
    }
}
function run_obstacle_splats() {
    if (obstacle_splat.queue.length === 0)
        return;
    obstacle_splat_p.use_program();
    gl.viewport(0, 0, N1, N2);
    gl.bindFramebuffer(gl.FRAMEBUFFER, obstacles_fbo);
    for (const s of obstacle_splat.queue) {
        if (s.start)
            obstacle_splat.prev.set(s.uv);
        obstacle_splat_p.uniforms["point"].set(s.uv);
        obstacle_splat_p.uniforms["erase"].set(s.erase);
        obstacle_splat_p.uniforms["brush_radius"].set(s.erase ? obstacle_splat.radius + 0.045 : obstacle_splat.radius);
        obstacle_splat_p.uniforms["prev"].set(obstacle_splat.prev);
        gl.blendEquation(s.erase ? gl.MIN : gl.MAX);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        obstacle_splat.prev.set(s.uv);
    }
    gl.blendEquation(gl.FUNC_ADD);
    gl.disable(gl.BLEND);
    obstacle_splat.queue.length = 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
