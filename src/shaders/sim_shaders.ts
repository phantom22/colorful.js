const obst_glsl = `
uniform sampler2D tex_obstacles;
uniform int open_borders;      // 1 = fluid leaves freely, 0 = solid walls

float solid(vec2 uv) {
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0)
        return open_borders == 1 ? 0.0 : 1.0;
    return step(0.5, texture(tex_obstacles, uv).x);
}

vec2 trace(vec2 uv, vec2 disp) {
    vec2 p = uv;
    for (int i = 0; i < 4; ++i) {
        vec2 n = p - disp * 0.25;
        if (solid(n) > 0.5) break;
        p = n;
    }
    return p;
}

// open borders only: remove inward-pointing velocity on the outermost texel
vec2 edge_valve(vec2 v, vec2 uv) {
    if (open_borders != 1) return v;
    vec2 e = min(uv, 1.0 - uv) / TEXEL;
    if (uv.x < 0.5 && e.x < 1.5 && v.x > 0.0) v.x = 0.0;
    if (uv.x > 0.5 && e.x < 1.5 && v.x < 0.0) v.x = 0.0;
    if (uv.y < 0.5 && e.y < 1.5 && v.y > 0.0) v.y = 0.0;
    if (uv.y > 0.5 && e.y < 1.5 && v.y < 0.0) v.y = 0.0;
    return v;
}`;

const quad_vert = `
#version 300 es
out vec2 v_uv;
void main() {
    vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
    v_uv = p;
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const sh_checkerboard_fill = `
#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;

uniform vec2 dims;
uniform vec3 color_a;
uniform vec3 color_b;
void main() {
    vec2 c = floor(v_uv * dims);
    float checker = mod(c.x + c.y, 2.0);
    o = vec4(mix(-log(color_a), -log(color_b), checker), 1.0);
}`;

const sh_curl_velocity_noise = `
#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;

const float ASPECT = ${ASPECT};
uniform float seed;
uniform float scale;   // base frequency
uniform float amp;     // texels/s
uniform float div_mix; // 0..0.5 share of curl-free part

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21) + seed);
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}
float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {                      // 4 octaves, smooth
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
    return s;
}
float field(vec2 uv) { return fbm(uv * vec2(ASPECT, 1.0) * scale); }

void main() {
    const float e = 0.002;
    float dx = field(v_uv + vec2(e, 0.0)) - field(v_uv - vec2(e, 0.0));
    float dy = field(v_uv + vec2(0.0, e)) - field(v_uv - vec2(0.0, e));
    vec2 g = vec2(dx, dy) / (2.0 * e);
    vec2 curl = vec2(g.y, -g.x);                    // divergence-free
    vec2 v = mix(curl, g, div_mix) * amp / (scale * 4.0);
    o = vec4(v, 0.0, 1.0);
}`;

const sh_splat = `
#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
out vec4 o;

uniform sampler2D tex_obstacles;
uniform int open_borders;
float solid(vec2 uv) {
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0)
        return open_borders == 1 ? 0.0 : 1.0;
    return step(0.5, texture(tex_obstacles, uv).x);
}

const float ASPECT = ${ASPECT};

uniform sampler2D tex_source;
uniform vec2 point;
uniform vec2 prev;
uniform vec4 value;         // color or velocity
uniform float brush_radius; 
uniform float brush_strength;
uniform float additive;     // 1.0 or 0.0
void main() {
    vec2 s  = vec2(ASPECT, 1.0);
    vec2 pa = (v_uv - prev) * s, ba = (point - prev) * s;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
    vec2 d = pa - ba * h;                          // distance to the segment
    float w = clamp(exp(-dot(d, d) / brush_radius) * brush_strength, 0.0, 1.0);
    w *= 1.0 - solid(v_uv);
    
    vec4 old = texture(tex_source, v_uv);
    o = additive > 0.5 ? old + w * value : mix(old, value, w);
}`;

const sh_obstacle_splat = `
#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;

const float ASPECT = ${ASPECT};

