"use strict";
const tex_sym_vert = `
#version 300 es
out vec2 v_uv;
void main() {
    vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
    v_uv = p;
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
const tex_sym_splat = `
#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
out vec4 o;

uniform sampler2D u_target;
uniform vec2 u_point;      // sim uv
uniform vec3 u_value;      // velocity xy, or dye rgb
uniform float u_brush_radius;
void main() {
    vec2 d = v_uv - u_point;
    float g = exp(-dot(d, d) / u_brush_radius);
    o = vec4(texture(u_target, v_uv).rgb + g * u_value, 1.0);
}`;
const tex_sym_advect = `
#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
const vec2 TEXEL = vec2(${TEXEL});
out vec4 o;

uniform sampler2D u_velocity, u_source;
uniform float u_dt, u_dissipation;   // dissipation = exp(-rate * dt), 1.0 = none
void main() {
    vec2 vel  = texture(u_velocity, v_uv).xy;
    vec2 prev = v_uv - u_dt * vel * TEXEL;
    o = u_dissipation * texture(u_source, prev);
}`;
const tex_sym_curl = `
#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
const vec2 TEXEL = vec2(${TEXEL});
out vec4 o;

uniform sampler2D u_velocity;
void main() {
    float L = texture(u_velocity, v_uv - vec2(TEXEL.x, 0.0)).y;
    float R = texture(u_velocity, v_uv + vec2(TEXEL.x, 0.0)).y;
    float B = texture(u_velocity, v_uv - vec2(0.0, TEXEL.y)).x;
    float T = texture(u_velocity, v_uv + vec2(0.0, TEXEL.y)).x;
    o = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`;
const tex_sym_vorticity_confinement = `
#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
const vec2 TEXEL = vec2(${TEXEL});
out vec4 o;

uniform sampler2D u_velocity, u_curl;
uniform float u_curl_strength, u_dt;
void main() {
    float L = texture(u_curl, v_uv - vec2(TEXEL.x, 0.0)).x;
    float R = texture(u_curl, v_uv + vec2(TEXEL.x, 0.0)).x;
    float B = texture(u_curl, v_uv - vec2(0.0, TEXEL.y)).x;
    float T = texture(u_curl, v_uv + vec2(0.0, TEXEL.y)).x;
    float C = texture(u_curl, v_uv).x;

    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
    force /= length(force) + 1e-4;
    force *= u_curl_strength * C;
    force.y *= -1.0;

    vec2 vel = texture(u_velocity, v_uv).xy + force * u_dt;
    o = vec4(clamp(vel, -1000.0, 1000.0), 0.0, 1.0);
}`;
const tex_sym_divergence = `
#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
const vec2 TEXEL = vec2(${TEXEL});
out vec4 o;

uniform sampler2D u_velocity;
void main() {
    float L = texture(u_velocity, v_uv - vec2(TEXEL.x, 0.0)).x;
    float R = texture(u_velocity, v_uv + vec2(TEXEL.x, 0.0)).x;
    float B = texture(u_velocity, v_uv - vec2(0.0, TEXEL.y)).y;
    float T = texture(u_velocity, v_uv + vec2(0.0, TEXEL.y)).y;
    o = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;
const tex_sym_pressure_jacobi = `
#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
const vec2 TEXEL = vec2(${TEXEL});
out vec4 o;

uniform sampler2D u_pressure, u_divergence;
void main() {
    float L = texture(u_pressure, v_uv - vec2(TEXEL.x, 0.0)).x;
    float R = texture(u_pressure, v_uv + vec2(TEXEL.x, 0.0)).x;
    float B = texture(u_pressure, v_uv - vec2(0.0, TEXEL.y)).x;
    float T = texture(u_pressure, v_uv + vec2(0.0, TEXEL.y)).x;
    float div = texture(u_divergence, v_uv).x;
    o = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
}`;
const tex_sym_gradient_subtract = `
#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
const vec2 TEXEL = vec2(${TEXEL});
out vec4 o;

uniform sampler2D u_pressure, u_velocity;
void main() {
    float L = texture(u_pressure, v_uv - vec2(TEXEL.x, 0.0)).x;
    float R = texture(u_pressure, v_uv + vec2(TEXEL.x, 0.0)).x;
    float B = texture(u_pressure, v_uv - vec2(0.0, TEXEL.y)).x;
    float T = texture(u_pressure, v_uv + vec2(0.0, TEXEL.y)).x;
    vec2 v = texture(u_velocity, v_uv).xy - 0.5 * vec2(R - L, T - B);
    o = vec4(v, 0.0, 1.0);
}`;
const tex_sym_scale_pressure = `
#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
out vec4 o;

uniform sampler2D u_texture;
uniform float u_value;     // e.g. 0.8
void main() {
    o = u_value * texture(u_texture, v_uv);
}`;
const quad_vert = `
#version 300 es
layout(location = 0) in vec2 pos;
layout(location = 1) in vec2 uv;
uniform mat4 u_view_proj;
out vec2 v_uv;
void main() {
    v_uv = uv;
    gl_Position = u_view_proj * vec4(pos, 0.0, 1.0);
}`;
const quad_frag = `
#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_dye;
out vec4 o_color;
void main() {
    o_color = vec4(texture(u_dye, v_uv).rgb, 1.0);
}`;
