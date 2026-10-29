"use strict";
const searchParams = new (class {
    url;
    constructor() {
        this.url = new URL(window.location.href);
    }
    getNumber(p, fallback = 0, lower = -Infinity, upper = Infinity) {
        const v = this.url.searchParams.get(p), nv = Number(v);
        // @ts-ignore
        return v === null || isNaN(v) ? fallback : Math.min(Math.max(nv, lower), upper);
    }
    getFloat32Color(p, out_arr) {
        const fallback = new Float32Array([0.0, 0.0, 0.0, 1.0]);
        out_arr[0] = 0;
        out_arr[1] = 0;
        out_arr[2] = 0;
        const v = this.url.searchParams.get(p);
        if (v === null)
            return fallback;
        try {
            const av = JSON.parse(v), o = new Float32Array(4);
            if (!Array.isArray(av))
                return fallback;
            const l = av.length;
            if (l < 3 || l > 4)
                return fallback;
            for (let i = 0; i < 3; ++i) {
                const val = av[i];
                if (val < 0.0 || val > 1.0 || val === undefined)
                    return fallback;
                o[i] = val;
                out_arr[i] = val;
            }
            if (l === 3)
                o[3] = 1.0;
            else if (av[3] !== undefined && av[3] >= 0.0 && av[3] <= 1.0)
                o[3] = av[3];
            else
                return fallback;
            o[4] = 1.0;
            return Float32Array.from(av);
        }
        catch (e) {
            return fallback;
        }
    }
    getBoolean(p) {
        return this.url.searchParams.get(p) === "true";
    }
    getString(p, fallback = "") {
        return this.url.searchParams.get(p) || fallback;
    }
});
const sim_resolution = Math.floor(searchParams.getNumber("sim_res", 512, 16)), dye_resolution = Math.floor(searchParams.getNumber("dye_res", 2048, sim_resolution)), window_ar = window.innerHeight / window.innerWidth;
const bg_arr = [], bg = searchParams.getFloat32Color("bg", bg_arr);
const DISPLAY_DYE = 0, DISPLAY_VELOCITY = 1, DISPLAY_CURL = 2, DISPLAY_PRESSURE = 3, DISPLAY_DIVERGENCE = 4, PALETTE_VIRIDIS = 0, PALETTE_HUE_BRIGHTNESS = 1, PALETTE_TURBO = 2, PALETTE_DIVERGING = 3, KIND_DYE = 0, KIND_VECTOR = 1, KIND_SCALAR = 2, BLUR_NONE = 0, BLUR_CROSS = 1, BLUR_3x3_BINOMIAL = 2;
const DISPLAY2STR = {};
DISPLAY2STR[DISPLAY_DYE] = "dye";
DISPLAY2STR[DISPLAY_VELOCITY] = "velocity";
DISPLAY2STR[DISPLAY_PRESSURE] = "pressure";
DISPLAY2STR[DISPLAY_CURL] = "curl";
DISPLAY2STR[DISPLAY_DIVERGENCE] = "divergence";
function resolution(size, ar) {
    const A = size ** 2;
    const height = Math.ceil(Math.sqrt(A * ar));
    const width = Math.ceil(Math.sqrt(A / ar));
    return { dims: [width, height], texel: [(1 / width).toFixed(6), (1 / height).toFixed(6)] };
}
const fluid = {
    jacobi_iterations: Math.floor(searchParams.getNumber("jacobi_iterations", 30, 0, 60)),
    velocity_dissipation: 0.999,
    dye_dissipation: 1.0,
    curl_strength: searchParams.getNumber("curl_strength", 15, 0.0),
    jacobi_scale: searchParams.getNumber("jacobi_scale", 0.8, 0.0, 1.0),
    base_diffusion: 0.25,
    curl_diffusion: 0.5,
    velocity_diffusion: 0.3,
    max_diffusion: 15,
    diffusion_texel_radius: 50,
    max_velocity: 2500,
    max_force: 5000,
    bg: new Float32Array(4),
    bg_arr: Array.from(bg),
    display_mode: DISPLAY_DYE,
    display_palette: PALETTE_TURBO,
    display: {
        velocity: { ref: 60, thresh: 0.5, k: 0.5 },
        curl: { ref: 60, thresh: 0.5, k: 0.5 },
        pressure: { ref: 100, thresh: 0.35, k: 0.3 },
        divergence: { ref: 1.5, thresh: 0.2, k: 0.8 },
    },
    sim_res: resolution(sim_resolution, window_ar),
    dye_res: resolution(dye_resolution, window_ar),
    open_borders: 0
};
color_logarithm(fluid.bg, bg);
const TEXEL = fluid.sim_res.texel.toString(), DYE_TEXEL = fluid.dye_res.texel.toString(), [N1, N2] = fluid.sim_res.dims, [M1, M2] = fluid.dye_res.dims, ASPECT_NUM = N1 / N2, ASPECT = ASPECT_NUM.toFixed(6);
const texel = (t) => N1 < N2 ? t / N1 : t / N2, texel_radius = (t) => texel(t) * 0.5;
const FORCE_FIELD_DEFAULT = `vec2 get_velocity(vec2 p) {
    return vec2(cos(p.x), sin(p.y));
}`;
const force = {
    is_active: false,
    center: new Float32Array([0.0, 0.0]),
    strength: 15.0,
    span: 10.0,
    color_a_getter: () => {
        let v = stroke.choosen_palette[stroke.palette_color].fcolor;
        const t = new Float32Array(4);
        color_logarithm(t, v);
        return t;
    },
    color_b_getter: () => {
        let v = complementary_fcolor(stroke.choosen_palette[stroke.palette_color].fcolor);
        const t = new Float32Array(4);
        color_logarithm(t, v);
        return t;
    },
    glsl: FORCE_FIELD_DEFAULT,
    pure_vector_field: false,
    relaxation: 0.5
};
function rate_from_ms(wave_delay_ms, convergence_fraction = 0.95) {
    const t_seconds = wave_delay_ms * 0.001;
    return -Math.log(1 - convergence_fraction) / t_seconds;
}
{
    let params = new URLSearchParams([
        ["sim_res", `${sim_resolution}`],
        ["dye_res", `${dye_resolution}`],
        ["curl_strength", `${fluid.curl_strength}`],
        ["jacobi_scale", `${fluid.jacobi_scale}`],
        ["jacobi_iterations", `${fluid.jacobi_iterations}`],
    ]);
    const updated_search_params = `?${params.toString()}&bg=[${bg_arr}]`;
    if (window.location.search !== updated_search_params)
        window.history.replaceState({}, '', updated_search_params);
}

"use strict";
function complementary_color(color) {
    return new Uint8Array([
        255 - color[0], 255 - color[1], 255 - color[2], 255
    ]);
}
function complementary_fcolor(color) {
    return new Float16Array([
        1 - color[0], 1 - color[1], 1 - color[2]
    ]);
}
function uint8_to_float32(color) {
    return new Float32Array([
        color[0] / 255, color[1] / 255, color[2] / 255, 1
    ]);
}
function uint8_to_float16(color) {
    return new Float16Array([
        color[0] / 255, color[1] / 255, color[2] / 255, 1
    ]);
}
function get_color_data(color) {
    return {
        color,
        fcolor: uint8_to_float16(color)
    };
}
function luminance(color) {
    return 0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2];
}
function incr_palette() {
    const cp = stroke.choosen_palette;
    if (cp.length === 1)
        return;
    stroke.palette_color = (stroke.palette_color + 1) % cp.length;
}
function decr_palette() {
    const cp = stroke.choosen_palette, L = cp.length, c = stroke.palette_color;
    if (L === 1)
        return;
    stroke.palette_color = c === 0 ? L - 1 : c - 1;
}
function color_logarithm(to, from) {
    to[0] = -Math.log(Math.max(from[0], 0.02));
    to[1] = -Math.log(Math.max(from[1], 0.02));
    to[2] = -Math.log(Math.max(from[2], 0.02));
    to[3] = 1.0;
}

"use strict";
const palette = [
    new Uint8Array([235, 50, 65]),
    new Uint8Array([248, 110, 20]),
    new Uint8Array([235, 195, 10]),
    new Uint8Array([60, 210, 65]),
    new Uint8Array([10, 195, 195]),
    new Uint8Array([45, 135, 255]),
    new Uint8Array([140, 80, 255]),
    new Uint8Array([235, 45, 205]),
    new Uint8Array([255, 255, 255]),
    new Uint8Array([0, 0, 0]),
];
let palette_color_data = palette.map(v => get_color_data(v));

"use strict";
// function mat4x4_mul(to:Float32Array, A:Float32Array, B:Float32Array) {
//     const [a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p]=A,
//           [$,_,C,D,E,F,G,H,I,J,K,L,M,N,O,P]=B;
//     to[0]  = a*$+e*_+i*C+m*D;
//     to[1]  = b*$+f*_+j*C+n*D;
//     to[2]  = c*$+g*_+k*C+o*D;
//     to[3]  = d*$+h*_+l*C+p*D;
//     to[4]  = a*E+e*F+i*G+m*H;
//     to[5]  = b*E+f*F+j*G+n*H;
//     to[6]  = c*E+g*F+k*G+o*H;
//     to[7]  = d*E+h*F+l*G+p*H;
//     to[8]  = a*I+e*J+i*K+m*L;
//     to[9]  = b*I+f*J+j*K+n*L;
//     to[10] = c*I+g*J+k*K+o*L;
//     to[11] = d*I+h*J+l*K+p*L;
//     to[12] = a*M+e*N+i*O+m*P;
//     to[13] = b*M+f*N+j*O+n*P;
//     to[14] = c*M+g*N+k*O+o*P;
//     to[15] = d*M+h*N+l*O+p*P;
// }
// function mat4x4_mul_vec2(to:Float32Array|number[], M:Float32Array, v:ArrayLike<number>) {
//     to[0] = M[0]*v[0] + M[4]*v[1] + M[12];
//     to[1] = M[1]*v[0] + M[5]*v[1] + M[13];
// }
// function mat4x4_det(M:Float32Array) {
//     return -M[12]*(M[9]*(M[2]*M[7]-M[3]*M[6])-M[10]*(M[1]*M[7]-M[3]*M[5])+M[11]*(M[1]*M[6]-M[2]*M[5]))+M[13]*(M[8]*(M[2]*M[7]-M[3]*M[6])-M[10]*(M[0]*M[7]-M[3]*M[4])+M[11]*(M[0]*M[6]-M[2]*M[4]))-M[14]*(M[8]*(M[1]*M[7]-M[3]*M[5])-M[9]*(M[0]*M[7]-M[3]*M[4])+M[11]*(M[0]*M[5]-M[1]*M[4]))+M[15]*(M[8]*(M[1]*M[6]-M[2]*M[5])-M[9]*(M[0]*M[6]-M[2]*M[4])+M[10]*(M[0]*M[5]-M[1]*M[4]))
// }
// function mat4x4_inv(to:Float32Array, from:Float32Array) {
//     let det = mat4x4_det(from);
//     if (det===0) {
//         to[0] = to[1] = to[2] = to[3] = to[4] = to[5] = to[6] = to[7] = to[8] =
//             to[9] = to[10] = to[11] = to[12] = to[13] = to[14] = to[15] = 0.0;
//         return;
//     }
//     det = 1/det;
//     const [a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p] = from,
//         d1=k*p-l*o, d2=j*p-l*n, d3=j*o-k*n, d4=g*p-h*o, d5=f*p-h*n, d6=f*o-g*n,d7=g*l-h*k, d8=f*l-h*j, d9=f*k-g*j, d10=i*p-l*m, d11=i*o-k*m, d12 =e*p-h*m,d13=e*o-g*m, d14=e*l-h*i, d15=e*k-g*i, d16=i*n-j*m, d17=e*n-f*m, d18=e*j-f*i;
//     to[0] = (f *d1-g*d2+h*d3)*det;
//     to[1] = (-b*d1+c*d2-d*d3)*det;
//     to[2] = (b*d4-c*d5+d*d6)*det;
//     to[3] = (-b*d7+c*d8-d*d9)*det;
//     to[4] = (-e*d1+g*d10-h*d11)*det;
//     to[5] = (a *d1-c*d10+d*d11)*det;
//     to[6] = (-a*d4+c*d12-d*d13)*det;
//     to[7] = (a *d7-c*d14+d*d15)*det;
//     to[8] = (e *d2-f*d10+h*d16)*det;
//     to[9] = (-a*d2+b*d10-d*d16)*det;
//     to[10] = (a *d5-b*d12+d*d17)*det;
//     to[11] = (-a*d8+b*d14-d*d18)*det;
//     to[12] = (-e*d3+f*d11-g*d16)*det;
//     to[13] = (a *d3-b*d11+c*d16)*det;
//     to[14] = (-a*d6+b*d13-c*d17)*det;
//     to[15] = (a *d9-b*d15+c*d18)*det;
// };
// function view_projection_matrix(to:Float32Array, proj:Float32Array, view:Float32Array, x:number, y:number, s:number, ar:number) {
//     const l = -ar, r = ar, b = -1, t = 1, n = -1, f = 1;
//     proj[0] = 2/(r-l);
//     proj[1] = proj[2] = proj[3] = proj[4] = proj[6] = proj[7] = proj[8] =
//         proj[9] = proj[11] = 0;
//     proj[5] = 2/(t-b);
//     proj[10] = -2/(f-n);
//     proj[12] = -(r+l)/(r-l);
//     proj[13] = -(t+b)/(t-b);
//     proj[14] = -(f+n)/(f-n);
//     proj[15] = 1;
//     const inv_s = 1/s;
//     view[0] = view[5] = inv_s;
//     view[1] = view[2] = view[3] = view[4] = view[6] = view[7] = view[8] =
//         view[9] = view[11] = view[14] = 0;
//     view[10] = view[15] = 1;
//     view[12] = -x*inv_s;
//     view[13] = -y*inv_s;
//     return mat4x4_mul(to, proj, view);
// }
function create_buffer_vec2(data, at) {
    const out = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, out);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(at);
    return out;
}
function create_vertex_array() {
    const o = gl.createVertexArray();
    gl.bindVertexArray(o);
    return o;
}
function frame_buffer(tex) {
    const o = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, o);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return o;
}
function create_texture(m, n, int_fmt, fmt, type, data = null, filt = gl.NEAREST, wrap = gl.CLAMP_TO_EDGE) {
    const o = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, o);
    gl.texImage2D(gl.TEXTURE_2D, 0, int_fmt, m, n, 0, fmt, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return o;
}
function RGBA16F_texture(m, n) {
    return create_texture(m, n, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, null, gl.LINEAR, gl.CLAMP_TO_EDGE);
}
function R16F_texture(m, n) {
    return create_texture(m, n, gl.R16F, gl.RED, gl.HALF_FLOAT, null, gl.NEAREST, gl.CLAMP_TO_EDGE);
}
function texture_fill(tex_fbo, _with) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, tex_fbo);
    gl.clearBufferfv(gl.COLOR, 0, _with);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