uniform vec2 point;
uniform vec2 prev;
uniform float brush_radius;    // uv units (not squared), the contour sits at this distance
uniform float outline_width;   // uv units, about 3 sim texels so the contour is smooth
uniform float erase;     // 0 draw, 1 erase
void main() {
    vec2 s  = vec2(ASPECT, 1.0);
    vec2 pa = (v_uv - prev) * s, ba = (point - prev) * s;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
    float d = length(pa - ba * h);
    float w = 1.0 - smoothstep(brush_radius - outline_width, brush_radius + outline_width, d);
    o = vec4(erase > 0.5 ? 1.0 - w : w);
}`;

const sh_sim_velocity_advect = `
#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
const vec2 TEXEL = vec2(${TEXEL});
out vec4 o;

${obst_glsl}

uniform sampler2D tex_velocity;
uniform float dt;
uniform float dissipation;   // exp(-rate * dt), 1.0 = none
void main() {
    if (solid(v_uv) > 0.5) { o = texture(tex_velocity, v_uv); return; }

    vec2 lo = 0.5 * TEXEL, hi = 1.0 - 0.5 * TEXEL;
    vec2 disp = dt * texture(tex_velocity, v_uv).xy * TEXEL;

    vec2 back = clamp(trace(v_uv, disp), lo, hi);
    vec4 fwd  = texture(tex_velocity, back);

    // footprint of the 4 texels around 'back'
    vec2 c0 = (floor(back / TEXEL - 0.5) + 0.5) * TEXEL;
    vec2 f[4] = vec2[4](c0, c0 + vec2(TEXEL.x, 0.0), c0 + vec2(0.0, TEXEL.y), c0 + TEXEL);

    bool near_wall = solid(v_uv + disp) > 0.5 || solid(v_uv - disp) > 0.5;
    vec4 mn = vec4(1e9), mx = vec4(-1e9);
    for (int i = 0; i < 4; ++i) {
        if (solid(f[i]) > 0.5) { near_wall = true; continue; }
        vec4 s = texture(tex_velocity, f[i]);
        mn = min(mn, s);
        mx = max(mx, s);
    }

    vec4 mc = fwd;
    if (!near_wall) {
        vec2 p = clamp(v_uv + disp, lo, hi);                       // plain forward point, no wall stop
        vec2 q = clamp(p - dt * texture(tex_velocity, p).xy * TEXEL, lo, hi);
        if (solid(q) < 0.5)
            mc = clamp(fwd + 0.5 * (texture(tex_velocity, v_uv) - texture(tex_velocity, q)), mn, mx);
    }

    o = dissipation * mc;
}`;

const sh_sim_dye_advect = `
#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
out vec4 o;

const vec2 TEXEL  = vec2(${TEXEL});
const vec2 DTEXEL = vec2(${DYE_TEXEL});

${obst_glsl}

uniform sampler2D tex_velocity;
uniform sampler2D tex_dye;
uniform float dt;
uniform float dissipation;
uniform vec3 bg_log;          // background in log encoding

bool outside(vec2 p) { return p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0; }

void main() {
    if (solid(v_uv) > 0.5) {
        vec4 acc = vec4(0.0); float n = 0.0;
        for (int i = 0; i < 8; ++i) {
            float a = 0.7853982 * float(i);
            vec2 t = v_uv + vec2(cos(a), sin(a)) * 4.0 * DTEXEL;
            if (solid(t) < 0.5) { acc += texture(tex_dye, t); n += 1.0; }
        }
        o = n > 0.0 ? acc / n : texture(tex_dye, v_uv);
        return;
    }

    vec2 disp = dt * texture(tex_velocity, v_uv).xy * TEXEL;
    vec2 back = trace(v_uv, disp);
    if (outside(back)) { o = vec4(bg_log, 1.0); return; }   // clean dye flows in

    vec4 fwd = texture(tex_dye, back);
    vec4 mc = fwd;
    vec2 p = v_uv + disp;
    if (!outside(p) && solid(p) < 0.5) {
        vec2 q = trace(p, dt * texture(tex_velocity, p).xy * TEXEL);
        if (!outside(q))
            mc = fwd + 0.5 * (texture(tex_dye, v_uv) - texture(tex_dye, q));
    }

    vec2 st = back / DTEXEL - 0.5;
    vec2 c0 = (floor(st) + 0.5) * DTEXEL;
    vec4 a = texture(tex_dye, c0);
    vec4 b = texture(tex_dye, c0 + vec2(DTEXEL.x, 0.0));
    vec4 c = texture(tex_dye, c0 + vec2(0.0, DTEXEL.y));
    vec4 d = texture(tex_dye, c0 + DTEXEL);
    mc = clamp(mc, min(min(a, b), min(c, d)), max(max(a, b), max(c, d)));

    o = dissipation * mc;
}`;

const sh_forcefield = (user?:string) => `
#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
out vec4 o;

