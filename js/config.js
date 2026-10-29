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
