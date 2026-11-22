/* Multigrid pressure solver, see multigrid.ts.
 *
 * Every level solves  sum_f w_f * (x_nb - x) = b  with one fragment per cell.
 * w_f (RGBA8: left, right, bottom, top) is how open each cell face is: 1 open,
 * 0 wall or closed border, fractions on coarse levels where a face is partly
 * blocked. A cell with no open face is solid and holds 0.
 *
 * Open borders are Dirichlet (pressure 0 half a sim cell past the edge). A
 * face to the texture edge then links to a ghost cell holding ghost * x; it is
 * applied implicitly (moved onto the diagonal), which keeps every sweep stable
 * however strong the ghost is. Coarse grids are rounded up, so they can
 * overhang the far edges: cells at or past `extent` lie beyond the zero point
 * and are held at 0. See mg_edges() for both.
 *
 * Everything is addressed with texelFetch, so the shaders don't depend on the
 * TEXEL uniform and work at any level's size. */
const mg_glsl = `
#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
out vec4 o;

uniform vec2 extent;      // cells at or past this hold 0 (overhang past an open edge)
uniform float ghost_lo;   // ghost factor at the left / bottom edge
uniform vec2 ghost_hi;    // ghost factor at the right / top edge

bool inactive(ivec2 p) { return any(greaterThanEqual(vec2(p), extent)); }

// one face: (w * x_neighbour, diagonal contribution)
vec2 face(sampler2D x, ivec2 q, ivec2 n, float w, float g, float s) {
    if (w == 0.0) return vec2(0.0);
    if (any(lessThan(q, ivec2(0))) || any(greaterThanEqual(q, n))) return vec2(0.0, w * (1.0 - g));
    return vec2(w * s * texelFetch(x, q, 0).x, w);
}

// (weighted neighbour sum, diagonal). s scales every x read.
vec2 neighbours(sampler2D x, sampler2D w, ivec2 p, ivec2 n, float s) {
    vec4 k = texelFetch(w, p, 0);
    return face(x, p - ivec2(1, 0), n, k.x, ghost_lo,   s)
         + face(x, p + ivec2(1, 0), n, k.y, ghost_hi.x, s)
         + face(x, p - ivec2(0, 1), n, k.z, ghost_lo,   s)
         + face(x, p + ivec2(0, 1), n, k.w, ghost_hi.y, s);
}
`;

/** damped Jacobi sweep. x_scale multiplies the incoming solution: 0 starts a
 * coarse level from zero, jacobi_scale decays last frame's pressure. */
const sh_mg_smooth = `${mg_glsl}
uniform sampler2D tex_x;
uniform sampler2D tex_b;
uniform sampler2D tex_w;
uniform float x_scale;
uniform float omega;

void main() {
    ivec2 p = ivec2(gl_FragCoord.xy), n = textureSize(tex_x, 0);
    if (inactive(p)) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
    vec2 s = neighbours(tex_x, tex_w, p, n, x_scale);
    if (s.y == 0.0) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
    float C = x_scale * texelFetch(tex_x, p, 0).x;
    float b = texelFetch(tex_b, p, 0).x;
    o = vec4(C + omega * ((s.x - b) / s.y - C), 0.0, 0.0, 1.0);
}`;

/** rendered at the coarse level (edge uniforms are the fine level's): the
 * fine residual of the 2x2 children, summed. A coarse cell spans 4x the area,
 * so the sum is the coarse rhs. */
const sh_mg_restrict = `${mg_glsl}
uniform sampler2D tex_x;   // fine
uniform sampler2D tex_b;   // fine
uniform sampler2D tex_w;   // fine

void main() {
    ivec2 q = ivec2(gl_FragCoord.xy), n = textureSize(tex_x, 0);
    float acc = 0.0;
    for (int k = 0; k < 4; ++k) {
        ivec2 p = 2 * q + ivec2(k & 1, k >> 1);
        if (p.x >= n.x || p.y >= n.y || inactive(p)) continue;
        vec2 s = neighbours(tex_x, tex_w, p, n, 1.0);
        if (s.y == 0.0) continue;
        float C = texelFetch(tex_x, p, 0).x;
        acc += texelFetch(tex_b, p, 0).x - (s.x - s.y * C);
    }
    o = vec4(acc, 0.0, 0.0, 1.0);
}`;

