const gpu_vert = `
#version 300 es
layout(location = 0) in vec2 pos;
layout(location = 1) in uint id;
layout(location = 2) in vec2 uv;
layout(location = 3) in vec2 adj_uv1;
layout(location = 4) in vec2 adj_uv2;
layout(location = 5) in vec2 adj_uv3;
layout(location = 6) in uint hovered;

uniform mat4 u_view_proj;

flat out uint v_id;
out vec2 v_uv;
out vec2 v_adj_uv1;
out vec2 v_adj_uv2;
out vec2 v_adj_uv3;
flat out uint v_hovered;
out vec2 v_local_pos;

void main() {
    v_local_pos = pos;
    v_id = id;
    v_uv = uv;
    v_adj_uv1 = adj_uv1;
    v_adj_uv2 = adj_uv2;
    v_adj_uv3 = adj_uv3;
    v_hovered = hovered;
    gl_Position = u_view_proj * vec4(pos, 0.0, 1.0);
}`;

const gpu_frag = `
#version 300 es
precision highp float;
precision highp sampler2D;

flat in uint v_id;
in vec2 v_uv;
in vec2 v_adj_uv1;
in vec2 v_adj_uv2;
in vec2 v_adj_uv3;
flat in uint v_hovered;
in vec2 v_local_pos;

uniform sampler2D u_texture;
uniform sampler2D u_state_weights;
uniform sampler2D u_wcolor_dist;
uniform sampler2D u_hcolor;

uniform float u_blend_value;
uniform float u_wave_decay;
uniform float u_decay_min_radius;

out vec4 o_color;

void main() {
    vec2 p = abs(v_local_pos);
    float max_dist = max(p.x * 0.8660254 + p.y * 0.5, p.y);
    if (max_dist > 0.86235) {
        o_color = vec4(1.0, 1.0, 1.0, 1.0);
        return;
    }

    vec3 original_color = texture(u_texture, v_uv).rgb;
    float state = texture(u_state_weights, v_uv).r;

    vec4 wcolor_dist = texture(u_wcolor_dist, v_uv);
    vec3 wave_color = wcolor_dist.rgb;
    
    // float distance = wcolor_dist.a;
    // float decay_factor = u_blend_value * pow(u_wave_decay, max(distance - u_decay_min_radius - 1.0, 0.0));
    // decay_factor = clamp(decay_factor, 0.0, 1.0);

    float factor = smoothstep(0.0, 0.15, state);
    o_color = vec4(mix(original_color, wave_color, factor), 1.0);

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

const cpu_vert = `
#version 300 es
layout(location = 0) in vec2 pos;
layout(location = 1) in uint id;
layout(location = 2) in vec2 uv;

uniform mat4 u_view_proj;

flat out uint v_id;
out vec2 v_uv;
out vec2 v_local_pos;

void main() {
    v_local_pos = pos;
    v_id = id;
    v_uv = uv;
    gl_Position = u_view_proj * vec4(pos, 0.0, 1.0);
}`;

const cpu_frag = `
#version 300 es
precision highp float;
precision highp sampler2D;

flat in uint v_id;
in vec2 v_uv;
in vec2 v_local_pos;

uniform sampler2D u_texture;

out vec4 o_color;

void main() {
    vec2 p = abs(v_local_pos);
    float max_dist = max(p.x * 0.8660254 + p.y * 0.5, p.y);

    if (max_dist > 0.86235) {
        o_color = vec4(1.0, 1.0, 1.0, 1.0);
    }
    else {  
        o_color = texture(u_texture, v_uv);
    }
}`;

const state_vert = `
#version 300 es
layout(location = 0) in uint id;
layout(location = 1) in vec2 uv;
layout(location = 2) in vec2 adj_uv1;
layout(location = 3) in vec2 adj_uv2;
layout(location = 4) in vec2 adj_uv3;

flat out uint v_id;
out vec2 v_uv;
out vec2 v_adj_uv1;
out vec2 v_adj_uv2;
out vec2 v_adj_uv3;

void main() {
    v_id = id;
    v_uv = uv;
    v_adj_uv1 = adj_uv1;
    v_adj_uv2 = adj_uv2;
    v_adj_uv3 = adj_uv3;

    gl_Position = vec4(v_uv * 2.0 - 1.0, 0.0, 1.0);
    gl_PointSize = 1.0;
}`;

const state_frag = `
#version 300 es
precision highp float;
precision highp sampler2D;

flat in uint v_id;
in vec2 v_uv;
in vec2 v_adj_uv1;
in vec2 v_adj_uv2;
in vec2 v_adj_uv3;