function reduction_textures(out_tex, out_fbo, m, n, block_size) {
    while (n > 1 || m > 1) {
        m = Math.ceil(m / block_size);
        n = Math.ceil(n / block_size);
        // Stop once we've reached a 1x1 final output
        if (n === 1 && m === 1) {
            break;
        }
        const tex = create_texture(m, n, gl.RG16F, gl.RG, gl.HALF_FLOAT, null, gl.NEAREST, gl.CLAMP_TO_EDGE);
        out_tex.push(tex);
        out_fbo.push(frame_buffer(tex));
    }
}
// function half_to_float(h: number) {
//     const s = (h & 0x8000) ? -1 : 1;
//     const e = (h >> 10) & 0x1f;
//     const m = h & 0x3ff;
//     if (e === 0)  return s * 5.960464477539063e-8 * m;      // subnormal
//     if (e === 31) return m ? NaN : s * Infinity;
//     return s * Math.pow(2, e - 15) * (1 + m / 1024);
// }
// function print_max_curl() {
//     const buf = new Uint16Array(N1 * N2);
//     gl.bindFramebuffer(gl.FRAMEBUFFER, curl_fbo);
//     gl.readPixels(0, 0, N1, N1, gl.RED, gl.HALF_FLOAT, buf);
//     gl.bindFramebuffer(gl.FRAMEBUFFER, null);
//     let max = 0, sum = 0, nan = 0, inf = 0;
//     for (let i = 0; i < buf.length; ++i) {
//         const v = half_to_float(buf[i]);
//         if (Number.isNaN(v)) { ++nan; continue; }
//         if (!Number.isFinite(v)) { ++inf; continue; }
//         const a = Math.abs(v);
//         if (a > max) max = a;
//         sum += a;
//     }
//     console.log("max |curl|:", max, "mean:", sum / buf.length, "NaN:", nan, "Inf:", inf);
// }
// function print_dye_stats(bg?: number[]) {
//     const L = M1*M2;
//     const buf = new Uint16Array(L * 4);
//     gl.bindFramebuffer(gl.FRAMEBUFFER, dye_fbo[dye_read]);
//     gl.readPixels(0, 0, M1, M2, gl.RGBA, gl.HALF_FLOAT, buf);
//     gl.bindFramebuffer(gl.FRAMEBUFFER, null);
//     const min = [Infinity, Infinity, Infinity, Infinity];
//     const max = [-Infinity, -Infinity, -Infinity, -Infinity];
//     const sum = [0, 0, 0, 0];
//     let nan = 0, inf = 0, changed = 0;
//     for (let i = 0; i < L; ++i) {
//         let diff = false;
//         for (let c = 0; c < 4; ++c) {
//             const v = half_to_float(buf[i * 4 + c]);
//             if (Number.isNaN(v)) { ++nan; continue; }
//             if (!Number.isFinite(v)) { ++inf; continue; }
//             if (v < min[c]) min[c] = v;
//             if (v > max[c]) max[c] = v;
//             sum[c] += v;
//             if (bg && c < 3 && Math.abs(v - bg[c]) > 0.01) diff = true;
//         }
//         if (diff) ++changed;
//     }
//     console.log(
//         "dye min:", min.map(v => v.toFixed(3)),
//         "max:", max.map(v => v.toFixed(3)),
//         "mean:", sum.map(v => (v / L).toFixed(3)),
//         "NaN:", nan, "Inf:", inf,
//         bg ? `non-bg texels: ${changed} (${(100 * changed / L).toFixed(2)}%)` : ""
//     );
// }
// function print_dye_mass() {
//     const L = M1*M2;
//     const buf = new Uint16Array(L * 4);
//     gl.bindFramebuffer(gl.FRAMEBUFFER, dye_fbo[dye_read]);
//     gl.readPixels(0, 0, M1, M2, gl.RGBA, gl.HALF_FLOAT, buf);
//     gl.bindFramebuffer(gl.FRAMEBUFFER, null);
//     let mass = 0, peak = 0, covered = 0;
//     for (let i = 0; i < L; ++i) {
//         const a = half_to_float(buf[i * 4 + 3]);
//         mass += a;
//         if (a > peak) peak = a;
//         if (a > 0.01) ++covered;
//     }
//     console.log("dye mass:", mass.toFixed(1), "peak a:", peak.toFixed(3), "texels > 0.01:", covered);
// }
// function print_speed_profile(pos:Float32Array) {   // cx, cy = splat uv
//     const [cx,cy] = pos;
//     const buf = new Uint16Array(N1 * N2 * 4);
//     gl.bindFramebuffer(gl.FRAMEBUFFER, velocity_fbo[velocity_read]);
//     gl.readPixels(0, 0, N1, N2, gl.RGBA, gl.HALF_FLOAT, buf);
//     gl.bindFramebuffer(gl.FRAMEBUFFER, null);
//     const bins = new Float32Array(8), cnt = new Float32Array(8);
//     for (let y = 0; y < N1; ++y) for (let x = 0; x < N2; ++x) {
//         const i = (y * N1 + x) * 4;
//         const sp = Math.hypot(half_to_float(buf[i]), half_to_float(buf[i + 1]));
//         const r = Math.hypot(x / N2 - cx, y / N1 - cy);       // distance in uv
//         const b = Math.min(7, Math.floor(r / 0.05));
//         bins[b] += sp; ++cnt[b];
//     }
//     console.log("mean speed by distance (0.05 uv rings):",
//         Array.from(bins, (s, i) => (s / Math.max(cnt[i], 1)).toFixed(2)));
// }

"use strict";
const _warn_uniform_not_defined = {};
function warn_uniform_not_defined(from, uniform_name) {
    if (_warn_uniform_not_defined[from] === undefined) {
        _warn_uniform_not_defined[from] = {};
    }
    if (_warn_uniform_not_defined[from][uniform_name])
        return;
    _warn_uniform_not_defined[from][uniform_name] = true;
    console.warn(`uniform '${uniform_name}' is not defined in the shader.`);
}
const _warn_uniform_no_getter = {};
function warn_uniform_no_getter(from, uniform_name) {
    if (_warn_uniform_no_getter[from] === undefined) {
        _warn_uniform_no_getter[from] = {};
    }
    if (_warn_uniform_no_getter[from][uniform_name])
        return;
    _warn_uniform_no_getter[from][uniform_name] = true;
    console.warn(`uniform '${uniform_name}' has both no getter function and no default` +
        ` value for automatic gpu uniform update.`);
}
const U_UPDATE = 1, U_INIT = 2;
const GL_UINT = 3, GL_INT = 4, GL_FLOAT = 5, GL_MAT4x4 = 6, GL_TEXTURE = 7, GL_VEC2 = 8, GL_VEC3 = 9, GL_VEC4 = 10;
const uploaders = {
    [GL_UINT]: (l, v) => gl.uniform1ui(l, v),
    [GL_INT]: (l, v) => gl.uniform1i(l, v),
    [GL_TEXTURE]: (l, v) => gl.uniform1i(l, v),
    [GL_FLOAT]: (l, v) => gl.uniform1f(l, v),
    [GL_MAT4x4]: (l, v) => gl.uniformMatrix4fv(l, false, v),
    [GL_VEC2]: (l, v) => gl.uniform2f(l, v[0], v[1]),
    [GL_VEC3]: (l, v) => gl.uniform3f(l, v[0], v[1], v[2]),
    [GL_VEC4]: (l, v) => gl.uniform4f(l, v[0], v[1], v[2], v[3]),
};
function upload(loc, type, v) {
    // TS can't correlate `type` with the table entry, so this is the one cast
    uploaders[type](loc, v);
}
class uniform {
    name;
    type;
    update;
    init;
    loc = null;
    owner = "";
    source;
    /** last uploaded value (a copy). null = unknown, so the next upload always happens. */
    cached = null;
    constructor(name, type, flags = 0, v) {
        this.name = name;
        this.type = type;
        this.update = (flags & U_UPDATE) !== 0;
        this.init = (flags & U_INIT) !== 0;
        this.source = v;
    }
    get v() {
        return typeof this.source === "function" ? this.source() : this.source;
    }
    /** forget the cache, e.g. after a context restore. */
    invalidate() { this.cached = null; }
    differs(v) {
        if (this.type === GL_MAT4x4)
            return true;
        const c = this.cached;
        if (c === null)
            return true;
        if (typeof v === "number")
            return c !== v;
        const a = v, b = c;
        if (a.length !== b.length)
            return true;
        for (let i = 0; i < a.length; ++i)
            if (a[i] !== b[i])
                return true;
        return false;
    }
    store(v) {
        if (this.type === GL_MAT4x4)
            return;
        if (typeof v === "number") {
            this.cached = v;
            return;
        }
        const a = v;
        let b = this.cached;
        if (!Array.isArray(b) || b.length !== a.length)
            b = this.cached = new Array(a.length);
        for (let i = 0; i < a.length; ++i)
            b[i] = a[i]; // copy, never keep the reference
    }
    push(v) {
        if (!this.differs(v))
            return;
        upload(this.loc, this.type, v);
        this.store(v);
    }
    update_value() {
        if (this.loc === null) {
            warn_uniform_not_defined(this.owner, this.name);
            return;
        }
        const v = this.v;
        if (v === undefined) {
            warn_uniform_no_getter(this.owner, this.name);
            return;
        }
        this.push(v);
    }
    set(v) {
        if (this.loc === null) {
            warn_uniform_not_defined(this.owner, this.name);
            return;
        }
        if (v === undefined)
            return;
        this.push(v);
    }
}
class shader_program {
    vertex;
    fragment;
    program;
    uniforms;
    to_update = [];
    constructor(id, vert_src, frag_src, uniforms) {
        if (shaders[id] !== undefined)
            throw `shader_program: a program with id '${id}' already exists.`;
        const compile = (type, src, label) => {
            const s = gl.createShader(type);
            if (s === null)
                throw `shader_program: failed to create ${label} shader`;
            gl.shaderSource(s, src.trim());
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
                throw `Shader{${id}}: failed to compile ${label} shader, reason:` + gl.getShaderInfoLog(s);
            return s;
        };
        this.vertex = compile(gl.VERTEX_SHADER, vert_src, "vertex");
        this.fragment = compile(gl.FRAGMENT_SHADER, frag_src, "fragment");
        const p = gl.createProgram();
        gl.attachShader(p, this.vertex);
        gl.attachShader(p, this.fragment);
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS))
            throw `Shader{${id}}: failed to link, reason: ${gl.getProgramInfoLog(p)}`;
        this.program = p;
        gl.useProgram(p);
        const map = {};
        for (const u of uniforms) {
            u.owner = id;
            u.loc = gl.getUniformLocation(p, u.name);
            if (u.loc === null)
                console.warn(`Shader{${id},${u.name}}: not defined (optimized out?).`);
            map[u.name] = u;
            if (u.loc !== null) {
                if (u.update)
                    this.to_update.push(u);
                if (u.init)
                    u.update_value();
            }
        }
        this.uniforms = map;
        shaders[id] = this;
    }
    use_program() {
        gl.useProgram(this.program);
        for (const u of this.to_update)
            u.update_value();
    }
}
const shaders = {};