const float ASPECT = ${ASPECT};
const vec2 TEXEL = vec2(${TEXEL});

${obst_glsl}

uniform sampler2D tex_velocity;
uniform float replace;   // 1.0 = write the field, 0.0 = add to the velocity
uniform vec2  center_worldpos;
uniform float window_width;
uniform float force_strength;
uniform float dt;
uniform float relax;
uniform float time;

${user || FORCE_FIELD_DEFAULT}

void main() {
    if (solid(v_uv) > 0.5) { o = texture(tex_velocity, v_uv); return; }
    vec2 p = ((vec2(0.5) - v_uv) * window_width * 0.5) * vec2(ASPECT, 1.0) + center_worldpos;
    
    vec2 F = get_velocity(p) * force_strength;
    vec4 old = texture(tex_velocity, v_uv);
    float k = 1.0 - exp(-relax * dt);
    vec2 v = replace > 0.5 ? F : (relax < 0.0 ?  old.xy + F * dt : mix(old.xy, F, 1.0 - exp(-relax * dt)));
    o = vec4(edge_valve(v, v_uv), old.zw);
}`;

const sh_sim_curl = `
#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
const vec2 TEXEL = vec2(${TEXEL});
out vec4 o;

${obst_glsl}

uniform sampler2D tex_velocity;

vec2 V(vec2 uv) {
    return texture(tex_velocity, clamp(uv, 0.5 * TEXEL, 1.0 - 0.5 * TEXEL)).xy;
}

void main() {
    float L = V(v_uv - vec2(TEXEL.x, 0.0)).y;
    float R = V(v_uv + vec2(TEXEL.x, 0.0)).y;
    float B = V(v_uv - vec2(0.0, TEXEL.y)).x;
    float T = V(v_uv + vec2(0.0, TEXEL.y)).x;

    float c = 0.5 * (R - L - T + B);
    vec2 edge = min(v_uv, 1.0 - v_uv) / TEXEL;
    bool near_wall = min(edge.x, edge.y) < 2.0;
    for (int i = -1; i <= 1 && !near_wall; ++i) {
        if (solid(v_uv + vec2(float(i), 0.0) * TEXEL) > 0.5 ||
            solid(v_uv + vec2(0.0, float(i)) * TEXEL) > 0.5) near_wall = true;
    }
    o = vec4(near_wall ? 0.0 : c, 0.0, 0.0, 1.0);
}`;

const sh_blur = `
#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
const vec2 TEXEL = vec2(${TEXEL});
out vec4 o;

uniform sampler2D tex_source;
void main() {
    float s = 0.0;
    for (int y = -1; y <= 1; ++y)
        for (int x = -1; x <= 1; ++x) {
            float w = (x == 0 ? 2.0 : 1.0) * (y == 0 ? 2.0 : 1.0);
            s += w * texture(tex_source, v_uv + vec2(x, y) * TEXEL).x;
        }
    o = vec4(s / 16.0, 0.0, 0.0, 1.0);
}`;

const sh_sim_vorticity_confinement = `
#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
const vec2 TEXEL = vec2(${TEXEL});
out vec4 o;

${obst_glsl}

uniform sampler2D tex_velocity;
uniform sampler2D tex_curl;
uniform float curl_strength;
uniform float dt;
uniform float max_force;
uniform float max_velocity;
void main() {
    if (solid(v_uv) > 0.5) { o = texture(tex_velocity, v_uv); return; }
    float L = texture(tex_curl, v_uv - vec2(TEXEL.x, 0.0)).x;
    float R = texture(tex_curl, v_uv + vec2(TEXEL.x, 0.0)).x;
    float B = texture(tex_curl, v_uv - vec2(0.0, TEXEL.y)).x;
    float T = texture(tex_curl, v_uv + vec2(0.0, TEXEL.y)).x;
    float C = texture(tex_curl, v_uv).x;

    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
    force /= length(force) + 1e-4;
    force *= curl_strength * C;
    force.y *= -1.0;

    float fm = length(force);
    if (fm > max_force) force *= max_force / fm;     // cap the injected energy

    vec2 v = texture(tex_velocity, v_uv).xy + force * dt;
    float sp = length(v);
    if (sp > max_velocity) v *= max_velocity / sp;
    o = vec4(edge_valve(v, v_uv), 0.0, 1.0);
}`;

const sh_sim_divergence = `
#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
const vec2 TEXEL = vec2(${TEXEL});
out vec4 o;

