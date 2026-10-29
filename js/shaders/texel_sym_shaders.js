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
uniform vec2 u_point, u_prev;
// dye run: vec4(r, g, b, 1.0), linear. Velocity run: vec4(vx, vy, 0.0, 0.0)
uniform vec4 u_value;
uniform float u_brush_radius, u_strength;
uniform float u_additive;
void main() {
    vec2 pa = v_uv - u_prev, ba = u_point - u_prev;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
    vec2 d = pa - ba * h;                          // distance to the segment
    float w = clamp(exp(-dot(d, d) / u_brush_radius) * u_strength, 0.0, 1.0);
    
    vec4 old = texture(u_target, v_uv);
    o = u_additive > 0.5 ? old + w * u_value : mix(old, u_value, w);
}`;
const tex_sym_velocity_advect = `
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
    prev = clamp(prev, 0.5 * TEXEL, 1.0 - 0.5 * TEXEL);   // stay inside the texel centers
    o = u_dissipation * texture(u_source, prev);
}`;
const tex_sym_dye_advect = `
#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
out vec4 o;

const vec2 TEXEL  = vec2(${TEXEL});
const vec2 DTEXEL = vec2(${DYE_TEXEL});

uniform sampler2D u_velocity, u_source;
uniform float u_dt, u_dissipation;

void main() {
    vec2 v0   = texture(u_velocity, v_uv).xy;
    vec2 back = v_uv - u_dt * v0 * TEXEL;               // where this fluid came from
    vec4 fwd  = texture(u_source, back);                // plain semi-Lagrangian result

    // re-trace: advect the result forward again, then compare with the original
    vec2 p    = v_uv + u_dt * v0 * TEXEL;
    vec2 q    = p - u_dt * texture(u_velocity, p).xy * TEXEL;
    vec4 err  = texture(u_source, v_uv) - texture(u_source, q);
    vec4 mc   = fwd + 0.5 * err;

    // clamp to the 4 source texels around 'back', so no new extremes appear
    vec2 st = back / DTEXEL - 0.5;
    vec2 c0 = (floor(st) + 0.5) * DTEXEL;
    vec4 a = texture(u_source, c0);
    vec4 b = texture(u_source, c0 + vec2(DTEXEL.x, 0.0));
    vec4 c = texture(u_source, c0 + vec2(0.0, DTEXEL.y));
    vec4 d = texture(u_source, c0 + DTEXEL);
    mc = clamp(mc, min(min(a, b), min(c, d)), max(max(a, b), max(c, d)));

    o = u_dissipation * mc;
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

    float edge = min(min(v_uv.x, 1.0 - v_uv.x), min(v_uv.y, 1.0 - v_uv.y));
    float c = 0.5 * (R - L - T + B);
    if (edge < 2.0 * TEXEL.x) c = 0.0;
    o = vec4(c, 0.0, 0.0, 1.0);
}`;
const tex_sym_curl_blur = `
#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
const vec2 TEXEL = vec2(${TEXEL});
out vec4 o;

uniform sampler2D u_curl;
void main() {
    float s = 0.0;
    for (int y = -1; y <= 1; ++y)
        for (int x = -1; x <= 1; ++x) {
            float w = (x == 0 ? 2.0 : 1.0) * (y == 0 ? 2.0 : 1.0);
            s += w * texture(u_curl, v_uv + vec2(x, y) * TEXEL).x;
        }
    o = vec4(s / 16.0, 0.0, 0.0, 1.0);
}`;
const tex_sym_vorticity_confinement = `
#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
const vec2 TEXEL = vec2(${TEXEL});
out vec4 o;

uniform sampler2D u_velocity, u_curl;
uniform float u_curl_strength, u_dt, u_max_force, u_max_speed;
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

    float fm = length(force);
    if (fm > u_max_force) force *= u_max_force / fm;     // cap the injected energy

    vec2 vel = texture(u_velocity, v_uv).xy + force * u_dt;
    float sp = length(vel);
    if (sp > u_max_speed) vel *= u_max_speed / sp;       // cap magnitude, not per component
    o = vec4(vel, 0.0, 1.0);
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
    vec2 C = texture(u_velocity, v_uv).xy;
    float L = texture(u_velocity, v_uv - vec2(TEXEL.x, 0.0)).x;
    float R = texture(u_velocity, v_uv + vec2(TEXEL.x, 0.0)).x;
    float B = texture(u_velocity, v_uv - vec2(0.0, TEXEL.y)).y;
    float T = texture(u_velocity, v_uv + vec2(0.0, TEXEL.y)).y;
    if (v_uv.x - TEXEL.x < 0.0) L = -C.x;
    if (v_uv.x + TEXEL.x > 1.0) R = -C.x;
    if (v_uv.y - TEXEL.y < 0.0) B = -C.y;
    if (v_uv.y + TEXEL.y > 1.0) T = -C.y;
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
    if (v_uv.x < TEXEL.x || v_uv.x > 1.0 - TEXEL.x) v.x = 0.0;
    if (v_uv.y < TEXEL.y || v_uv.y > 1.0 - TEXEL.y) v.y = 0.0;
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
const tex_sym_diffusion_pass = `
#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
out vec4 o;

const vec2 DTEXEL = vec2(${DYE_TEXEL});
const vec2 CT = vec2(${TEXEL});

uniform sampler2D u_dye, u_curl, u_velocity;
uniform float u_dt;
uniform float u_diff_base;
uniform float u_diff_curl;
uniform float u_diff_speed;
uniform float u_diff_max;
uniform float u_diff_radius;   // NEW: stencil radius in dye texels, try 3-6

void main() {
    vec4 c = texture(u_dye, v_uv);

    // wide circular stencil: replaces the l, r, b, t taps
    vec4 acc = vec4(0.0);
    for (int i = 0; i < 8; ++i) {
        float a = 0.78539816 * float(i);
        acc += texture(u_dye, v_uv + vec2(cos(a), sin(a)) * u_diff_radius * DTEXEL);
    }
    vec4 avg = acc * 0.125;   // average of the 8 samples

    float speed = length(texture(u_velocity, v_uv).xy);

    float curl = 0.0;
    const float R = 1.5;
    curl += abs(texture(u_curl, v_uv).x);
    for (int i = 0; i < 8; ++i) {
        float a = 0.78539816 * float(i);
        curl += abs(texture(u_curl, v_uv + vec2(cos(a), sin(a)) * R * CT).x);
    }
    curl /= 9.0;

    float rate = min(u_diff_base + u_diff_curl * curl + u_diff_speed * speed, u_diff_max);
    float k = 1.0 - exp(-rate * u_dt);

    o = mix(c, avg, k);
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

// uniform float u_gain;
// uniform vec3 u_bg;
const float border_size = 0.0025;
void main() {
    bool is_border = v_uv.x < border_size || v_uv.x > (1.0 - border_size) ||
                     v_uv.y < border_size || v_uv.y > (1.0 - border_size);
    if (is_border) {
        o_color = vec4(1.0);
        return;
    }

    o_color = vec4(exp(-texture(u_dye, v_uv).rgb), 1.0);
}`;
// const vec2 D[8] = vec2[8](
//         vec2( 1.0,  0.0), vec2( 0.70710678,  0.70710678),
//         vec2( 0.0,  1.0), vec2(-0.70710678,  0.70710678),
//         vec2(-1.0,  0.0), vec2(-0.70710678, -0.70710678),
//         vec2( 0.0, -1.0), vec2( 0.70710678, -0.70710678));
//     vec2 grad = vec2(0.0);
//     for (int i = 0; i < 8; ++i)
//         grad += D[i] * ac(D[i] * u_radius);
