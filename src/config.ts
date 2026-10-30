const searchParams = new (class {
    url:URL;
    constructor() {
        this.url = new URL(window.location.href);
    }
    getNumber(p:string,fallback=0,lower=-Infinity,upper=Infinity) {
        const v = this.url.searchParams.get(p),
              nv = Number(v);
        // @ts-ignore
        return v === null || isNaN(v) ? fallback : Math.min(Math.max(nv, lower), upper);
    }
    getFloat32Color(p:string,out_arr:number[]) {
        const fallback = new Float32Array([0.0,0.0,0.0,1.0]);
        out_arr[0] = 0;
        out_arr[1] = 0;
        out_arr[2] = 0;

        const v = this.url.searchParams.get(p);
        if (v === null) return fallback;
        try {
            const av = JSON.parse(v),
                  o = new Float32Array(4);
            if (!Array.isArray(av))
                return fallback;

            const l = av.length;
            if (l < 3 || l > 4)
                return fallback;

            for (let i=0; i<3; ++i) {
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

            return Float32Array.from(av)
        }
        catch (e) {
            return fallback;
        }
    }
    getBoolean(p:string) {
        return this.url.searchParams.get(p) === "true";
    }
    getString(p:string,fallback="") {
        return this.url.searchParams.get(p) || fallback;
    }
});

const sim_resolution = Math.floor(searchParams.getNumber("sim_res", 512, 16)),
      dye_resolution = Math.floor(searchParams.getNumber("dye_res", 2048, sim_resolution)),
      window_ar = window.innerHeight / window.innerWidth;

const bg_arr = [] as number[],
      bg = searchParams.getFloat32Color("bg", bg_arr);

const DISPLAY_DYE = 0,
      DISPLAY_VELOCITY = 1,
      DISPLAY_CURL = 2,
      DISPLAY_PRESSURE = 3,
      DISPLAY_DIVERGENCE = 4,
      PALETTE_VIRIDIS = 0,
      PALETTE_HUE_BRIGHTNESS = 1,
      PALETTE_TURBO = 2,
      PALETTE_DIVERGING = 3,
      KIND_DYE = 0,
      KIND_VECTOR = 1,
      KIND_SCALAR = 2,
      BLUR_NONE = 0,
      BLUR_CROSS = 1,
      BLUR_3x3_BINOMIAL = 2;

type fluid_display_t = typeof DISPLAY_DYE | typeof DISPLAY_VELOCITY |
    typeof DISPLAY_CURL | typeof DISPLAY_PRESSURE | typeof DISPLAY_DIVERGENCE;
type fluid_display_palette_t = typeof PALETTE_VIRIDIS |
    typeof PALETTE_HUE_BRIGHTNESS | typeof PALETTE_TURBO |
    typeof PALETTE_DIVERGING;
type fluid_display_kind_t = typeof KIND_DYE | typeof KIND_VECTOR |
    typeof KIND_SCALAR;
type fluid_diplay_blur_t = typeof BLUR_NONE | typeof BLUR_CROSS |
    typeof BLUR_3x3_BINOMIAL;

const DISPLAY2STR = {} as Record<fluid_display_t, string>;
DISPLAY2STR[DISPLAY_DYE] = "dye";
DISPLAY2STR[DISPLAY_VELOCITY] = "velocity";
DISPLAY2STR[DISPLAY_PRESSURE] = "pressure";
DISPLAY2STR[DISPLAY_CURL] = "curl";
DISPLAY2STR[DISPLAY_DIVERGENCE] = "divergence";

function resolution(size:number, ar:number) {
    const A = size**2;
    const height = Math.ceil(Math.sqrt(A * ar));
    const width = Math.ceil(Math.sqrt(A / ar));
    return { dims:[width,height] as [number,number], texel:[(1/width).toFixed(6), (1/height).toFixed(6)]}
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
    display_mode: DISPLAY_DYE as fluid_display_t,
    display_palette: PALETTE_TURBO as fluid_display_palette_t,
    display: {
        velocity: {ref: 60, thresh: 0.5, k: 0.5},
        curl: {ref: 60, thresh: 0.5, k: 0.5},
        pressure: {ref: 100, thresh: 0.35, k: 0.3},
        divergence: {ref: 1.5, thresh: 0.2, k: 0.8},
    },
    sim_res: resolution(sim_resolution, window_ar),
    dye_res: resolution(dye_resolution, window_ar),
    open_borders: 0
};
color_logarithm(fluid.bg, bg);

const TEXEL = fluid.sim_res.texel.toString(),
      DYE_TEXEL = fluid.dye_res.texel.toString(),
      [N1,N2] = fluid.sim_res.dims,
      [M1,M2] = fluid.dye_res.dims,
      ASPECT_NUM = N1/N2,
      ASPECT = ASPECT_NUM.toFixed(6);

const texel = (t:number) => N1 < N2 ? t/N1 : t/N2,
      texel_radius = (t:number) => texel(t) * 0.5;


const __FORCE_FIELDS_COMMON =
`float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3. - 2. * f);
    return mix(mix(hash21(i),               hash21(i + vec2(1, 0)), f.x),
               mix(hash21(i + vec2(0, 1)),  hash21(i + vec2(1, 1)), f.x), f.y);
}`;

const DEFAULT_FORCE_FIELDS = [
`${__FORCE_FIELDS_COMMON}

vec2 get_velocity(vec2 p) {
    const float A = 0.1, eps = 0.25, w = 2. * 3.14159265 / 10.;
    float s = eps * sin(w * time);
    float a = s, b = 1. - 2. * s;
    float f  = a * p.x * p.x + b * p.x;
    float df = 2. * a * p.x + b;
    float PI = 3.14159265;
    return vec2(-PI * A * sin(PI * f) * cos(PI * p.y),
                 PI * A * cos(PI * f) * sin(PI * p.y) * df);
}`,
`vec2 vortex_row(vec2 p, float a, float gamma) {
    float k = 6.28318530718 / a;
    float d = cosh(k * p.y) - cos(k * p.x) + 0.02;   // softened denominator
    return gamma / (2. * a) * vec2(sinh(k * p.y), -sin(k * p.x)) / d;
}

vec2 get_velocity(vec2 p) {
    const float a = 1.0, h = 0.25, G = 1.0;
    p.x -= time * 0.1;                               // slow drift of the street
    vec2 v  = vortex_row(p - vec2(0., h),          a, -G);
    v      += vortex_row(p - vec2(0.5 * a, -h),    a,  G);
    return v;
}`,
`vec2 charge(vec2 p, vec2 c, float q) {
    vec2 d = p - c;
    return q * d / (dot(d, d) + 0.01);
}

vec2 get_velocity(vec2 p) {
    float t = time * 0.5;
    vec2 off = 0.6 * vec2(cos(t), sin(t));
    return charge(p,  off,  1.) + charge(p, -off, -1.);
}`,
`${__FORCE_FIELDS_COMMON}

float potential(vec2 p) {
    float s = 0., a = 0.5;
    for (int i = 0; i < 4; i++) {
        s += a * vnoise(p + time * 0.15 * float(i + 1));
        p = p * 2.03 + 17.1;
        a *= 0.5;
    }
    return s;
}

vec2 get_velocity(vec2 p) {
    const float e = 1e-2;
    float dpdx = potential(p + vec2(e, 0.)) - potential(p - vec2(e, 0.));
    float dpdy = potential(p + vec2(0., e)) - potential(p - vec2(0., e));
    return vec2(dpdy, -dpdx) / (2. * e) * 1.5;
}`,
`vec2 get_velocity(vec2 p) {
    vec2 v = vec2(0.);
    for (int i = 0; i < 3; i++) {
        float ang = time * 0.4 + float(i) * 2.0943951;     // 120° apart
        vec2 c = 0.7 * vec2(cos(ang), sin(ang));
        vec2 d = c - p;
        float r2 = dot(d, d) + 0.03;                         // softening
        vec2 dir = d * inversesqrt(r2);
        vec2 tang = vec2(-dir.y, dir.x);
        float g = 0.5 / r2;
        v += g * (dir + 0.8 * tang);                         // pull + swirl
    }
    return v;
}`,
`vec2 get_velocity(vec2 p) {
    p = p * 3. + 0.5 * vec2(sin(time * 0.3), cos(time * 0.4));
    return vec2( sin(p.x) * cos(p.y),
                -cos(p.x) * sin(p.y));
}`,
`vec2 get_velocity(vec2 p) {
    const float U = 1.0, R = 0.5;
    float a = time * 0.3;
    float c = cos(a), s = sin(a);

    vec2 q = vec2(c * p.x + s * p.y, -s * p.x + c * p.y);   // rotate into flow frame
    float r2 = dot(q, q);
    if (r2 < R * R) return vec2(0.);

    float r4 = r2 * r2;
    vec2 v = U * vec2(1. - R * R * (q.x * q.x - q.y * q.y) / r4,
                         -2. * R * R * q.x * q.y / r4);

    float G = 1.5 * sin(time * 0.7);                         // circulation
    v += G / (6.28318530718 * r2) * vec2(-q.y, q.x);

    return vec2(c * v.x - s * v.y, s * v.x + c * v.y);       // rotate back
}`,
`vec2 get_velocity(vec2 p) {
    p *= 3.;
    float drive = 0.5 * sin(time);
    return vec2(p.y,
                -sin(p.x) - 0.15 * p.y + drive);
}`,
`vec2 lamb_oseen(vec2 p, vec2 c, float gamma, float core2) {
    vec2 d = p - c;
    float r2 = dot(d, d) + 1e-6;
    return gamma * (1. - exp(-r2 / core2)) / (6.28318530718 * r2) * vec2(-d.y, d.x);
}

vec2 get_velocity(vec2 p) {
    const float G = 1.0, sep = 0.8;
    float omega = G / (3.14159265 * sep * sep);
    float a = time * omega;
    vec2 c = 0.5 * sep * vec2(cos(a), sin(a));
    return lamb_oseen(p,  c, G, 0.04)
         + lamb_oseen(p, -c, G, 0.04);
}`,
`vec2 get_velocity(vec2 p) {
    float r2 = dot(p, p) + 0.02;
    vec2 radial = -p / r2;                        // inward
    vec2 tang   = vec2(-p.y, p.x) / r2;           // swirl

    float sink  = 0.6 + 0.4 * sin(time * 0.8);
    float swirl = 0.9 * cos(time * 0.5);
    return sink * radial + swirl * tang;
}`];
const FORCE_FIELD_DEFAULT = DEFAULT_FORCE_FIELDS[Math.floor(Math.random() * DEFAULT_FORCE_FIELDS.length)];

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

function rate_from_ms(wave_delay_ms:number, convergence_fraction = 0.95) {
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