${obst_glsl}

uniform sampler2D tex_velocity;

vec2 V(vec2 uv) {
    return texture(tex_velocity, clamp(uv, 0.5 * TEXEL, 1.0 - 0.5 * TEXEL)).xy;
}

void main() {
    if (solid(v_uv) > 0.5) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
    vec2 C = V(v_uv);
    float L = V(v_uv - vec2(TEXEL.x, 0.0)).x;
    float R = V(v_uv + vec2(TEXEL.x, 0.0)).x;
    float B = V(v_uv - vec2(0.0, TEXEL.y)).y;
    float T = V(v_uv + vec2(0.0, TEXEL.y)).y;
    if (solid(v_uv - vec2(TEXEL.x, 0.0)) > 0.5) L = -C.x;
    if (solid(v_uv + vec2(TEXEL.x, 0.0)) > 0.5) R = -C.x;
    if (solid(v_uv - vec2(0.0, TEXEL.y)) > 0.5) B = -C.y;
    if (solid(v_uv + vec2(0.0, TEXEL.y)) > 0.5) T = -C.y;
    o = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

const sh_sim_pressure_jacobi = `
#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
const vec2 TEXEL = vec2(${TEXEL});
out vec4 o;

${obst_glsl}

uniform sampler2D tex_pressure;
uniform sampler2D tex_divergence;

float P(vec2 uv) {
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
    return texture(tex_pressure, uv).x;
}

void main() {
    float C = texture(tex_pressure, v_uv).x;
    vec2 uL = v_uv - vec2(TEXEL.x, 0.0), uR = v_uv + vec2(TEXEL.x, 0.0);
    vec2 uB = v_uv - vec2(0.0, TEXEL.y), uT = v_uv + vec2(0.0, TEXEL.y);
    float L = P(uL), R = P(uR), B = P(uB), T = P(uT);
    if (solid(uL) > 0.5) L = C;   // walls reflect (Neumann)
    if (solid(uR) > 0.5) R = C;
    if (solid(uB) > 0.5) B = C;
    if (solid(uT) > 0.5) T = C;
    float div = texture(tex_divergence, v_uv).x;
    float p = (L + R + B + T - div) * 0.25;
    o = vec4(solid(v_uv) > 0.5 ? 0.0 : p, 0.0, 0.0, 1.0);
}`;

const sh_sim_gradient_subtract = `
#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
const vec2 TEXEL = vec2(${TEXEL});
out vec4 o;

${obst_glsl}

uniform sampler2D tex_pressure;
uniform sampler2D tex_velocity;

float P(vec2 uv) {
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
    return texture(tex_pressure, uv).x;
}

void main() {
    if (solid(v_uv) > 0.5) {
        const vec2 N[4] = vec2[4](vec2(1.0, 0.0), vec2(-1.0, 0.0), vec2(0.0, 1.0), vec2(0.0, -1.0));
        vec2 acc = vec2(0.0); float n = 0.0;
        for (int i = 0; i < 4; ++i) {
            vec2 uv = v_uv + N[i] * TEXEL;
            if (solid(uv) < 0.5) {
                vec2 u = texture(tex_velocity, uv).xy;
                u -= 2.0 * dot(u, N[i]) * N[i];      // mirror the wall-normal part
                acc += u; n += 1.0;
            }
        }
        o = vec4(n > 0.0 ? acc / n : vec2(0.0), 0.0, 1.0);
        return;
    }
    float C = texture(tex_pressure, v_uv).x;
    vec2 uL = v_uv - vec2(TEXEL.x, 0.0), uR = v_uv + vec2(TEXEL.x, 0.0);
    vec2 uB = v_uv - vec2(0.0, TEXEL.y), uT = v_uv + vec2(0.0, TEXEL.y);
    float L = P(uL), R = P(uR), B = P(uB), T = P(uT);
    float sL = solid(uL), sR = solid(uR), sB = solid(uB), sT = solid(uT);
    if (sL > 0.5) L = C;
    if (sR > 0.5) R = C;
    if (sB > 0.5) B = C;
    if (sT > 0.5) T = C;
    vec2 v = texture(tex_velocity, v_uv).xy - 0.5 * vec2(R - L, T - B);
    if (sL > 0.5 && v.x < 0.0) v.x = 0.0;     // only remove flow INTO the wall
    if (sR > 0.5 && v.x > 0.0) v.x = 0.0;
    if (sB > 0.5 && v.y < 0.0) v.y = 0.0;
    if (sT > 0.5 && v.y > 0.0) v.y = 0.0;
    o = vec4(edge_valve(v, v_uv), 0.0, 1.0);
}`;

const sh_scale = `
#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
out vec4 o;

uniform sampler2D tex_source;
uniform float value;
void main() {
    o = value * texture(tex_source, v_uv);
}`;

const sh_sim_diffusion_pass = `
#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
out vec4 o;

const vec2 DTEXEL = vec2(${DYE_TEXEL});
const vec2 TEXEL = vec2(${TEXEL});

${obst_glsl}

uniform sampler2D tex_dye;
uniform sampler2D tex_curl;
uniform sampler2D tex_velocity;
uniform float dt;
uniform float base_diffusion;
uniform float curl_diffusion;
uniform float velocity_diffusion;
uniform float max_diffusion;
uniform float diffusion_radius;
void main() {
    vec4 c = texture(tex_dye, v_uv);

    if (solid(v_uv) > 0.5) { o = c; return; }
    vec4 acc = vec4(0.0);
    for (int i = 0; i < 8; ++i) {
        float a = 0.78539816 * float(i);
        vec2 tuv = v_uv + vec2(cos(a), sin(a)) * diffusion_radius * DTEXEL;
        acc += solid(tuv) > 0.5 ? c : texture(tex_dye, tuv);
    }
    vec4 avg = acc * 0.125;

    float curl = 0.0;
    const float R = 1.5;
    curl += abs(texture(tex_curl, v_uv).x);
    for (int i = 0; i < 8; ++i) {
        float a = 0.78539816 * float(i);
        curl += abs(texture(tex_curl, v_uv + vec2(cos(a), sin(a)) * R * TEXEL).x);
    }
    curl /= 9.0;

    float speed = length(texture(tex_velocity, v_uv).xy);

    float rate = min(base_diffusion + curl_diffusion * curl + velocity_diffusion * speed, max_diffusion);
    float k = 1.0 - exp(-rate * dt);

    o = mix(c, avg, k);
}`;

const quad_frag = `
#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
out vec4 o_color;

uniform sampler2D tex_source;
uniform sampler2D tex_obstacles;
uniform int   source_kind;      // 0 dye, 1 vector, 2 scalar
uniform int   palette_type;   // 0 viridis, 1 hsv, 2 turbo, 3 diverging
uniform int   blur_type;      // 0 none, 1 cross (5 taps), 2 3x3 binomial
uniform float reference_value;       // value that maps to ~63% of the palette
uniform float value_rescale_threshold;    // optional low-end boost: below this t is multiplied by rescale_factor
uniform float rescale_factor;

const float border_size = 0.0025;

vec3 viridis(float t) {
    const vec3 c0 = vec3( 0.2777273272, 0.0054073445, 0.3340998053);
    const vec3 c1 = vec3( 0.1050930431, 1.4046135299, 1.3845901626);
    const vec3 c2 = vec3(-0.3308618287, 0.2148475595, 0.0950951630);
    const vec3 c3 = vec3(-4.6342304990, -5.7991009734, -19.3324409563);
    const vec3 c4 = vec3( 6.2282699363, 14.1799333668, 56.6905526007);
    const vec3 c5 = vec3( 4.7763849977, -13.7451453777, -65.3530326334);
    const vec3 c6 = vec3(-5.4354558559, 4.6458526122, 26.3124352496);
    t = clamp(t, 0.0, 1.0);
    return clamp(c0 + t*(c1 + t*(c2 + t*(c3 + t*(c4 + t*(c5 + t*c6))))), 0.0, 1.0);
}

vec3 turbo(float t) {
    const vec3 c0 = vec3( 0.1140890109226559,  0.0628695634080640,  0.2248337216805064);
    const vec3 c1 = vec3( 6.7164229920571770,  3.1822388403381930,  7.5716115621591610);
    const vec3 c2 = vec3(-66.094357461,        -4.9279827041226,   -10.0943099286);
    const vec3 c3 = vec3( 228.7660791526501,   25.04986699771073,  -91.54105330182436);
    const vec3 c4 = vec3(-334.8351565777451,  -69.31749712757485,   288.5858850615712);
    const vec3 c5 = vec3( 218.7637218434795,   67.52150567819112,  -305.2045772184957);
    const vec3 c6 = vec3(-52.88903478218835,  -21.54527364654712,   110.5174647748972);
    t = clamp(t, 0.0, 1.0);
    return clamp(c0 + t*(c1 + t*(c2 + t*(c3 + t*(c4 + t*(c5 + t*c6))))), 0.0, 1.0);
}

vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

vec3 diverging(float s) {            // s in [-1, 1]: blue, white, red
    return s < 0.0 ? mix(vec3(1.0), vec3(0.15, 0.3, 0.9), -s)
                   : mix(vec3(1.0), vec3(0.9, 0.2, 0.1),  s);
}

vec4 sample_blurred(vec2 uv) {
    if (blur_type == 0) return texture(tex_source, uv);
    vec2 t = 1.0 / vec2(textureSize(tex_source, 0));   // texel size of THIS texture
    if (blur_type == 1) {
        return (4.0 * texture(tex_source, uv)
              + texture(tex_source, uv + vec2( t.x, 0.0))
              + texture(tex_source, uv + vec2(-t.x, 0.0))
              + texture(tex_source, uv + vec2(0.0,  t.y))
              + texture(tex_source, uv + vec2(0.0, -t.y))) * 0.125;
    }
    vec4 s = vec4(0.0);
    for (int y = -1; y <= 1; ++y)
        for (int x = -1; x <= 1; ++x) {
            float w = (x == 0 ? 2.0 : 1.0) * (y == 0 ? 2.0 : 1.0);
            s += w * texture(tex_source, uv + vec2(x, y) * t);
        }
    return s * (1.0 / 16.0);
}

vec3 palette(float t, float hue) {
    if (palette_type == 0) return viridis(t);
    if (palette_type == 1) return hsv2rgb(vec3(hue, 1.0, t));
    return turbo(t);
}

vec3 get_color() {
    vec4 s = sample_blurred(v_uv);

    if (source_kind == 0) {
        return exp(-s.rgb);
    }

    float mag, hue;
    if (source_kind == 1) {
        mag = length(s.xy);
        hue = mag > 1e-4 ? atan(s.y, s.x) / 6.2831853 + 0.5 : 0.0;
    } else {
        mag = abs(s.x);
        hue = s.x < 0.0 ? 0.6 : 0.0;
    }

    float t = 1.0 - exp(-mag / reference_value);
    t = t < value_rescale_threshold ? t * rescale_factor : t;

    if (palette_type == 3 && source_kind == 2) {
        return diverging(sign(s.x) * t);
    }

    return palette(t, hue);
}

const float EDGE_PX = 2.5;
const vec3 EDGE_COLOR = vec3(0.5);
void main() {
    float s  = texture(tex_obstacles, v_uv).x;
    float aa = max(fwidth(s), 1e-5);
    float d  = (s - 0.5) / aa;

    vec3 col = get_color();

    float inside = clamp(d + 0.5, 0.0, 1.0);                  // anti-aliased mask
    float rim = 1.0 - smoothstep(EDGE_PX - 1.0, EDGE_PX, d);
    vec3 wall = mix(vec3(0.0), EDGE_COLOR, rim);              // black core, white rim
    o_color = vec4(mix(col, wall, inside), 1.0);
}`;


// const vec2 D[8] = vec2[8](
//         vec2( 1.0,  0.0), vec2( 0.70710678,  0.70710678),
//         vec2( 0.0,  1.0), vec2(-0.70710678,  0.70710678),
//         vec2(-1.0,  0.0), vec2(-0.70710678, -0.70710678),
//         vec2( 0.0, -1.0), vec2( 0.70710678, -0.70710678));

//     vec2 grad = vec2(0.0);
//     for (int i = 0; i < 8; ++i)
//         grad += D[i] * ac(D[i] * brush_radius);