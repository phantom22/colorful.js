/* Auto exposure for the non-dye views, see exposure.ts.
 *
 * The displayed field is reduced in 4x4 blocks down to a single texel holding
 * (sum of m², fluid cell count, max m), m being the value the view shows: |xy|
 * for vectors, |x| for scalars. The adapt pass turns that into the RMS,
 * eases it over time and stores it in a 1x1 texture that quad_frag divides by. */

/** one 4x4 reduction step. The first step reads the field itself and skips
 * wall cells; later steps combine the previous level's partial sums. */
const sh_exposure_reduce = `
#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
out vec4 o;

uniform sampler2D tex_source;
uniform sampler2D tex_mask;   // obstacle mask (see mask_glsl), first step only
uniform int first;            // 1: tex_source is the field, 0: a reduction level
uniform int source_kind;      // 1 vector, 2 scalar

const int B = 4;

void main() {
    ivec2 q = ivec2(gl_FragCoord.xy), n = textureSize(tex_source, 0);
    float sum = 0.0, count = 0.0, mx = 0.0;
    for (int j = 0; j < B; ++j)
        for (int i = 0; i < B; ++i) {
            ivec2 p = q * B + ivec2(i, j);
            if (p.x >= n.x || p.y >= n.y) continue;
            vec4 s = texelFetch(tex_source, p, 0);
            if (first == 1) {
                if ((uint(texelFetch(tex_mask, p, 0).r * 255.0 + 0.5) & 1u) != 0u) continue;
                float m = source_kind == 1 ? length(s.xy) : abs(s.x);
                if (!(m < 1e30)) continue;   // skip inf / nan
                sum += m * m;
                count += 1.0;
                mx = max(mx, m);
            } else {
                sum += s.x;
                count += s.y;
                mx = max(mx, s.z);
            }
        }
    o = vec4(sum, count, mx, 1.0);
}`;

/** 1x1: eases the stored RMS toward this frame's, in log space so it adapts
 * at the same rate up and down. blend = 1 snaps (first frame, view change). */
const sh_exposure_adapt = `
#version 300 es
precision highp float;
precision highp sampler2D;
out vec4 o;

uniform sampler2D tex_stats;   // 1x1 (sum m², count, max m)
uniform sampler2D tex_prev;    // 1x1 previous result
uniform float blend;

void main() {
    vec4 s = texelFetch(tex_stats, ivec2(0), 0);
    float target = max(s.y > 0.0 ? sqrt(s.x / s.y) : 0.0, 1e-6);
    float prev = texelFetch(tex_prev, ivec2(0), 0).x;
    float v = prev > 0.0 && blend < 1.0 ? exp(mix(log(prev), log(target), blend)) : target;
    o = vec4(v, s.z, 0.0, 1.0);
}`;
