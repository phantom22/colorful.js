"use strict";
const main_vert = `
#version 300 es
layout(location = 0) in vec2 pos;
layout(location = 1) in vec2 uv;
layout(location = 2) in uint hovered;

uniform mat4 u_view_proj;

out vec2 v_uv;
flat out uint v_hovered;
out vec2 v_local_pos;

void main() {
    v_local_pos = pos;
    v_uv = uv;
    v_hovered = hovered;
    gl_Position = u_view_proj * vec4(pos, 0.0, 1.0);
}`;
const main_esagonal_frag = `
#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 v_uv;
flat in uint v_hovered;
in vec2 v_local_pos;

uniform sampler2D u_dye;
uniform sampler2D u_hcolor;

out vec4 o_color;

void main() {
    vec2 p = abs(v_local_pos);
    float max_dist = max(p.x * 0.8660254 + p.y * 0.5, p.y);
    if (max_dist > 0.86235) {
        o_color = vec4(1.0, 1.0, 1.0, 1.0);
        return;
    }

    o_color = vec4(texture(u_dye, v_uv).rgb, 1.0);

    if (v_hovered == 1u) {
        vec3 hcolor = texture(u_hcolor, v_uv).rgb;

        // tint toward the stroke colour
        vec3 tinted = mix(o_color.rgb, hcolor, 0.6);

        // then keep your contrast rule, based on the tinted result
        float lum = dot(tinted, vec3(0.299, 0.587, 0.114));
        tinted = lum > 0.5 ? tinted * 0.6
                        : mix(tinted, vec3(1.0), 0.35);

        o_color = vec4(tinted, 1.0);
    }
}`;
const main_square_frag = `
#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 v_uv;
flat in uint v_hovered;
in vec2 v_local_pos;

uniform sampler2D u_dye;
uniform sampler2D u_hcolor;

out vec4 o_color;

void main() {
    vec2 p = abs(v_local_pos);
    float max_dist = max(p.x, p.y);
    if (max_dist > 0.497) { // adjust the threshold (0.5) to change the square size
        o_color = vec4(1.0, 1.0, 1.0, 1.0);
        return;
    }

    o_color = vec4(texture(u_dye, v_uv).rgb, 1.0);

    if (v_hovered == 1u) {
        vec3 hcolor = texture(u_hcolor, v_uv).rgb;

        // tint toward the stroke colour
        vec3 tinted = mix(o_color.rgb, hcolor, 0.6);

        // then keep your contrast rule, based on the tinted result
        float lum = dot(tinted, vec3(0.299, 0.587, 0.114));
        tinted = lum > 0.5 ? tinted * 0.6
                        : mix(tinted, vec3(1.0), 0.35);

        o_color = vec4(tinted, 1.0);
    }
}`;
const state_vert = `
#version 300 es
layout(location = 0) in vec2 uv;
layout(location = 1) in vec2 adj_uv1;
layout(location = 2) in vec2 adj_uv2;
layout(location = 3) in vec2 adj_uv3;

out vec2 v_uv;
out vec2 v_adj_uv1;
out vec2 v_adj_uv2;
out vec2 v_adj_uv3;

void main() {
    v_uv = uv;
    v_adj_uv1 = adj_uv1;
    v_adj_uv2 = adj_uv2;
    v_adj_uv3 = adj_uv3;

    gl_Position = vec4(v_uv * 2.0 - 1.0, 0.0, 1.0);
    gl_PointSize = 1.0;
}`;
const mask_vert = `
#version 300 es
layout(location = 0) in vec2 pos;
layout(location = 1) in uint id;

uniform mat4 u_view_proj;

flat out uint v_id;

void main() {
    v_id = id;
    gl_Position = u_view_proj * vec4(pos, 0.0, 1.0);
}`;
const mask_frag = `
#version 300 es
precision highp float;
precision highp int;

flat in uint v_id;

out uint o_color;

void main() {
    o_color = v_id;
}`;
const sym_force_and_damping = `
#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 v_uv;
in vec2 v_adj_uv1;
in vec2 v_adj_uv2;
in vec2 v_adj_uv3;

uniform sampler2D u_flux;
uniform float u_delta_time, u_gain, u_drag, u_phi_decay, u_phi_diffusion;
layout(location = 0) out vec4 o_flux;

void main() {
    bool h3 = v_adj_uv3.x > -1.0;
    vec4 f  = texture(u_flux, v_uv);
    float phi  = f.a;
    float phi1 = texture(u_flux, v_adj_uv1).a;
    float phi2 = texture(u_flux, v_adj_uv2).a;
    float phi3 = h3 ? texture(u_flux, v_adj_uv3).a : 0.0;

    vec3 nf = f.rgb + u_delta_time * u_gain *
              vec3(phi - phi1, phi - phi2, h3 ? phi - phi3 : 0.0);
    nf *= exp(-u_drag * u_delta_time);

    // diffuse φ toward the neighbor average (stable: blend factor < 1)
    float avg = (phi1 + phi2 + phi3) / (h3 ? 3.0 : 2.0);
    float nphi = mix(phi, avg, 1.0 - exp(-u_phi_diffusion * u_delta_time));
    nphi *= exp(-u_phi_decay * u_delta_time);

    o_flux = vec4(nf, nphi);
}`;
const sym_pressure_jacobi = `
#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 v_uv;
in vec2 v_adj_uv1;
in vec2 v_adj_uv2;
in vec2 v_adj_uv3;

uniform sampler2D u_flux, u_pressure;
layout(location = 0) out vec4 o_pressure;

void main() {
    bool h3 = v_adj_uv3.x > -1.0;
    vec4 f = texture(u_flux, v_uv);
    float div = f.r + f.g + (h3 ? f.b : 0.0);
    float p1 = texture(u_pressure, v_adj_uv1).r;
    float p2 = texture(u_pressure, v_adj_uv2).r;
    float p3 = h3 ? texture(u_pressure, v_adj_uv3).r : 0.0;
    o_pressure = vec4((p1 + p2 + p3 + div) / (h3 ? 3.0 : 2.0), 0.0, 0.0, 1.0);
}`;
const sym_gradient_subtract = `
#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 v_uv;
in vec2 v_adj_uv1;
in vec2 v_adj_uv2;
in vec2 v_adj_uv3;

uniform sampler2D u_flux, u_pressure;
layout(location = 0) out vec4 o_flux;

void main() {
    bool h3 = v_adj_uv3.x > -1.0;
    vec4 f = texture(u_flux, v_uv);
    float p  = texture(u_pressure, v_uv).r;
    float p1 = texture(u_pressure, v_adj_uv1).r;
    float p2 = texture(u_pressure, v_adj_uv2).r;
    float p3 = h3 ? texture(u_pressure, v_adj_uv3).r : 0.0;
    o_flux = vec4(f.r - (p - p1), f.g - (p - p2), h3 ? f.b - (p - p3) : 0.0, f.a);
}
`;
const sym_dye_advection = `
#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 v_uv;
in vec2 v_adj_uv1;
in vec2 v_adj_uv2;
in vec2 v_adj_uv3;

uniform sampler2D u_flux, u_dye, u_inject;
uniform float u_delta_time, u_dye_diffusion, u_inject_rate, u_inject_duration,
        u_inject_spread, u_inject_max;

layout(location = 0) out vec4 o_dye;
layout(location = 1) out vec4 o_inject;

void main() {
    bool h3 = v_adj_uv3.x > -1.0;
    vec4 f = texture(u_flux, v_uv);
    vec3 c  = texture(u_dye, v_uv).rgb;
    vec3 c1 = texture(u_dye, v_adj_uv1).rgb;
    vec3 c2 = texture(u_dye, v_adj_uv2).rgb;
    vec3 c3 = h3 ? texture(u_dye, v_adj_uv3).rgb : c;

    vec3 k = u_delta_time * vec3(max(-f.r, 0.0), max(-f.g, 0.0), h3 ? max(-f.b, 0.0) : 0.0);
    float s = k.x + k.y + k.z;
    if (s > 1.0) k /= s;          // CFL clamp: keeps this a convex combination

    vec3 nc = c + k.x * (c1 - c) + k.y * (c2 - c) + k.z * (c3 - c);
    vec3 avg = (c1 + c2 + (h3 ? c3 : vec3(0.0))) / (h3 ? 3.0 : 2.0);
    float a = 1.0 - exp(-u_dye_diffusion * u_delta_time);
    nc = mix(nc, avg, a);

    vec4 inj = texture(u_inject, v_uv);
    vec4 i1  = texture(u_inject, v_adj_uv1);
    vec4 i2  = texture(u_inject, v_adj_uv2);
    vec4 i3  = h3 ? texture(u_inject, v_adj_uv3) : vec4(0.0);

    // 1. spread the source: alpha-weighted color, averaged alpha
    float aw = inj.a + i1.a + i2.a + i3.a;
    vec3 scol = aw > 1e-6
        ? (inj.rgb * inj.a + i1.rgb * i1.a + i2.rgb * i2.a + i3.rgb * i3.a) / aw
        : inj.rgb;
    float aavg = (i1.a + i2.a + i3.a) / (h3 ? 3.0 : 2.0);
    float sp   = 1.0 - exp(-u_inject_spread * u_delta_time);
    float na   = mix(inj.a, aavg, sp);
    vec3  ncol = mix(inj.rgb, scol, sp);

    // 2. let the source color drift toward the local dye (frame-rate independent)
    ncol = mix(ncol, nc, 1.0 - exp(-2.0 * u_delta_time));

    // 3. eased, capped pull: weak at the edges of the source, never fully overrides
    float pull = u_inject_max * smoothstep(0.0, 1.0, na)
            * (1.0 - exp(-u_inject_rate * u_delta_time));
    nc = mix(nc, ncol, pull);

    o_inject = vec4(ncol, max(na - u_delta_time / u_inject_duration, 0.0));
    o_dye = vec4(nc, 1.0);
}
`;