uniform sampler2D u_state_weights;
uniform sampler2D u_wcolor_dist;

const float MAX_WEIGHT = ${max_weight.toFixed(1)};

uniform highp float u_delta_time;
uniform highp float u_state_rate;
uniform highp float u_weight_decay;
uniform highp float u_diffusion_rate;

layout(location = 0) out highp vec4 o_state_weights;
layout(location = 1) out highp vec4 o_wcolor_dist;

void main() {
    bool has_third = v_adj_uv3.x > -1.0;

    float this_state  = texture(u_state_weights, v_uv).r;
    float this_weight = texture(u_state_weights, v_uv).g;

    float s1 = texture(u_state_weights, v_adj_uv1).r;
    float s2 = texture(u_state_weights, v_adj_uv2).r;
    float s3 = has_third ? texture(u_state_weights, v_adj_uv3).r : 0.0;

    float nw1 = texture(u_state_weights, v_adj_uv1).g;
    float nw2 = texture(u_state_weights, v_adj_uv2).g;
    float nw3 = has_third ? texture(u_state_weights, v_adj_uv3).g : 0.0;

    float a1 = max(s1 - this_state, 0.0);
    float a2 = max(s2 - this_state, 0.0);
    float a3 = has_third ? max(s3 - this_state, 0.0) : 0.0;
    float total = a1 + a2 + a3;

    float w1, w2, w3;
    if (total > 0.0) {
        w1 = a1 / total; w2 = a2 / total; w3 = a3 / total;
    } else {
        float n = has_third ? 3.0 : 2.0;
        w1 = 1.0 / n; w2 = 1.0 / n; w3 = has_third ? 1.0 / n : 0.0;
    }

    float from_state = max(this_state, max(s1, s2));
    if (has_third) from_state = max(from_state, s3);
    float new_state = from_state - (from_state - this_state) * exp(-u_state_rate * u_delta_time);

    vec4 self_wd = texture(u_wcolor_dist, v_uv);
    vec4 wd1 = texture(u_wcolor_dist, v_adj_uv1);
    vec4 wd2 = texture(u_wcolor_dist, v_adj_uv2);
    vec4 wd3 = has_third ? texture(u_wcolor_dist, v_adj_uv3) : vec4(0.0);

    float decayed_weight = this_weight * exp(-u_weight_decay * u_delta_time);

    vec3 propagated_color;
    float new_weight;
    float new_distance;
    if (total > 0.0) {
        // contribution = state advantage * how much real colour the neighbor holds
        float c1 = a1 * nw1;
        float c2 = a2 * nw2;
        float c3 = a3 * nw3;
        float ct = c1 + c2 + c3;

        if (ct > 1e-9) {
            vec3 incoming_color = (c1 * wd1.rgb + c2 * wd2.rgb + c3 * wd3.rgb) / ct;
            float incoming_weight = total * u_delta_time;
            float blend_total = decayed_weight + incoming_weight;
            propagated_color = (self_wd.rgb * decayed_weight + incoming_color * incoming_weight) / blend_total;
            new_weight = min(blend_total, MAX_WEIGHT);
        } else {
            // ahead neighbors carry no real colour: don't pull anything in
            propagated_color = self_wd.rgb;
            new_weight = decayed_weight;
        }

        // ignore float-noise "advantage"
        const float EPS = 1e-6;
        float d = 1e9;
        if (a1 > EPS) d = min(d, wd1.a);
        if (a2 > EPS) d = min(d, wd2.a);
        if (has_third && a3 > EPS) d = min(d, wd3.a);
        new_distance = (d < 1e8) ? d + 1.0 : self_wd.a;
    } else {
        propagated_color = self_wd.rgb;
        new_distance = self_wd.a;
        new_weight = this_weight;
    }

    // unconditional diffusion pass — always runs, driven by neighbor weight
    // (not state advantage), so it actively mixes at the frontier where
    // advantage is near zero, but doesn't dilute low-weight/fresh neighbors
    float diffuse_total = nw1 + nw2 + nw3;
    vec3 diffuse_target = diffuse_total > 0.0
        ? (nw1 * wd1.rgb + nw2 * wd2.rgb + nw3 * wd3.rgb) / diffuse_total
        : propagated_color;

    //float diffusion_amount = clamp(u_diffusion_rate * u_delta_time, 0.0, 1.0);
    float diffusion_amount = 1.0 - exp(-u_diffusion_rate * u_delta_time);
    vec3 new_wcolor = mix(propagated_color, diffuse_target, diffusion_amount);

    o_wcolor_dist   = vec4(new_wcolor, new_distance);
    o_state_weights = vec4(new_state, new_weight, 0.0, 0.0);
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