"use strict";
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
const sh_forcefield = (user) => `
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

"use strict";
/** event called on window.onresize */
function update_viewport() {
    const r = canvas_el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    canvas_rect = r;
    // const w = window.innerWidth, h = window.innerHeight;
    if (w !== canvas_el.width || h !== canvas_el.height) {
        canvas_el.width = w;
        canvas_el.height = h;
        mouse.m1_down = false;
        keyboard.shift_down = false;
        keyboard.ctrl_down = false;
    }
}

"use strict";
const __dye_radius = 1.5;
const splat = {
    point: new Float32Array(2),
    dye_radius: texel_radius(__dye_radius),
    dye_strength: 0.45,
    velocity_radius: texel_radius(__dye_radius + 0.5),
    velocity_strength: 0.6,
    force_scale: 0.3,
    prev: new Float32Array(2),
    next_is_start: true,
    queue: []
};
const obstacle_splat = {
    radius: texel(3),
    outline_width: texel(1),
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

"use strict";
const renderer = {
    /** when true, the grid vertex color lut table will get cleared with grid_bg
     * color (initial grid color). */
    request_color_clear: { noise: false, pending: false },
    /** current frame id. */
    frame: 0,
    /** used to calculate delta_time. */
    prev_timestamp: 0,
    delta_time: 0,
    fixed_delta_time: 1 / 60,
    window_hidden: false,
    dt_getter: () => renderer.delta_time,
    fixed_dt_getter: () => renderer.fixed_delta_time * renderer.time_scale,
    checkboard_fill: false,
    time_scale: 1.0
};
function draw(timestamp) {
    renderer.delta_time = (timestamp - renderer.prev_timestamp) * 0.001;
    renderer.prev_timestamp = timestamp;
    if (renderer.window_hidden) {
        requestAnimationFrame(draw);
        return;
    }
    if (++renderer.frame % 6 === 0)
        ui_inspector.refresh();
    ui_status.fps(renderer.delta_time);
    gl.enable(gl.BLEND);
    gl.viewport(0, 0, N1, N2);
    gl.enable(gl.BLEND);
    gl.bindVertexArray(vao);
    if (renderer.request_color_clear.pending) {
        fill_grid(fluid.bg, renderer.request_color_clear.noise);
        renderer.request_color_clear.pending = false;
        renderer.request_color_clear.noise = false;
    }
    run_obstacle_splats();
    gl.disable(gl.BLEND);
    if (mouse.m1_down &&
        (mouse.mode === MOUSE_MODE_DYE || mouse.mode === MOUSE_MODE_DYE_FORCE))
        set_dye_splat(mouse.uv_pos, false);
    run_splats();
    //////////////////////////////////
    //          FLUID SIM           //
    //////////////////////////////////
    gl.viewport(0, 0, N1, N2);
    if (force.is_active) {
        forcefield_p.use_program();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity_tex[velocity_read]);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);
        gl.bindFramebuffer(gl.FRAMEBUFFER, velocity_fbo[1 - velocity_read]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        velocity_read = 1 - velocity_read;
    }
    // 1. advect velocity by itself
    velocity_advect_p.use_program();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity_tex[velocity_read]);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity_fbo[1 - velocity_read]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    velocity_read = 1 - velocity_read;
    // 2.1. vorticity confinement
    curl_p.use_program();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity_tex[velocity_read]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, curl_fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 2.2. blur curls
    blur_p.use_program();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, curl_tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, curl_smooth_fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 2.3. calculate velocity from curls
    vorticity_confinement_p.use_program();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity_tex[velocity_read]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, curl_smooth_tex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity_fbo[1 - velocity_read]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    velocity_read = 1 - velocity_read;
    // 3. project
    divergence_p.use_program();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity_tex[velocity_read]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, divergence_fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 4. decay the pressure warm start
    rescale_p.use_program();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, pressure_tex[pressure_read]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, pressure_fbo[1 - pressure_read]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    pressure_read = 1 - pressure_read;
    // 5. pressure jacobi iterations
    pressure_jacobi_p.use_program();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, divergence_tex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);
    for (let i = 0; i < fluid.jacobi_iterations; ++i) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, pressure_tex[pressure_read]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, pressure_fbo[1 - pressure_read]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        pressure_read = 1 - pressure_read;
    }
    // 6. gradient subtract
    gradient_subtract_p.use_program();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, pressure_tex[pressure_read]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, velocity_tex[velocity_read]);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity_fbo[1 - velocity_read]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    velocity_read = 1 - velocity_read;
    // if (force.is_active && force.pure_vector_field) {
    //     forcefield_p.use_program();
    //     gl.activeTexture(gl.TEXTURE0);
    //     gl.bindTexture(gl.TEXTURE_2D, velocity_tex[velocity_read]);
    //     gl.activeTexture(gl.TEXTURE1);
    //     gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);
    //     gl.bindFramebuffer(gl.FRAMEBUFFER, velocity_fbo[1-velocity_read]);
    //     gl.drawArrays(gl.TRIANGLES, 0, 3);
    //     velocity_read = 1 - velocity_read;
    // }
    // 7. advect dye
    gl.viewport(0, 0, M1, M2);
    if (renderer.checkboard_fill) {
        checkboard_fill_p.use_program();
        gl.bindFramebuffer(gl.FRAMEBUFFER, dye_fbo[1 - dye_read]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        dye_read = 1 - dye_read;
        renderer.checkboard_fill = false;
    }
    dye_advect_p.use_program();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity_tex[velocity_read]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, dye_tex[dye_read]);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dye_fbo[1 - dye_read]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    dye_read = 1 - dye_read;
    // 8. two vorticity-driven diffusion passes
    diffusion_pass_p.use_program();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dye_tex[dye_read]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, curl_smooth_tex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, velocity_tex[velocity_read]);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dye_fbo[1 - dye_read]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    //////////////////////////////////
    //         MAIN SHADER          //
    //////////////////////////////////
    quad_p.use_program();
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.enable(gl.BLEND);
    let display_tex, kind, blur, ref, thresh, k, palette = fluid.display_palette;
    gl.activeTexture(gl.TEXTURE0);
    switch (fluid.display_mode) {
        case DISPLAY_DYE:
            display_tex = dye_tex[dye_read];
            kind = KIND_DYE;
            break;
        case DISPLAY_VELOCITY:
            display_tex = velocity_tex[velocity_read];
            kind = KIND_VECTOR;
            blur = BLUR_CROSS;
            ref = fluid.display.velocity.ref;
            thresh = fluid.display.velocity.thresh;
            k = fluid.display.velocity.k;
            break;
        case DISPLAY_CURL:
            display_tex = curl_tex;
            kind = KIND_SCALAR;
            blur = BLUR_3x3_BINOMIAL;
            ref = fluid.display.curl.ref;
            thresh = fluid.display.curl.thresh;
            k = fluid.display.curl.k;
            break;
        case DISPLAY_PRESSURE:
            display_tex = pressure_tex[pressure_read];
            kind = KIND_SCALAR;
            blur = BLUR_CROSS;
            ref = fluid.display.pressure.ref;
            thresh = fluid.display.pressure.thresh;
            k = fluid.display.pressure.k;
            break;
        case DISPLAY_DIVERGENCE:
            display_tex = divergence_tex;
            kind = KIND_SCALAR;
            blur = BLUR_CROSS;
            ref = fluid.display.divergence.ref;
            thresh = fluid.display.divergence.thresh;
            k = fluid.display.divergence.k;
            palette = PALETTE_DIVERGING;
            break;
    }
    gl.bindTexture(gl.TEXTURE_2D, display_tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, obstacles_tex);
    quad_p.uniforms["source_kind"].set(kind);
    quad_p.uniforms["blur_type"].set(blur);
    quad_p.uniforms["reference_value"].set(ref);
    quad_p.uniforms["value_rescale_threshold"].set(thresh);
    quad_p.uniforms["rescale_factor"].set(k);
    quad_p.uniforms["palette_type"].set(palette);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    ///////////////
    // if (renderer.frame % 60 === 0) {
    //     const v = -Math.log(0.02);
    //     print_dye_stats([v,v,v]);
    // }
    requestAnimationFrame(draw);
}

"use strict";
const keyboard = {
    /** set to true when the shift button is pressed. */
    shift_down: false,
    /** set to true only when the ctrl button is pressed and shift is not. */
    ctrl_down: false,
    alt_down: false
};
/** event called on window.onkeydown */
function w_keydown(e) {
    if (in_field(e))
        return;
    let t;
    switch (e.key) {
        case "Shift":
            keyboard.shift_down = true;
            stroke.palette_color = 0;
            return;
        case "Control":
            if (mouse.m1_down)
                return;
            keyboard.ctrl_down = true;
            return;
        case "Alt":
            e.preventDefault();
            keyboard.alt_down = true;
            return;
        case " ":
            renderer.checkboard_fill = true;
            return;
        case "f":
            ui_set_force_active(!force.is_active);
            ui_force_btn.set(force.is_active, false);
            return;
        case "Backspace":
            renderer.request_color_clear.pending = true;
            renderer.request_color_clear.noise = true;
            return;
        case "Escape":
            ui_container.hidden = !ui_container.hidden;
            return;
        case "ArrowRight":
            // @ts-ignore
            fluid.display_palette = (fluid.display_palette + 1) % 3;
            ui_visualizer_s.refresh();
            return;
        case "ArrowLeft":
            t = fluid.display_palette - 1;
            fluid.display_palette = t < 0 ? PALETTE_TURBO : t;
            ui_visualizer_s.refresh();
            return;
        case "ArrowUp":
            force.strength *= Math.exp(50 * 0.008);
            force.strength = Math.min(force.strength, 10000);
            ui_field_strength.refresh();
            return;
        case "ArrowDown":
            force.strength *= Math.exp(-50 * 0.008);
            force.strength = Math.max(force.strength, 0.5);
            ui_field_strength.refresh();
            return;
        case "Tab":
            e.preventDefault();
            if (keyboard.alt_down)
                return;
            ui_borders_btn.toggle();
            return;
        case "i":
            ui_inspector.toggle_visibility();
            return;
        case "t":
            e.preventDefault();
            ui_field_glsl.open();
            return;
    }
}
/** event called on window.onkeyup */
function w_keyup(e) {
    switch (e.key) {
        case "Shift":
            keyboard.shift_down = false;
            return;
        case "Control":
            keyboard.ctrl_down = false;
            return;
        case "Tab":
            if (in_field(e))
                return;
            e.preventDefault();
            return;
    }
}
addEventListener("keydown", w_keydown);
addEventListener("keyup", w_keyup);

"use strict";
const MOUSE_MODE_DYE_FORCE = 0, MOUSE_MODE_DYE = 1, MOUSE_MODE_FORCE = 2, MOUSE_MODE_WALL = 3;
const MODE2STR = {};
MODE2STR[MOUSE_MODE_DYE_FORCE] = "Dye + Force";
MODE2STR[MOUSE_MODE_DYE] = "Dye";
MODE2STR[MOUSE_MODE_FORCE] = "Force";
MODE2STR[MOUSE_MODE_WALL] = "Wall";
const mouse = {
    /** value set to true whenever the mouse's left button is pressed. */
    m1_down: false,
    /** value set to true only when mouse1_down is not true and the mouse's
      * wheel button is pressed. */
    m2_down: false,
    last_processed_frame: -1,
    uv_pos: new Float32Array(2),
    prev_uv_pos: new Float32Array(2),
    mode: MOUSE_MODE_DYE_FORCE
};
let _mouse_never_processed = true;
function process_client_pos(clientX, clientY) {
    mouse.uv_pos[0] = (clientX - canvas_rect.left) / canvas_rect.width;
    mouse.uv_pos[1] = (canvas_rect.bottom - clientY) / canvas_rect.height;
    const f = force.span * 0.5;
    ui_status.cursor(force.center[0] + (mouse.uv_pos[0] - 0.5) * f * ASPECT_NUM, force.center[1] + (mouse.uv_pos[1] - 0.5) * f);
}
/** event called on canvas.onmouseleave */
function c_mouseleave() {
    splat.next_is_start = obstacle_splat.next_is_start = true;
}
/** event called on canvas.onmousedown */
function c_mousedown(e) {
    document.activeElement?.blur();
    if (e.button === 3)
        return;
    if (_mouse_never_processed) {
        process_client_pos(e.clientX, e.clientY);
        _mouse_never_processed = false;
    }
    if (e.button === 0) {
        mouse.m1_down = true;
        mouse.m2_down = false;
        dispatch_splat(mouse.uv_pos, true);
    }
    else if (force.is_active && !mouse.m1_down && e.button === 2) {
        mouse.m2_down = true;
        mouse.prev_uv_pos.set(mouse.uv_pos);
        return;
    }
}
/** event called on window.onmousemove */
function w_mousemove(e) {
    process_client_pos(e.clientX, e.clientY);
    if (!mouse.m1_down && !mouse.m2_down)
        return;
    if (mouse.m2_down) {
        if (!force.is_active)
            return;
        const f = force.span * 0.5;
        force.center[0] += (mouse.uv_pos[0] - mouse.prev_uv_pos[0]) * f * ASPECT_NUM;
        force.center[1] += (mouse.uv_pos[1] - mouse.prev_uv_pos[1]) * f;
        mouse.prev_uv_pos.set(mouse.uv_pos);
        renderer.request_color_clear = { pending: true, noise: false };
        ui_update_bounds();
        ui_field_center.refresh();
        return;
    }
    const frame = renderer.frame;
    if (mouse.last_processed_frame === frame)
        return;
    mouse.last_processed_frame = frame;
    dispatch_splat(mouse.uv_pos, false);
}
/** event called on window.onmouseup */
function w_mouseup(e) {
    if (e.button === 2) {
        e.preventDefault();
        mouse.m2_down = false;
        return;
    }
    if (e.button !== 0)
        return;
    splat.next_is_start = obstacle_splat.next_is_start = true;
    mouse.m1_down = false;
}
/** event called on canvas.onwheel */
function w_wheel(e) {
    if (e.target.closest("#inspector,#view-select,#tools,#status"))
        return;
    e.preventDefault();
    if (!force.is_active)
        return;
    // normalize line/page modes to pixels
    const dy = -e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
    force.span *= Math.exp(dy * 0.00025); // wheel down: larger span, more of the field visible
    force.span = Math.min(Math.max(force.span, 0.01), 200);
    renderer.request_color_clear = { pending: true, noise: false };
    ui_field_span.refresh();
    ui_update_bounds();
}

"use strict";
/** event called on window.onmouseleave and on window.onblur */
function state_cleanup() {
    mouse.m1_down = false;
    mouse.m2_down = false;
    keyboard.shift_down = keyboard.ctrl_down = keyboard.alt_down = false;
    splat.next_is_start = obstacle_splat.next_is_start = true;
}
function d_visibilitychange() {
    renderer.window_hidden = document.hidden;
    state_cleanup();
}
window.onblur = state_cleanup;
document.onvisibilitychange = d_visibilitychange;
window.addEventListener("wheel", w_wheel, { passive: false });
addEventListener("blur", state_cleanup);
window.onload = main;

"use strict";
const GLSL_KW = new Set("if else for while do break continue return discard const uniform in out inout void struct precision highp mediump lowp true false".split(" "));
const GLSL_TYPE = new Set("float int uint bool vec2 vec3 vec4 ivec2 ivec3 ivec4 uvec2 uvec3 uvec4 bvec2 bvec3 bvec4 mat2 mat3 mat4 sampler2D".split(" "));
const GLSL_FN = new Set("sin cos tan asin acos atan sinh cosh tanh pow exp log exp2 log2 sqrt inversesqrt abs sign floor ceil fract mod min max clamp mix step smoothstep length distance dot cross normalize reflect refract texture round trunc".split(" "));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function highlight_glsl(src) {
    const re = /(\/\/.*|\/\*[\s\S]*?\*\/)|(^[ \t]*#.*)|(\b\d+\.?\d*(?:[eE][+-]?\d+)?\b|\.\d+\b)|([A-Za-z_]\w*)/gm;
    let out = "", last = 0, m;
    while ((m = re.exec(src))) {
        out += esc(src.slice(last, m.index));
        const t = m[0];
        let cls = "";
        if (m[1])
            cls = "c";
        else if (m[2])
            cls = "p";
        else if (m[3])
            cls = "n";
        else if (GLSL_KW.has(t))
            cls = "k";
        else if (GLSL_TYPE.has(t))
            cls = "t";
        else if (GLSL_FN.has(t))
            cls = "f";
        out += cls ? `<span class="${cls}">${esc(t)}</span>` : esc(t);
        last = m.index + t.length;
    }
    return out + esc(src.slice(last)) + "\n"; // trailing newline keeps the last line's height
}

"use strict";
const $ = (id) => document.getElementById(id);
const TOOL_ICONS = [
    '<path d="M12 3c3 4 5 6.5 5 9.5a5 5 0 0 1-10 0C7 9.5 9 7 12 3z"/><path d="M4 20h9m-3-3 3 3-3 3"/>',
    '<path d="M12 3c3 4 5 6.5 5 9.5a5 5 0 0 1-10 0C7 9.5 9 7 12 3z"/>',
    '<path d="M4 8h10a3 3 0 1 0-3-3M4 13h14a3 3 0 1 1-3 3M4 18h7"/>',
    '<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M4 12h16M10 5v7M15 12v7"/>',
];
const FORCE_ICON = '<path d="M13 5.5c-1.8-1-3.4 0-3.7 2L8 19c-.3 1.6-1.4 2.300-2.800 1.600"/>' +
    '<path d="M5.500 11.500h7"/>' +
    '<path d="M15.500 13.500l4.500 5.500m0-5.500l-4.500 5.500" stroke-width="1.400"/>', BORDERS_ICON = '<path d="M4 4h5M15 4h5"/>' + '<path d="M4 20h5M15 20h5"/>' +
    '<path d="M4 4v5M4 15v5"/>' + '<path d="M20 4v5M20 15v5"/>';
const val = (s) => (typeof s === "function" ? s() : s);
/** resolves a lazy target and remembers each target's initial value (for reset). */
function bind(obj, key, copy) {
    const defaults = new WeakMap();
    const target = () => {
        const t = val(obj);
        if (!defaults.has(t))
            defaults.set(t, copy(t[key]));
        return t;
    };
    target();
    return { target, def: () => defaults.get(target()) };
}
function isolate(el) {
    for (const ev of ["mousedown", "contextmenu"])
        el.addEventListener(ev, e => e.stopPropagation());
}
/** true when the event comes from a form control. */
function in_field(e) {
    const t = e.target;
    return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" ||
        t.tagName === "SELECT" || t.isContentEditable);
}
/** form control or a modifier combo. Use this in component hotkeys. */
function is_typing(e) { return in_field(e) || e.ctrlKey || e.metaKey || e.altKey; }
function render_tooltip(src) {
    const esc_ = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const inline = (s) => esc_(s).replace(/\[([^\]]+)\]/g, '<b class="tv">$1</b>').replace(/\n/g, "<br>");
    let out = "";
    // order matters: $$..$$ before $..$
    const re = /\$\$([\s\S]*?)\$\$|\$([\s\S]*?)\$|\{([\s\S]*?)\}/g;
    let m;
    while ((m = re.exec(src))) {
        if (m[1] !== undefined)
            out += `<div class="tt-h2">${inline(m[1].trim())}</div>`;
        else if (m[2] !== undefined)
            out += `<div class="tt-h1">${inline(m[2].trim())}</div>`;
        else {
            const lines = m[3].trim();
            const cls = lines.includes("\n") ? "tt-p tt-list" : "tt-p";
            out += `<div class="${cls}">${inline(lines)}</div>`;
        }
    }
    return out;
}
/** one shared floating tooltip for the whole UI. */
class UI_TOOLTIP {
    static el;
    static timer = 0;
    static ensure() {
        if (this.el)
            return;
        this.el = document.createElement("div");
        this.el.className = "tt";
        this.el.hidden = true;
        $("hud").appendChild(this.el);
    }
    /** attaches a rich tooltip to an element. */
    static attach(target, src, delay = 350) {
        this.ensure();
        const html = render_tooltip(src);
        target.addEventListener("mouseenter", () => {
            clearTimeout(this.timer);
            this.timer = window.setTimeout(() => this.show(target, html), delay);
        });
        const hide = () => { clearTimeout(this.timer); this.el.hidden = true; };
        target.addEventListener("mouseleave", hide);
        target.addEventListener("mousedown", hide);
    }
    static show(target, html) {
        this.el.innerHTML = html;
        this.el.hidden = false;
        const r = target.getBoundingClientRect();
        const w = this.el.offsetWidth, h = this.el.offsetHeight;
        // prefer the left of the target (the inspector sits on the right edge)
        let x = r.left - w - 10;
        if (x < 8)
            x = Math.min(r.right + 10, innerWidth - w - 8);
        let y = r.top + r.height / 2 - h / 2;
        y = Math.max(8, Math.min(y, innerHeight - h - 8));
        this.el.style.left = `${x}px`;
        this.el.style.top = `${y}px`;
    }
}
class UI_ELEMENT {
    io;
    row = document.createElement("div");
    constructor(parent, label, title, io, row_class = "") {
        this.io = io;
        this.row.className = ("row " + row_class).trim();
        const l = document.createElement("label");
        l.textContent = label;
        if (io.tooltip)
            UI_TOOLTIP.attach(l, io.tooltip);
        else
            l.title = title;
        this.row.appendChild(l);
        parent.appendChild(this.row);
    }
    set_visible(visible) {
        this.row.hidden = !visible;
    }
    toggle_visibility() { this.row.hidden = !this.row.hidden; }
    refresh_visibility() {
        this.io.visible && this.set_visible(this.io.visible());
    }
    refresh() {
        this.refresh_visibility();
        if (!this.row.hidden)
            this.refresh_value();
    }
    get is_frozen() { return this.io.frozen?.() !== undefined; }
    reset() { this.apply(this.io.def()); }
    /** greys out and disables every input in the row. */
    lock(on) {
        this.row.classList.toggle("frozen", on);
        this.row.querySelectorAll("input,select")
            .forEach(i => { i.disabled = on; });
    }
}
class UI_SLIDER extends UI_ELEMENT {
    o;
    in_range = document.createElement("input");
    in_number = document.createElement("input");
    constructor(parent, label, key, io, o) {
        super(parent, label, key, io);
        this.o = o;
        this.in_range.type = "range";
        this.in_range.min = "0";
        this.in_range.max = "1000";
        this.in_number.type = "number";
        this.row.append(this.in_range, this.in_number);
        this.in_range.addEventListener("input", () => this.apply(this.from_t(+this.in_range.value / 1000)));
        // leave the slider after a mouse drag, so the global arrow hotkeys work again.
        // keyboard focus (Tab) keeps it, so arrows can still move the slider.
        this.in_range.addEventListener("pointerup", () => this.in_range.blur());
        this.in_number.addEventListener("change", () => {
            const v = parseFloat(this.in_number.value);
            Number.isNaN(v) ? this.refresh_value() : this.apply(v);
        });
        this.row.addEventListener("dblclick", e => { if (e.target !== this.in_number)
            this.reset(); });
        this.refresh_value();
    }
    to_t(v) {
        const min = this.o.min(), max = this.o.max();
        if (max <= min)
            return 0;
        return this.o.log ? (Math.log(Math.max(v, min)) - Math.log(min)) / (Math.log(max) - Math.log(min))
            : (v - min) / (max - min);
    }
    from_t(t) {
        const min = this.o.min(), max = this.o.max();
        return this.o.log ? Math.exp(Math.log(min) + t * (Math.log(max) - Math.log(min)))
            : min + t * (max - min);
    }
    apply(v) {
        if (this.is_frozen)
            return this.refresh_value();
        const { log, int, step } = this.o;
        const min = this.o.min(), max = this.o.max();
        if (int)
            v = Math.round(v);
        if (step && !log)
            v = Math.round(v / step) * step;
        v = Math.min(max, Math.max(min, v));
        this.io.set(v);
        this.io.onChange?.(v);
        this.refresh_value();
    }
    refresh_value() {
        const max = this.o.max(), min = this.o.min();
        const cur = this.io.get();
        if (!this.is_frozen && (cur > max || cur < min))
            this.io.set(Math.min(max, Math.max(min, cur)));
        const forced = this.io.frozen?.();
        const v = forced ?? this.io.get();
        const { int, step } = this.o;
        const decimals = int ? 0
            : Math.max(0, Math.ceil(-Math.log10(step ?? ((this.o.max() - this.o.min()) / 200 || 1))));
        this.in_range.value = String(Math.min(1, Math.max(0, this.to_t(v))) * 1000);
        this.in_number.step = String(10 ** -decimals); // arrow keys step by the displayed precision
        if (document.activeElement !== this.in_number)
            this.in_number.value = v.toFixed(decimals);
        this.lock(forced !== undefined);
    }
}
class UI_TOGGLE extends UI_ELEMENT {
    int;
    input = document.createElement("input");
    constructor(parent, label, key, io, int) {
        super(parent, label, key, io, "toggle");
        this.int = int;
        this.input.type = "checkbox";
        this.row.appendChild(this.input);
        this.input.addEventListener("change", () => this.apply(this.input.checked));
        this.refresh_value();
    }
    apply(v) {
        if (this.is_frozen)
            return this.refresh_value();
        const t = this.int ? Number(v) : !!v;
        this.io.set(t);
        this.io.onChange?.(t);
        this.refresh_value();
    }
    refresh_value() {
        const forced = this.io.frozen?.();
        this.input.checked = !!(forced ?? this.io.get());
        this.lock(forced !== undefined);
    }
}
class UI_VECTOR extends UI_ELEMENT {
    n;
    o;
    inputs = [];
    decimals;
    constructor(parent, label, key, io, n, o) {
        super(parent, label, key, io, "vec");
        this.n = n;
        this.o = o;
        this.decimals = o.step ? Math.max(0, Math.ceil(-Math.log10(o.step))) : 3;
        const comps = document.createElement("div");
        comps.className = "comps";
        comps.style.setProperty("--n", String(n));
        for (let i = 0; i < n; ++i) {
            const c = document.createElement("span");
            c.className = "c";
            const axis = document.createElement("i");
            axis.textContent = o.labels[i] ?? "xyzw"[i];
            this.scrub(axis, i);
            const input = document.createElement("input");
            input.type = "number";
            input.step = String(o.step ?? 10 ** -this.decimals);
            input.addEventListener("change", () => {
                const x = parseFloat(input.value);
                if (Number.isNaN(x))
                    return this.refresh_value();
                const v = this.io.get();
                v[i] = x;
                this.apply(v);
            });
            c.append(axis, input);
            comps.appendChild(c);
            this.inputs.push(input);
        }
        this.row.appendChild(comps);
        this.row.addEventListener("dblclick", e => {
            if (!(e.target instanceof HTMLInputElement))
                this.reset();
        });
        this.refresh_value();
    }
    scrub(axis, i) {
        let x0 = 0, v0 = 0;
        axis.addEventListener("pointerdown", e => {
            if (this.is_frozen)
                return;
            axis.setPointerCapture(e.pointerId);
            x0 = e.clientX;
            v0 = this.io.get()[i];
            e.preventDefault();
        });
        axis.addEventListener("pointermove", e => {
            if (!axis.hasPointerCapture(e.pointerId))
                return;
            const speed = (this.o.step ?? 0.01) * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1);
            const v = this.io.get();
            v[i] = v0 + (e.clientX - x0) * speed;
            this.apply(v);
        });
    }
    apply(v) {
        if (this.is_frozen)
            return this.refresh_value();
        const { min, max, step } = this.o;
        const out = v.slice(0, this.n).map(x => {
            if (step)
                x = Math.round(x / step) * step;
            return Math.min(max, Math.max(min, x));
        });
        this.io.set(out);
        this.io.onChange?.(out);
        this.refresh_value();
    }
    refresh_value() {
        const forced = this.io.frozen?.();
        const v = forced ?? this.io.get();
        this.inputs.forEach((inp, i) => {
            if (document.activeElement !== inp)
                inp.value = v[i].toFixed(this.decimals);
        });
        this.lock(forced !== undefined);
    }
}
class UI_ENUM extends UI_ELEMENT {
    options;
    select = document.createElement("select");
    shown = null;
    constructor(parent, label, key, io, options) {
        super(parent, label, key, io, "enum");
        this.options = options;
        this.row.appendChild(this.select);
        this.select.addEventListener("change", () => { this.apply(+this.select.value); this.select.blur(); });
        this.row.addEventListener("dblclick", e => { if (e.target !== this.select)
            this.reset(); });
        this.refresh_value();
    }
    apply(v) {
        if (this.is_frozen)
            return this.refresh_value();
        this.io.set(v);
        this.io.onChange?.(v);
        this.refresh_value();
    }
    refresh_value() {
        const opts = this.options();
        const same = this.shown !== null && this.shown.length === opts.length &&
            opts.every((o, i) => o.value === this.shown[i].value && o.name === this.shown[i].name);
        if (!same) {
            this.select.replaceChildren(...opts.map(o => {
                const el = document.createElement("option");
                el.value = String(o.value);
                el.textContent = o.name;
                return el;
            }));
            this.shown = opts.map(o => ({ ...o }));
        }
        const forced = this.io.frozen?.();
        this.select.value = String(forced ?? this.io.get());
        this.lock(forced !== undefined);
        this.select.title = forced !== undefined ? "locked by the current view" : "";
    }
}
class UI_COLOR extends UI_ELEMENT {
    inputs = [];
    picker = document.createElement("input");
    swatch = document.createElement("label");
    constructor(parent, label, key, io) {
        super(parent, label, key, io, "color");
        // native color dialog, behind the square swatch
        this.swatch.className = "swatch";
        this.picker.type = "color";
        this.swatch.appendChild(this.picker);
        this.picker.addEventListener("input", () => {
            const n = parseInt(this.picker.value.slice(1), 16);
            this.apply([((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]);
        });
        // numeric view, 0..1
        const comps = document.createElement("div");
        comps.className = "comps";
        comps.style.setProperty("--n", "3");
        "rgb".split("").forEach((axis, i) => {
            const c = document.createElement("span");
            c.className = "c";
            const a = document.createElement("i");
            a.textContent = axis;
            this.scrub(a, i);
            const input = document.createElement("input");
            input.type = "number";
            input.step = "0.01";
            input.addEventListener("change", () => {
                const x = parseFloat(input.value);
                if (Number.isNaN(x))
                    return this.refresh_value();
                const v = this.io.get();
                v[i] = x;
                this.apply(v);
            });
            c.append(a, input);
            comps.appendChild(c);
            this.inputs.push(input);
        });
        this.row.append(comps, this.swatch);
        this.row.addEventListener("dblclick", e => {
            if (!(e.target instanceof HTMLInputElement))
                this.reset();
        });
        this.refresh_value();
    }
    /** drag an axis letter left/right to change that channel (shift = x10, alt = x0.1). */
    scrub(axis, i) {
        let x0 = 0, v0 = 0;
        axis.addEventListener("pointerdown", e => {
            if (this.is_frozen)
                return;
            axis.setPointerCapture(e.pointerId);
            x0 = e.clientX;
            v0 = this.io.get()[i];
            e.preventDefault();
        });
        axis.addEventListener("pointermove", e => {
            if (!axis.hasPointerCapture(e.pointerId))
                return;
            const speed = 0.013 * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1);
            const v = this.io.get();
            v[i] = v0 + (e.clientX - x0) * speed;
            this.apply(v);
        });
    }
    static hex(v) {
        return "#" + [0, 1, 2].map(i => Math.round(Math.min(1, Math.max(0, v[i])) * 255).toString(16).padStart(2, "0")).join("");
    }
    apply(v) {
        if (this.is_frozen)
            return this.refresh_value();
        const out = v.slice(0, 3).map(x => Math.min(1, Math.max(0, x)));
        this.io.set(out);
        this.io.onChange?.(out);
        this.refresh_value();
    }
    refresh_value() {
        const forced = this.io.frozen?.();
        const v = forced ?? this.io.get();
        this.inputs.forEach((inp, i) => {
            if (document.activeElement !== inp)
                inp.value = v[i].toFixed(2);
        });
        const hex = UI_COLOR.hex(v);
        // only write when it differs, so a live drag isn't fought by the 8-bit round trip
        if (this.picker.value !== hex)
            this.picker.value = hex;
        this.swatch.style.setProperty("--c", hex);
        this.lock(forced !== undefined);
    }
}
/** basic structural lint, 1-based lines. */
function lint_glsl(src, required_fn) {
    const out = [];
    const lines = src.split("\n");
    const stack = [];
    const pair = { ")": "(", "]": "[", "}": "{" };
    let in_block = false;
    lines.forEach((raw, i) => {
        let l = raw;
        if (in_block) { // inside /* ... */
            const e = l.indexOf("*/");
            if (e < 0)
                return;
            l = l.slice(e + 2);
            in_block = false;
        }
        l = l.replace(/\/\*.*?\*\//g, "").replace(/\/\/.*/, "");
        if (l.includes("/*")) {
            in_block = true;
            l = l.slice(0, l.indexOf("/*"));
        }
        for (const c of l) {
            if ("([{".includes(c))
                stack.push({ c, line: i + 1 });
            else if (")]}".includes(c)) {
                const top = stack.pop();
                if (!top || top.c !== pair[c])
                    out.push({ line: i + 1, msg: `unmatched '${c}'` });
            }
        }
        if (/\b(while|do)\b/.test(l))
            out.push({ line: i + 1, msg: "while/do loops are not allowed" });
        if (/\bfor\s*\(/.test(l) && !/\bfor\s*\(\s*int\s+\w+\s*=\s*\d+\s*;\s*\w+\s*<=?\s*\d+\s*;/.test(l))
            out.push({ line: i + 1, msg: "for loops need constant bounds: for (int i = 0; i < N; ++i)" });
    });
    for (const s of stack)
        out.push({ line: s.line, msg: `unclosed '${s.c}'` });
    if (required_fn && !new RegExp(`\\b${required_fn}\\s*\\(`).test(src))
        out.push({ line: 1, msg: `missing function '${required_fn}'` });
    return out;
}
class UI_GLSL extends UI_ELEMENT {
    o;
    win = document.createElement("div");
    ta;
    hl;
    sq;
    gut;
    $err;
    errors = [];
    timer = 0;
    built = false;
    $btn;
    busy = false;
    btn_timer = 0;
    constructor(parent, label, key, io, o) {
        const t = io.tooltip;
        delete io.tooltip;
        super(parent, label, key, io, "glsl");
        this.o = o;
        const b = document.createElement("button");
        b.className = "glsl-open";
        b.textContent = o.button;
        b.addEventListener("click", () => this.open());
        this.row.appendChild(b);
        if (t)
            UI_TOOLTIP.attach(b, t);
    }
    show() { this.lock(this.io.frozen?.() !== undefined); }
    apply(v) { if (this.is_frozen)
        return; this.io.set(v); this.io.onChange?.(v); }
    get is_open() { return this.built && !this.win.hidden; }
    open() {
        if (this.is_frozen)
            return;
        if (!this.built)
            this.build();
        this.win.hidden = false;
        this.ta.value = this.io.get();
        this.errors = [];
        this.$err.textContent = "";
        this.render();
        this.ta.focus();
        this.set_btn("idle");
    }
    close() { this.win.hidden = true; document.activeElement?.blur(); }
    /** compiles the editor text. On success the window closes. */
    submit() {
        if (this.busy)
            return;
        this.busy = true;
        this.set_btn("busy");
        const t0 = performance.now();
        // one frame, so the loader is painted before the (synchronous) compile
        requestAnimationFrame(() => setTimeout(() => {
            const result = this.run_compile();
            const wait = Math.max(0, 250 - (performance.now() - t0));
            setTimeout(() => {
                this.busy = false;
                if (result.ok)
                    this.set_btn("ok", 1400);
                // @ts-ignore
                else {
                    this.show_errors(result.errors);
                    this.set_btn("fail");
                } // stays red until the next edit
            }, wait);
        }, 0));
    }
    run_compile() {
        const src = this.ta.value;
        const hard = lint_glsl(src, this.o.required_fn);
        if (hard.length)
            return { ok: false, errors: hard.map(h => ({ ...h, hard: true })) };
        const log = this.o.compile(src);
        if (log === null) {
            this.apply(src);
            this.errors = [];
            this.$err.textContent = "";
            this.render();
            return { ok: true };
        }
        const found = [];
        for (const m of log.matchAll(/(?:ERROR|WARNING):\s*\d+:(\d+):\s*([^\n]*)/g))
            found.push({ line: Math.max(1, +m[1] - this.o.line_offset), msg: m[2], hard: true });
        return { ok: false, errors: found.length ? found : [{ line: 1, msg: log.trim(), hard: true }] };
    }
    show_errors(errs) {
        this.errors = errs;
        this.$err.textContent = errs.map(e => `line ${e.line}: ${e.msg}`).join("\n");
        this.$err.scrollTop = 0;
        this.render();
    }
    render() {
        const src = this.ta.value, lines = src.split("\n");
        this.hl.innerHTML = highlight_glsl(src);
        this.gut.innerHTML = lines.map((_, i) => `<span${this.errors.some(e => e.line === i + 1 && e.hard) ? ' class="e"' : ""}>${i + 1}</span>`).join("\n") + "\n";
        // squiggle layer: same text, transparent, only the error lines underlined
        const bad = new Map(this.errors.map(e => [e.line, e]));
        this.sq.innerHTML = lines.map((l, i) => {
            if (!bad.has(i + 1) || !l.trim())
                return esc(l);
            const lead = l.length - l.trimStart().length, body = l.trimStart();
            return esc(l.slice(0, lead)) + `<span class="sq">${esc(body)}</span>`;
        }).join("\n") + "\n";
        this.sync();
    }
    sync() {
        for (const p of [this.hl, this.sq, this.gut]) {
            p.scrollTop = this.ta.scrollTop;
            p.scrollLeft = p === this.gut ? 0 : this.ta.scrollLeft;
        }
    }
    set_btn(state, revert_ms = 0) {
        clearTimeout(this.btn_timer);
        this.$btn.dataset.state = state;
        this.$btn.querySelector(".lbl").textContent =
            state === "busy" ? "Compiling" : state === "ok" ? "✓ Compiled" : state === "fail" ? "✕ Failed" : "▶ Compile";
        if (revert_ms)
            this.btn_timer = window.setTimeout(() => this.set_btn("idle"), revert_ms);
    }
    build() {
        this.built = true;
        const w = this.win;
        w.className = "glsl-win";
        w.hidden = true;
        w.innerHTML = `
          <header>
            <span class="title">${this.o.title}</span>
            <button class="compile" data-state="idle" title="Ctrl+S">
            <span class="spin"></span><span class="lbl">▶ Compile</span><kbd>Ctrl+S</kbd>
            </button>
            <button class="x" title="Close (Esc)">×</button>
          </header>
          <div class="gbody">
            <pre class="gut" aria-hidden="true"></pre>
            <div class="ed"><pre class="hl" aria-hidden="true"></pre><pre class="sqp" aria-hidden="true"></pre>
              <textarea spellcheck="false" autocapitalize="off" autocomplete="off"></textarea></div>
          </div>
          <footer class="gerr"></footer>`;
        this.gut = w.querySelector(".gut");
        this.hl = w.querySelector(".hl");
        this.sq = w.querySelector(".sqp");
        this.ta = w.querySelector("textarea");
        this.$err = w.querySelector(".gerr");
        this.$btn = w.querySelector(".compile");
        w.querySelector(".x").addEventListener("click", () => this.close());
        w.querySelector(".compile").addEventListener("click", () => this.submit());
        this.ta.addEventListener("scroll", () => this.sync());
        this.ta.addEventListener("input", () => {
            if (this.$btn.dataset.state === "fail" || this.$btn.dataset.state === "ok")
                this.set_btn("idle");
            this.errors = []; // stale after an edit
            this.$err.textContent = "";
            this.render();
            clearTimeout(this.timer);
            this.timer = window.setTimeout(() => {
                const l = lint_glsl(this.ta.value, this.o.required_fn);
                if (l.length) {
                    this.errors = l.map(x => ({ ...x, hard: false }));
                    this.$err.textContent = "";
                    this.render();
                }
            }, 400);
        });
        w.addEventListener("keydown", e => {
            e.stopPropagation(); // keep global hotkeys out
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                this.submit();
            }
            else if (e.key === "Escape")
                this.close();
            else if (e.key === "Tab") {
                e.preventDefault();
                this.ta.setRangeText("    ", this.ta.selectionStart, this.ta.selectionEnd, "end");
                this.ta.dispatchEvent(new Event("input"));
            }
        });
        isolate(w);
        w.addEventListener("wheel", e => e.stopPropagation(), { passive: true });
        $("hud").appendChild(w);
    }
    refresh_value() { }
}
class UI_SECTION {
    name;
    el = document.createElement("section");
    body = document.createElement("div");
    elements = [];
    visible;
    constructor(name, visible, open = true) {
        this.name = name;
        const h3 = document.createElement("h3");
        h3.textContent = name;
        h3.addEventListener("click", () => this.open(!this.is_open));
        this.body.className = "body";
        this.el.dataset.id = name;
        this.el.append(h3, this.body);
        this.open(open);
        this.visible = visible;
    }
    get is_open() { return this.el.classList.contains("open"); }
    open(v = true) { this.el.classList.toggle("open", v); }
    set_visible(visible, open_on_show = true) {
        const v = !visible;
        if (v === this.el.hidden)
            return;
        this.el.hidden = v;
        if (visible && open_on_show)
            this.open(true);
    }
    toggle_visibility() { this.set_visible(this.el.hidden); }
    refresh_visibility() {
        if (this.visible)
            this.set_visible(this.visible());
    }
    refresh() {
        this.refresh_visibility();
        if (!this.el.hidden)
            this.elements.forEach(e => e.refresh());
    }
    push(e) { this.elements.push(e); return e; }
    slider(d) {
        const b = bind(d.obj, d.key, x => x);
        return this.push(new UI_SLIDER(this.body, d.label, String(d.key), {
            get: () => b.target()[d.key],
            set: v => { b.target()[d.key] = v; },
            def: b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, { min: () => val(d.min), max: () => val(d.max), step: d.step, log: d.log ?? false, int: d.int ?? false }));
    }
    toggle(d) {
        const b = bind(d.obj, d.key, x => x);
        return this.push(new UI_TOGGLE(this.body, d.label, String(d.key), {
            get: () => b.target()[d.key],
            set: v => { b.target()[d.key] = v; },
            def: b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, d.int ?? false));
    }
    enum(d) {
        const b = bind(d.obj, d.key, x => x);
        return this.push(new UI_ENUM(this.body, d.label, String(d.key), {
            get: () => b.target()[d.key],
            set: v => { b.target()[d.key] = v; },
            def: b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, () => val(d.options)));
    }
    vec(n, d) {
        const arr = (t) => t[d.key];
        const read = (t) => Array.from({ length: n }, (_, i) => arr(t)[i]);
        const b = bind(d.obj, d.key, () => read(val(d.obj)));
        return this.push(new UI_VECTOR(this.body, d.label, String(d.key), {
            get: () => read(b.target()),
            set: v => { const a = arr(b.target()); for (let i = 0; i < n; ++i)
                a[i] = v[i]; }, // in place
            def: b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, n, { min: d.min ?? -Infinity, max: d.max ?? Infinity, step: d.step, labels: d.labels ?? "xyzw" }));
    }
    vec2(d) { return this.vec(2, d); }
    vec3(d) { return this.vec(3, d); }
    vec4(d) { return this.vec(4, d); }
    color(d) {
        const arr = (t) => t[d.key];
        const read = (t) => [arr(t)[0], arr(t)[1], arr(t)[2]];
        const b = bind(d.obj, d.key, () => read(val(d.obj)));
        return this.push(new UI_COLOR(this.body, d.label, String(d.key), {
            get: () => read(b.target()),
            set: v => { const a = arr(b.target()); for (let i = 0; i < 3; ++i)
                a[i] = v[i]; }, // in place
            def: b.def, frozen: d.frozen, onChange: d.onPick,
            visible: d.visible, tooltip: d.tooltip
        }));
    }
    glsl(d) {
        const b = bind(d.obj, d.key, x => x);
        return this.push(new UI_GLSL(this.body, d.label, String(d.key), {
            get: () => b.target()[d.key],
            set: v => { b.target()[d.key] = v; },
            def: b.def, frozen: d.frozen, onChange: d.onChange,
            visible: d.visible, tooltip: d.tooltip
        }, d));
    }
    /** a small heading inside the section, to group the rows that follow it. */
    subtitle(text) {
        const el = document.createElement("div");
        el.className = "subtitle";
        el.textContent = text;
        this.body.appendChild(el);
        return el; // returned so callers can hide or rename it
    }
    /** a thin horizontal rule between groups of rows. */
    separator() {
        const el = document.createElement("hr");
        el.className = "sep";
        this.body.appendChild(el);
        return el;
    }
}
class UI_PALETTE {
    palette;
    onPick;
    onAdd;
    section;
    grid = document.createElement("div");
    current;
    constructor(section, palette, picked, onPick, onAdd) {
        this.palette = palette;
        this.onPick = onPick;
        this.onAdd = onAdd;
        this.section = section;
        this.current = picked;
        this.grid.id = "color-picker";
        section.body.appendChild(this.grid);
        this.render();
    }
    static hex(c) {
        return "#" + [c[0], c[1], c[2]].map(v => v.toString(16).padStart(2, "0")).join("");
    }
    /** rebuilds the swatches, call after changing the palette array. */
    render() {
        this.grid.replaceChildren();
        this.palette.forEach((c, i) => {
            const b = document.createElement("button");
            b.className = "sw";
            b.style.setProperty("--c", UI_PALETTE.hex(c.color));
            b.title = UI_PALETTE.hex(c.color);
            b.addEventListener("click", () => this.pick(i));
            this.grid.appendChild(b);
        });
        if (this.onAdd) {
            const add = document.createElement("label");
            add.className = "sw add";
            add.title = "Add color";
            add.innerHTML = `<span>+</span><input type="color" value="#ffffff">`;
            const inp = add.querySelector("input");
            inp.addEventListener("change", () => {
                const n = parseInt(inp.value.slice(1), 16);
                this.onAdd(get_color_data(new Uint8Array([(n >> 16) & 255, (n >> 8) & 255, n & 255, 255])));
                this.render();
                this.pick(this.palette.length - 1);
            });
            this.grid.appendChild(add);
        }
        this.highlight(Math.min(this.current, this.palette.length - 1));
    }
    highlight(i) {
        this.current = i;
        this.grid.querySelectorAll(".sw:not(.add)")
            .forEach((b, k) => b.classList.toggle("picked", k === i));
    }
    /** selects a swatch; notify=false only moves the highlight (use it when code changed the color). */
    pick(i, notify = true) {
        this.highlight(i);
        if (notify)
            this.onPick(i);
    }
    get picked() { return this.current; }
    toggle_visibility() {
        this.section.toggle_visibility();
    }
}
class UI_INSPECTOR {
    root = $("inspector");
    body = $("insp-body");
    btn = $("insp-toggle");
    sections = new Map();
    constructor() {
        isolate(this.root);
        this.btn.addEventListener("click", () => this.collapse(!this.collapsed));
        this.init_resize();
    }
    get collapsed() { return this.root.classList.contains("min"); }
    collapse(v = true) {
        this.root.classList.toggle("min", v);
        this.btn.textContent = v ? "+" : "–";
    }
    /** returns the section, creating it on first use. */
    section(name, visible, open = true) {
        let s = this.sections.get(name);
        if (!s) {
            s = new UI_SECTION(name, visible, open);
            this.sections.set(name, s);
            this.body.appendChild(s.el);
        }
        return s;
    }
    /** builds the palette section (always first) and its swatch grid. */
    palette(palette, picked, onPick, onAdd) {
        const s = new UI_SECTION("Palette", () => mouse.mode === MOUSE_MODE_DYE || mouse.mode === MOUSE_MODE_DYE_FORCE, true);
        this.sections.set("Palette", s);
        this.body.append(s.el);
        return new UI_PALETTE(s, palette, picked, onPick, onAdd);
    }
    /** opens one section and closes the others (the pinned palette stays as it is). */
    focus(name) {
        const target = this.sections.get(name);
        if (!target)
            return;
        target.open(true);
        target.el.scrollIntoView({ block: "nearest" });
    }
    refresh() { for (const s of this.sections.values())
        s.refresh(); }
    toggle_visibility() {
        this.root.hidden = !this.root.hidden;
    }
    init_resize() {
        const handle = $("insp-resize");
        const MIN = 240, MAX = () => Math.min(720, innerWidth - 120);
        const saved = parseInt(localStorage.getItem("insp_w") ?? "", 10);
        if (saved)
            this.root.style.width = `${Math.min(MAX(), Math.max(MIN, saved))}px`;
        handle.addEventListener("pointerdown", e => {
            handle.setPointerCapture(e.pointerId);
            const x0 = e.clientX, w0 = this.root.getBoundingClientRect().width;
            const move = (ev) => {
                // the panel is anchored right, so dragging left makes it wider
                const w = Math.min(MAX(), Math.max(MIN, w0 + (x0 - ev.clientX)));
                this.root.style.width = `${w}px`;
            };
            const up = (ev) => {
                handle.releasePointerCapture(ev.pointerId);
                handle.removeEventListener("pointermove", move);
                handle.removeEventListener("pointerup", up);
                localStorage.setItem("insp_w", String(Math.round(this.root.getBoundingClientRect().width)));
            };
            handle.addEventListener("pointermove", move);
            handle.addEventListener("pointerup", up);
            e.preventDefault();
        });
        handle.addEventListener("dblclick", () => { this.root.style.width = ""; localStorage.removeItem("insp_w"); });
    }
}
class UI_TOOLBAR {
    onPick;
    nav = $("tools");
    buttons = new Map();
    keys = new Map();
    current;
    constructor(items, initial, onPick) {
        this.onPick = onPick;
        isolate(this.nav);
        for (const it of items) {
            if (it.separator)
                this.nav.appendChild(document.createElement("hr"));
            const b = document.createElement("button");
            b.dataset.tip = it.key ? `${it.tip}  [${it.key.toUpperCase()}]` : it.tip;
            b.innerHTML = `<svg viewBox="0 0 24 24">${it.icon}</svg>`;
            b.addEventListener("click", () => this.pick(it.id));
            this.nav.appendChild(b);
            this.buttons.set(it.id, b);
            if (it.key)
                this.keys.set(it.key.toLowerCase(), it.id);
        }
        addEventListener("keydown", e => {
            if (is_typing(e))
                return;
            const id = this.keys.get(e.key.toLowerCase());
            if (id !== undefined)
                this.pick(id);
        });
        this.current = initial;
        this.pick(initial);
    }
    /** selects a tool. notify=false only moves the highlight, without calling onPick. */
    pick(id, notify = true) {
        this.current = id;
        this.buttons.forEach((b, k) => b.classList.toggle("on", k === id));
        if (notify)
            this.onPick(id);
    }
    get picked() { return this.current; }
    toggle_visibility() {
        this.nav.hidden = !this.nav.hidden;
    }
    add_toggle(o) {
        this.nav.appendChild(document.createElement("hr"));
        const b = document.createElement("button");
        b.className = "toggle";
        b.dataset.tip = o.tip;
        b.innerHTML = `<svg viewBox="0 0 24 24">${o.icon}</svg>`;
        let state = o.initial;
        const set = (on, notify = true) => {
            state = on;
            b.classList.toggle("active", on);
            b.setAttribute("aria-pressed", String(on));
            if (notify)
                o.onToggle(on);
        };
        b.addEventListener("click", () => { set(!state); b.blur(); }); // blur so Space doesn't re-click it
        this.nav.appendChild(b);
        set(o.initial, false);
        return { set, toggle: () => set(!state), get on() { return state; } };
    }
}
class UI_VIEW_SELECT {
    onPick;
    root = $("view-select");
    btn = $("view-btn");
    list = $("view-list");
    $name = $("view-name");
    items = new Map();
    current;
    constructor(items, initial, onPick) {
        this.onPick = onPick;
        isolate($("view-select"));
        const keys = new Map();
        for (const it of items) {
            const li = document.createElement("li");
            li.innerHTML = `<span>${it.name}</span>${it.key ? `<kbd>${it.key}</kbd>` : ""}`;
            li.addEventListener("click", () => { this.pick(it.id); this.close(); });
            this.list.appendChild(li);
            this.items.set(it.id, { name: it.name, li });
            if (it.key)
                keys.set(it.key.toLowerCase(), it.id);
        }
        this.btn.addEventListener("click", e => { e.stopPropagation(); this.toggle(); });
        document.addEventListener("click", () => this.close());
        addEventListener("keydown", e => {
            if (is_typing(e))
                return;
            const id = keys.get(e.key.toLowerCase());
            if (id !== undefined)
                this.pick(id);
            if (e.key === "Escape")
                this.close();
        });
        this.current = initial;
        this.pick(initial);
    }
    /** selects a view. notify=false only updates the label and highlight. */
    pick(id, notify = true) {
        this.current = id;
        this.items.forEach((v, k) => {
            v.li.classList.toggle("on", k === id);
            if (k === id)
                this.$name.textContent = v.name;
        });
        if (notify)
            this.onPick(id);
    }
    get picked() { return this.current; }
    get is_open() { return !this.list.hidden; }
    open(v = true) {
        this.list.hidden = !v;
        this.btn.setAttribute("aria-expanded", String(v));
    }
    close() { this.open(false); }
    toggle() { this.open(!this.is_open); }
    toggle_visibility() {
        this.root.hidden = !this.root.hidden;
    }
}
/* ================================================================== */
/*  status bar (bottom center)                                        */
/* ================================================================== */
class UI_STATUS {
    root = $("status");
    $cursor = $("st-cursor");
    $tool = $("st-tool");
    $fps = $("st-fps");
    fps_smooth = 60;
    constructor() { isolate($("status")); }
    cursor(x, y) {
        this.$cursor.textContent = `x ${x.toFixed(3)}  y ${y.toFixed(3)}`;
    }
    tool(name) { this.$tool.textContent = name; }
    /** pass the frame time in seconds, the display is smoothed. */
    fps(dt) {
        if (dt > 0 && dt < 1)
            this.fps_smooth += (1 / dt - this.fps_smooth) * 0.05;
        this.$fps.textContent = `${this.fps_smooth.toFixed(0)} fps`;
    }
    toggle_visibility() {
        this.root.hidden = !this.root.hidden;
    }
}
/* ================================================================== */
/*  world bounds in the screen corners                                */
/* ================================================================== */
class UI_BOUNDS {
    tl = $("c-tl");
    tr = $("c-tr");
    bl = $("c-bl");
    br = $("c-br");
    static fmt(el, x, y) {
        const f = (v) => (v >= 0 ? "+" : "") + v.toFixed(2);
        el.textContent = `${f(x)}, ${f(y)}`;
    }
    /** window centered at (cx, cy) with half extents (hw, hh).
     *  Uses the force shader's convention, p = (0.5 - uv) * ... + center, so x and y
     *  decrease toward the right and the top. */
    update(cx, cy, hw, hh) {
        const x0 = cx - hw, x1 = cx + hw, y0 = cy - hh, y1 = cy + hh;
        UI_BOUNDS.fmt(this.tl, x0, y1);
        UI_BOUNDS.fmt(this.tr, x1, y1);
        UI_BOUNDS.fmt(this.bl, x0, y0);
        UI_BOUNDS.fmt(this.br, x1, y0);
    }
    toggle_visibility() {
        this.tl.hidden = this.tr.hidden = this.bl.hidden = this.br.hidden = !this.tl.hidden;
    }
}

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
            new uniform("relax", GL_FLOAT, U_UPDATE, () => force.pure_vector_field ? force.relaxation : -1.0)
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
        new uniform("relax", GL_FLOAT, U_UPDATE, () => force.pure_vector_field ? force.relaxation : -1.0)
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

"use strict";
let velocity_tex, velocity_fbo, dye_tex, dye_fbo, pressure_tex, pressure_fbo, divergence_tex, divergence_fbo, curl_tex, curl_fbo, curl_smooth_tex, curl_smooth_fbo, obstacles_tex, obstacles_fbo, velocity_read, pressure_read, dye_read;
// reduction_sim_tex = [] as WebGLTexture[],
// reduction_sim_fbo = [] as WebGLFramebuffer[],
// reduction_sim_1x1_tex = [] as WebGLTexture[],
// reduction_sim_1x1_fbo = [] as WebGLTexture[],
// reduction_sim_read: number,
// reduction_dye_tex = [] as WebGLTexture[],
// reduction_dye_fbo = [] as WebGLFramebuffer[],
// reduction_dye_1x1_tex = [] as WebGLTexture[],
// reduction_dye_1x1_fbo = [] as WebGLTexture[],
// reduction_dye_read: number;
function init_textures() {
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
    // init_
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
    // reduction_dye_read = 0;
    // reduction_sim_read = 0;
}

"use strict";
let ui_toolbar, ui_status, ui_views, ui_inspector, ui_palette, ui_bounds, 
//ui_brush_s: UI_SECTION,
ui_dye_brush_s, ui_force_brush_s, ui_diffusion_s, ui_wall_s, ui_field_s, ui_fluid_s, ui_field_strength, ui_field_center, ui_field_span, ui_visualizer_s, ui_container, ui_force_btn, ui_borders_btn, ui_fluid_bg, ui_field_glsl;
function ui_update_bounds() {
    const h = force.span * 0.25;
    ui_bounds.update(force.center[0], force.center[1], h * ASPECT_NUM, h);
}
function ui_set_force_active(on) {
    if (on === force.is_active)
        return;
    force.is_active = on;
    ui_field_s.toggle_visibility();
    ui_bounds.toggle_visibility();
}
function init_ui() {
    ui_bounds = new UI_BOUNDS();
    ui_status = new UI_STATUS();
    ui_inspector = new UI_INSPECTOR();
    const sim = ui_inspector.section("Precision");
    sim.slider({ label: "time scale", tooltip: "$Time scale$ {Multiplies the simulated time that passes per frame.} $$Values$$ {[0]: paused\n[0.1 – 0.9]: slow motion\n[1]: real time\n[1 – 2]: fast forward, less stable}", obj: renderer, key: "time_scale", min: 0.0, max: 2.0 });
    sim.slider({ label: "dt", tooltip: "$Time step$ {Seconds simulated per step. Smaller steps are more accurate and stable, larger ones are faster but smear and can blow up.} $$Values$$ {[0.004 – 0.008]: very accurate (120–240 Hz)\n[0.0167]: default (60 Hz)\n[> 0.025]: visibly unstable with strong forces}", obj: renderer, key: "fixed_delta_time", min: 0.0, max: 1 / 30 });
    sim.slider({ label: "iterations", tooltip: "$Pressure iterations$ {Jacobi passes per step. Pressure travels one texel per pass, so more passes make the fluid more incompressible and let flow reach far through thin tubes.} $$Values$$ {[0]: no projection, the fluid compresses\n[20 – 40]: fast, mushy\n[60 – 150]: good quality\n[> 200]: only for long thin channels}", obj: fluid, key: "jacobi_iterations", min: 0, max: 300, int: true });
    ui_palette = ui_inspector.palette(palette_color_data, stroke.palette_color, i => { stroke.palette_color = i; }, c => { stroke.choosen_palette.push(c); });
    ui_dye_brush_s = ui_inspector.section("Dye brush", () => mouse.mode === MOUSE_MODE_DYE || mouse.mode === MOUSE_MODE_DYE_FORCE);
    ui_dye_brush_s.slider({ label: "radius", tooltip: "$Dye radius$ {Size of the dye brush, as the 1/e radius of a Gaussian in sim texels.} $$Values$$ {[1 – 5]: thin lines\n[10 – 25]: normal\n[> 40]: big soft blobs}", obj: splat, key: "dye_radius", min: 1e-4, max: 0.01, log: true });
    ui_dye_brush_s.slider({ label: "strength", tooltip: "$Dye strength$ {How strongly the brush replaces the existing dye per frame. It blends, it never adds, so slow strokes can't saturate.} $$Values$$ {[0 – 0.2]: faint, builds up slowly\n[0.3 – 0.6]: normal\n[0.8 – 1]: opaque, overrides what is there}", obj: splat, key: "dye_strength", min: 0, max: 1 });
    ui_force_brush_s = ui_inspector.section("Force brush", () => mouse.mode === MOUSE_MODE_DYE_FORCE || mouse.mode === MOUSE_MODE_FORCE);
    ui_force_brush_s.slider({ label: "radius", tooltip: "$Force radius$ {Size of the push applied by the brush, in sim texels (1/e radius). Wider pushes survive the pressure projection and carry flow farther.} $$Values$$ {[1 – 8]: sharp, dies quickly\n[15 – 30]: normal\n[> 40]: broad, slow currents}", obj: splat, key: "velocity_radius", min: 1e-4, max: 0.02, log: true });
    ui_force_brush_s.slider({ label: "strength", tooltip: "$Force strength$ {Opacity of the push at the center of the brush.} $$Values$$ {[0 – 0.3]: gentle\n[0.4 – 0.7]: normal\n[0.8 – 1]: full push}", obj: splat, key: "velocity_strength", min: 0, max: 1 });
    ui_force_brush_s.slider({ label: "speed sensitivity", tooltip: "$Speed sensitivity$ {Converts mouse speed into fluid speed.} $$Values$$ {[0]: the brush injects no motion\n[0.2 – 0.5]: normal\n[> 1]: small movements make violent jets}", obj: splat, key: "force_scale", min: 0, max: 2 });
    ui_wall_s = ui_inspector.section("Wall brush", () => mouse.mode === MOUSE_MODE_WALL);
    ui_wall_s.slider({ label: "radius", tooltip: "$Wall radius$ {Half thickness of the wall stroke, in units of screen height. Total thickness is twice this value.} $$Values$$ {[< 0.006]: under 3 texels, leaks\n[0.008 – 0.02]: solid walls\n[> 0.03]: big blocks}", obj: obstacle_splat, key: "radius", min: 0.002, max: 0.05, log: true });
    ui_wall_s.slider({ label: "outline thickness", tooltip: "$Edge softness$ {Width of the soft ramp at the wall contour. It makes the rim smooth and anti-aliased.} $$Values$$ {[0.0005 – 0.002]: crisp\n[0.003]: default\n[> 0.006]: blurry walls}", obj: obstacle_splat, key: "outline_width", min: 0.0005, max: 0.01, log: true });
    ui_field_s = ui_inspector.section("Force field", () => force.is_active);
    ui_field_glsl = ui_field_s.glsl({
        label: "field", obj: force, key: "glsl",
        tooltip: "$Field source$ {Edit [get_velocity(vec2 p)] in GLSL. [p] is the world position, the return value is the velocity at that point before the strength is applied.} {Compile with [Ctrl+S]. Errors show on the line.}",
        title: "glsl code", button: "get_velocity(vec2 p)",
        required_fn: "get_velocity", line_offset: 0,
        compile: (s) => {
            if (!force.is_active) {
                force.is_active = true;
                ui_force_btn.set(true, false);
            }
            return recompile_forcefield(s);
        }
    });
    ui_field_center = ui_field_s.vec2({ label: "center", tooltip: "$Center$ {World coordinates that sit at the middle of the screen. Right-drag pans it.} $$Values$$ {Any value. The corner labels show the result.}", obj: force, key: "center", step: 0.01, onChange: ui_update_bounds });
    ui_field_strength = ui_field_s.slider({ label: "strength", tooltip: "$Force strength$ {Scales the velocity returned by [get_velocity].} {Higher values push the fluid harder and hit the speed cap sooner.} $$Values$$ {[1 – 100]: gentle drift\n[100 – 1000]: strong flow\n[> 1000]: saturates [max velocity]}", obj: force, key: "strength", min: 1, max: 10000 });
    ui_field_span = ui_field_s.slider({ label: "window", tooltip: "$Window$ {World width that the screen shows. Mouse wheel zooms it.} $$Values$$ {[0.5 – 5]: zoomed in on the details\n[10 – 40]: a few periods of the field\n[> 100]: whole field in view}", obj: force, key: "span", min: 0.5, max: 200, log: true, onChange: ui_update_bounds });
    ui_field_s.separator();
    ui_field_s.subtitle("vector field");
    ui_field_s.toggle({ label: "pure field", tooltip: "$Pure field$ {Pulls the velocity back toward the field after the pressure solve, so the picture follows the vector field and the fluid only adds perturbations.} {Off: the field is a plain force and the solver reshapes it.}", obj: force, key: "pure_vector_field", int: true });
    ui_field_s.slider({ label: "relaxation", tooltip: "$Relaxation$ {How quickly the velocity returns to the field, in 1/s.} $$Values$$ {[0 – 1]: loose, the fluid dominates\n[2 – 5]: field plus eddies\n[> 15]: practically the raw field}", obj: force, key: "relaxation", min: 0.0, max: 30.0, visible: () => force.pure_vector_field });
    ui_fluid_s = ui_inspector.section("Simulation");
    ui_fluid_bg = ui_fluid_s.color(({
        label: "background", tooltip: "$Background$ {Color of the empty fluid. Changing it clears the dye. Locked while a non-dye view is shown.} $$Values$$ {Each channel [0 – 1].}", obj: fluid, key: "bg_arr", onPick: () => {
            color_logarithm(fluid.bg, fluid.bg_arr);
            renderer.request_color_clear = { pending: true, noise: false };
        },
        frozen: () => fluid.display_mode === DISPLAY_DYE ? undefined : fluid.bg_arr,
    }));
    ui_fluid_s.slider({ label: "jacobi scale", tooltip: "$Pressure carry-over$ {Fraction of last frame's pressure used as the starting guess. High values converge faster over time.} $$Values$$ {[0 – 0.5]: restarts, needs many iterations\n[0.8 – 0.95]: good\n[1]: never forgets, can accumulate noise}", obj: fluid, key: "jacobi_scale", min: 0, max: 1 });
    ui_fluid_s.slider({ label: "curl strength", tooltip: "$Vorticity confinement$ {Re-injects the swirl lost to numerical blur, so eddies live longer.} $$Values$$ {[0]: smooth, dies quickly\n[5 – 20]: lively\n[> 35]: noisy, can go unstable}", obj: fluid, key: "curl_strength", min: 0, max: 60 });
    ui_fluid_s.slider({ label: "velocity decay", tooltip: "$Velocity decay$ {Multiplier applied to the velocity every step. Below 1 acts like friction.} $$Values$$ {[1]: motion never fades\n[0.999 – 0.9999]: slow fade\n[< 0.99]: thick, syrup-like}", obj: fluid, key: "velocity_dissipation", min: 0.9, max: 1, step: 0.0001 });
    ui_fluid_s.slider({ label: "max velocity", tooltip: "$Max velocity$ {Speed cap in texels/s. It keeps the solver stable.} $$Values$$ {[50 – 300]: calm\n[400 – 1500]: normal\n[> 3000]: only with a small dt}", obj: fluid, key: "max_velocity", min: 0, max: 10000 });
    ui_diffusion_s = ui_inspector.section("Diffusion");
    ui_diffusion_s.slider({ label: "base diff.", tooltip: "$Base diffusion$ {Rate at which dye blends with its surroundings everywhere, in 1/s.} $$Values$$ {[0]: crisp, only advection mixes\n[0.5 – 2]: soft\n[> 5]: washes out fast}", obj: fluid, key: "base_diffusion", min: 0, max: 10 });
    ui_diffusion_s.slider({ label: "curl diff.", tooltip: "$Curl diffusion$ {Extra blending where the flow swirls, like eddy mixing.} $$Values$$ {[0]: off\n[0.05 – 0.3]: swirls blend\n[> 1]: vortex cores dissolve}", obj: fluid, key: "curl_diffusion", min: 0, max: 2 });
    ui_diffusion_s.slider({ label: "vel. diff.", tooltip: "$Speed diffusion$ {Extra blending proportional to the local speed.} $$Values$$ {[0]: off\n[0.02 – 0.1]: moving dye smears gently\n[> 0.3]: heavy blur in fast regions}", obj: fluid, key: "velocity_diffusion", min: 0, max: 0.5 });
    ui_diffusion_s.slider({ label: "max diff.", tooltip: "$Max diffusion$ {Upper limit of the total rate, in 1/s.} $$Values$$ {[2 – 10]: safe\n[> 20]: can wash out the dye in a few frames}", obj: fluid, key: "max_diffusion", min: 0, max: 30 });
    ui_diffusion_s.slider({ label: "diff. radius", tooltip: "$Diffusion radius$ {Radius of the blending ring in dye texels. Larger spreads color farther per step.} $$Values$$ {[1 – 3]: fine\n[4 – 6]: normal\n[> 8]: star-shaped artifacts}", obj: fluid, key: "diffusion_texel_radius", min: 1, max: 12 });
    const SECTION_OF_TOOL = {
        [MOUSE_MODE_DYE_FORCE]: "Dye brush",
        [MOUSE_MODE_DYE]: "Dye brush",
        [MOUSE_MODE_FORCE]: "Force brush",
        [MOUSE_MODE_WALL]: "Wall brush"
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
        ui_fluid_bg.refresh();
        ui_visualizer_s.refresh();
    });
    ui_force_btn = ui_toolbar.add_toggle({
        tip: "Force field [F]",
        icon: FORCE_ICON,
        initial: force.is_active,
        onToggle: ui_set_force_active,
    });
    ui_borders_btn = ui_toolbar.add_toggle({
        tip: "Open borders toogle [TAB]",
        icon: BORDERS_ICON,
        initial: fluid.open_borders === 0,
        onToggle: (v) => {
            if (v === !fluid.open_borders)
                return;
            fluid.open_borders = v ? 0 : 1;
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
    ui_visualizer_s = ui_inspector.section("visualizer", () => fluid.display_mode !== DISPLAY_DYE);
    ui_visualizer_s.enum({
        label: "palette",
        tooltip: "$Palette$ {Color map for non-dye views.} {[viridis]: perceptually even\n[hsv]: hue is the direction, brightness the magnitude\n[turbo]: rainbow\n[diverging]: blue–white–red, forced for divergence}",
        obj: fluid,
        key: "display_palette",
        options: () => fluid.display_mode === DISPLAY_DIVERGENCE ? [PALETTE_OPTIONS[3]] : [PALETTE_OPTIONS[0], PALETTE_OPTIONS[1], PALETTE_OPTIONS[2]],
        // divergence view forces the diverging palette, dye ignores palettes entirely
        frozen: () => fluid.display_mode === DISPLAY_DIVERGENCE ? PALETTE_DIVERGING
            : undefined
    });
    ui_visualizer_s.slider({ label: "ref", tooltip: "$Reference$ {Value that maps to about 63% of the palette. Everything is compressed smoothly above it.} $$Values$$ {Small: sensitive, detail in weak regions\nLarge: only strong regions light up}", obj: display_obj, key: "ref", min: 0, max: display_max });
    ui_visualizer_s.slider({ label: "thresh", tooltip: "$Threshold$ {Palette position below which values are scaled by [k].} $$Values$$ {[0]: off\n[0.05 – 0.3]: lifts or hides weak values}", obj: display_obj, key: "thresh", min: 0, max: 1 });
    ui_visualizer_s.slider({ label: "k", tooltip: "$Low-end scale$ {Factor for values below the threshold.} $$Values$$ {[1]: no change\n[0 – 0.5]: compresses weak values toward the darkest color}", obj: display_obj, key: "k", min: 0, max: 1 });
    if (!force.is_active)
        ui_bounds.toggle_visibility();
    ui_views = new UI_VIEW_SELECT(Object.keys(DISPLAY2STR).map((_, i) => ({ id: i, name: DISPLAY2STR[i], key: String(i + 1) })), fluid.display_mode, id => {
        const prev = fluid.display_mode;
        if (id === prev)
            return;
        fluid.display_mode = id;
        ui_fluid_bg.refresh();
    });
    ui_container = $("hud");
    ui_update_bounds();
    document.getElementById("hud")?.classList.toggle("hidden");
}

"use strict";
/** event called by window.onload */
function main() {
    init_shaders();
    init_textures();
    init_ui();
    canvas_el.onmouseleave = c_mouseleave;
    canvas_el.onmousedown = c_mousedown;
    new ResizeObserver(update_viewport).observe(canvas_el);
    window.onmousemove = w_mousemove;
    window.onmouseup = w_mouseup;
    canvas_el.oncontextmenu = (e) => {
        e.preventDefault();
    };
    draw(0);
}
//
