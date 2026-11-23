/** default sim / dye resolution: target texel area N1*N2 (M1*M2) is res², shaped to the window. */
const SIM_RESOLUTION = 256,
      DYE_RESOLUTION = 512;
let window_ar = window.innerHeight / window.innerWidth;

/** grids the physics / dye defaults are tuned at. Settings measured in texels
 * (speeds, distances, the force field) are given at these grids and scaled by
 * res_scale, so changing the resolution keeps the same feel on screen. */
const SIM_REF_RESOLUTION = 256,
      DYE_REF_RESOLUTION = 512;
/** current resolution over the reference one, set by update_sim_dims.
 * sim: texel lengths and speeds (texels/s) scale by it, pressure by its square.
 * Rates (1/s), curl, divergence and per-step factors don't depend on it. */
const res_scale = { sim: SIM_RESOLUTION / SIM_REF_RESOLUTION, dye: DYE_RESOLUTION / DYE_REF_RESOLUTION };

const bg_arr = [0, 0, 0],
      bg = new Float32Array([0, 0, 0, 1]);

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

const DISPLAY2STR = {
    [DISPLAY_DYE]: "dye",
    [DISPLAY_VELOCITY]: "velocity",
    [DISPLAY_PRESSURE]: "pressure",
    [DISPLAY_CURL]: "curl",
    [DISPLAY_DIVERGENCE]: "divergence"
} as Record<fluid_display_t, string>;

function resolution(size:number, ar:number) {
    const A = size**2;
    const height = Math.ceil(Math.sqrt(A * ar));
    const width = Math.ceil(Math.sqrt(A / ar));
    return { dims:[width,height] as [number,number], texel:[1/width, 1/height] as [number,number]}
}

const fluid = {
    /** multigrid V-cycles per step, see multigrid.ts. */
    pressure_cycles: 2,
    /** Jacobi sweeps before and after each coarse correction. */
    pressure_smoothing: 2,
    /** sim texels over which the pressure pushes back on a stroke; >= 1000 is
     * unlimited (see MG_REACH_UNLIMITED). Small = punchy strokes that carry on. */
    pressure_reach: 8,
    velocity_dissipation: 0.999,
    dye_dissipation: 1.0,
    curl_strength: 15,
    jacobi_scale: 0.8,
    base_diffusion: 0,
    curl_diffusion: 0.05,
    velocity_diffusion: 0.005,
    max_diffusion: 1,
    diffusion_texel_radius: 2,
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
        /** 1: non-dye views normalize by the field's eased RMS instead of `ref`. */
        auto_exposure: 1,
        /** auto exposure brightness, the RMS maps to 1 - exp(-exposure). */
        exposure: 0.6,
        /** seconds for the auto exposure to settle after the field changes. */
        adapt_time: 0.5,
        /** 1: velocity arrows over the non-dye views. */
        arrows: 0,
        /** arrows per screen height (the cells are square). */
        arrow_rows: 20,
    },
    /** inspector resolutions (target texel area is res²), applied by apply_resolution. */
    sim_resolution: SIM_RESOLUTION,
    dye_resolution: DYE_RESOLUTION,
    sim_res: resolution(SIM_RESOLUTION, window_ar),
    dye_res: resolution(DYE_RESOLUTION, window_ar),
    open_borders: 0,
    /** 1: lower the sim and dye resolution while the target fps isn't met
     * (see pacing in draw.ts). The inspector resolutions are the ceiling. */
    dynamic_resolution: 0,
    drag: 0.05
};
color_logarithm(fluid.bg, bg);

/** shader uniforms TEXEL / DTEXEL / ASPECT, see shared_uniforms. */
const TEXEL = new Float32Array(fluid.sim_res.texel),
      DYE_TEXEL = new Float32Array(fluid.dye_res.texel);
let [N1,N2] = fluid.sim_res.dims,
    [M1,M2] = fluid.dye_res.dims,
    ASPECT_NUM = N1/N2;

/** default brush sizes are given in texels of this reference grid (the old
 * default sim resolution), so they keep their screen size whatever sim
 * resolution is chosen. */
const BRUSH_REF_RESOLUTION = 512;
const texel = (t:number) => {
          const [w, h] = resolution(BRUSH_REF_RESOLUTION, window_ar).dims;
          return t / Math.min(w, h);
      },
      texel_radius = (t:number) => texel(t) * 0.5;

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
    glsl: { ...FORCE_FIELD_DEFAULT },
    pure_vector_field: false,
    relaxation: 500.0
};

function rate_from_ms(wave_delay_ms:number, convergence_fraction = 0.95) {
    const t_seconds = wave_delay_ms * 0.001;
    return -Math.log(1 - convergence_fraction) / t_seconds;
}