/** rendered at the fine level (edge uniforms are the coarse level's):
 * x += bilinear(coarse correction). Solid coarse cells are left out of the
 * blend, held-at-zero ones count as 0, past the edge the ghost is used. */
const sh_mg_prolong = `${mg_glsl}
uniform sampler2D tex_x;    // fine solution
uniform sampler2D tex_e;    // coarse correction
uniform sampler2D tex_w;    // fine weights
uniform sampler2D tex_cw;   // coarse weights
uniform vec2 extent_f;      // fine level's active extent

void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    if (any(greaterThanEqual(vec2(p), extent_f)) || dot(texelFetch(tex_w, p, 0), vec4(1.0)) == 0.0) {
        o = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    float C = texelFetch(tex_x, p, 0).x;

    ivec2 nc = textureSize(tex_e, 0);
    vec2 c = (vec2(p) + 0.5) * 0.5 - 0.5;   // fine cell centre in coarse texel space
    ivec2 c0 = ivec2(floor(c));
    vec2 f = c - vec2(c0);
    float acc = 0.0, ws = 0.0;
    for (int k = 0; k < 4; ++k) {
        ivec2 d = ivec2(k & 1, k >> 1), qq = c0 + d, q = clamp(qq, ivec2(0), nc - 1);
        float w = (d.x == 1 ? f.x : 1.0 - f.x) * (d.y == 1 ? f.y : 1.0 - f.y);
        if (inactive(q)) { ws += w; continue; }
        if (dot(texelFetch(tex_cw, q, 0), vec4(1.0)) == 0.0) continue;
        float v = texelFetch(tex_e, q, 0).x;
        if (qq.x != q.x) v *= qq.x < 0 ? ghost_lo : ghost_hi.x;
        if (qq.y != q.y) v *= qq.y < 0 ? ghost_lo : ghost_hi.y;
        acc += w * v;
        ws += w;
    }
    o = vec4(C + (ws > 0.0 ? acc / ws : 0.0), 0.0, 0.0, 1.0);
}`;

/** finest level face weights from the obstacle mask bits (see mask_glsl). */
const sh_mg_weights_fine = `
#version 300 es
precision highp float;
precision highp sampler2D;
out vec4 o;
uniform sampler2D tex_mask;

void main() {
    uint m = uint(texelFetch(tex_mask, ivec2(gl_FragCoord.xy), 0).r * 255.0 + 0.5);
    if ((m & 1u) != 0u) { o = vec4(0.0); return; }
    o = vec4((m & 2u) != 0u ? 0.0 : 1.0, (m & 4u) != 0u ? 0.0 : 1.0,
             (m & 8u) != 0u ? 0.0 : 1.0, (m & 16u) != 0u ? 0.0 : 1.0);
}`;

/** coarse face weight = mean of the 2 fine faces it covers. Fine cells past
 * the edge (odd sizes) count as border faces. */
const sh_mg_weights_coarse = `
#version 300 es
precision highp float;
precision highp sampler2D;
out vec4 o;
uniform sampler2D tex_w;    // fine weights
uniform int open_borders;

vec4 fw(ivec2 p, ivec2 n) {
    if (p.x >= n.x || p.y >= n.y) return vec4(open_borders == 1 ? 1.0 : 0.0);
    return texelFetch(tex_w, p, 0);
}

void main() {
    ivec2 a = 2 * ivec2(gl_FragCoord.xy), n = textureSize(tex_w, 0);
    vec4 c00 = fw(a, n), c10 = fw(a + ivec2(1, 0), n),
         c01 = fw(a + ivec2(0, 1), n), c11 = fw(a + ivec2(1, 1), n);
    o = 0.5 * vec4(c00.x + c01.x, c10.y + c11.y, c00.z + c10.z, c01.w + c11.w);
}`;
