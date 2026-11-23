let ui_toolbar: UI_TOOLBAR<mouse_mode_t>,
    ui_status: UI_STATUS,
    ui_views: UI_VIEW_SELECT<fluid_display_t>,
    ui_inspector: UI_INSPECTOR,
    ui_palette_s: UI_SECTION,
    ui_bounds: UI_BOUNDS,
    //ui_brush_s: UI_SECTION,
    ui_dye_brush_s: UI_SECTION,
    ui_force_brush_s: UI_SECTION,
    ui_diffusion_s: UI_SECTION,
    ui_wall_s: UI_SECTION,
    ui_field_s: UI_SECTION,
    ui_fluid_s: UI_SECTION,
    ui_field_strength: UI_FIELD_SLIDER,
    ui_field_center: UI_FIELD_VECTOR,
    ui_field_span: UI_FIELD_SLIDER,
    ui_visualizer_s: UI_SECTION,

    ui_container: HTMLDivElement,

    ui_force_btn: { set: (on: boolean, notify?: boolean) => void; toggle: () => void; readonly on: boolean; },
    ui_borders_btn: { set: (on: boolean, notify?: boolean) => void; toggle: () => void; readonly on: boolean; },
    ui_fluid_bg: UI_FIELD_COLOR,

    ui_field_glsl: UI_FIELD_GLSL;

/** tool glyphs: the droplet is always the dye color, the wind the force color
 * (--dye-c / --force-c in styles.css, also used by the brush rings). */
const DYE_GLYPH = '<path d="M12 3c3 4 5 6.5 5 9.5a5 5 0 0 1-10 0C7 9.5 9 7 12 3z" vector-effect="non-scaling-stroke"/>',
      // a push: arrow with two speed lines
      FORCE_GLYPH = '<path d="M3 12h14" vector-effect="non-scaling-stroke"/><path d="M13 7l5 5-5 5" vector-effect="non-scaling-stroke"/><path d="M3 7.5h5M3 16.5h5" vector-effect="non-scaling-stroke"/>';
const TOOL_ICONS = [
    // dye + force: both glyphs side by side, scaled down (non-scaling strokes keep the line width)
    `<g class="ic-dye" transform="translate(-2.3 5.2) scale(.66)">${DYE_GLYPH}</g>` +
    `<g class="ic-force" transform="translate(11 4.8) scale(.6)">${FORCE_GLYPH}</g>`,
    `<g class="ic-dye">${DYE_GLYPH}</g>`,
    `<g class="ic-force">${FORCE_GLYPH}</g>`,
    '<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M4 12h16M10 5v7M15 12v7"/>',
];

const FORCE_ICON =
    '<path d="M13 5.5c-1.8-1-3.4 0-3.7 2L8 19c-.3 1.6-1.4 2.300-2.800 1.600"/>' +
    '<path d="M5.500 11.500h7"/>' +
    '<path d="M15.500 13.500l4.500 5.500m0-5.500l-4.500 5.500" stroke-width="1.400"/>';

/** a vector field arrow. */
const ARROWS_ICON = '<path d="M6 18L18 6M18 6h-7.5M18 6v7.5"/>';

const BORDERS_ICON =
    '<path d="M4 4h5M15 4h5"/>' + '<path d="M4 20h5M15 20h5"/>' +
    '<path d="M4 4v5M4 15v5"/>' + '<path d="M20 4v5M20 15v5"/>';

/** splat weight the brush ring is drawn at. */
const RING_WEIGHT = 0.1;
/** the three brush radius fields (texels), see ui_sync_brushes. */
let ui_brush_fields: UI_FIELD<number>[] = [],
    /** set once saved values are restored; before that nothing is saved back. */
    ui_ready = false;

/** after the sim grid changed: brushes keep their screen size, so their texel
 * counts change. Saved, so a reload restores the same size on this grid. */
function ui_sync_brushes() {
    brushes_read();
    if (!ui_ready) return;   // startup restore: the stored values come next
    for (const f of ui_brush_fields) { f.save_now(); f.refresh(); }
}

let wall_ring: HTMLElement, wall_line: HTMLElement, force_ring: HTMLElement,
    wall_ring_halo: HTMLElement, force_ring_halo: HTMLElement,
    /** erase highlight currently shown on the wall tool / ring. */
    _shown_erasing = false;
/** shows the wall tool's effective mode (sticky erase, inverted by shift) on
 * its button, the brush ring and the status bar. Returns whether it erases. */
function ui_sync_tool(force = false) {
    const erasing = mouse.mode === MOUSE_MODE_WALL && wall_erasing();
    if (force || erasing !== _shown_erasing) {
        _shown_erasing = erasing;
        ui_toolbar?.mark(MOUSE_MODE_WALL, "erase", erasing);   // unset while the toolbar constructor picks
        wall_ring.classList.toggle("erase", erasing);
        wall_ring.classList.toggle("dye", mouse.mode !== MOUSE_MODE_WALL);
        wall_ring.classList.toggle("wall", mouse.mode === MOUSE_MODE_WALL);
        ui_status.tool(erasing ? "Wall (erase)" : MODE2STR[mouse.mode]);
    }
    return erasing;
}

/** a dark copy drawn under a ring, so it reads on any background. */
function ring_halo(ring: HTMLElement) {
    const h = ring.cloneNode() as HTMLElement;
    h.removeAttribute("id");
    h.classList.add("halo");
    ring.before(h);
    return h;
}

/** shows / places a ring and its halo. */
function set_ring(ring: HTMLElement, halo: HTMLElement, on: boolean, x = 0, y = 0, r = 0) {
    ring.style.display = halo.style.display = on ? "" : "none";
    if (!on) return;
    for (const el of [halo, ring]) {
        el.setAttribute("cx", String(x));
        el.setAttribute("cy", String(y));
        el.setAttribute("r", String(r));
    }
}

/** solid ring: dye or wall brush. dashed ring: force brush. */
function ui_update_mouse_overlay() {
    const wall = mouse.mode === MOUSE_MODE_WALL;
    const erasing = ui_sync_tool();
    const on = mouse.over_canvas && !mouse.m2_down;
    const line_on = on && wall && mouse.m1_down && keyboard.ctrl_down;
    const solid_on = on && mouse.mode !== MOUSE_MODE_FORCE;
    const force_on = on && (mouse.mode & MOUSE_MODE_FORCE) !== 0;
    wall_line.style.display = line_on ? "" : "none";
    if (!on) {
        set_ring(wall_ring, wall_ring_halo, false);
        set_ring(force_ring, force_ring_halo, false);
        return;
    }

    const h = canvas_rect.height;
    const px = (u: Float32Array) => [canvas_rect.left + u[0] * canvas_rect.width,
                                     canvas_rect.bottom - u[1] * h];
    const [x, y] = px(mouse.uv_pos);

    // radii in screen-height units. Splats are exp(-d²/r) * strength, the rings
    // sit where one splat's weight drops to RING_WEIGHT.
    const r = Math.max(0.5, h * (wall
        ? obstacle_splat.radius + (erasing ? 0.045 : 0)
        : gaussian_extent(splat.dye_radius, splat.dye_strength, RING_WEIGHT)));

    set_ring(wall_ring, wall_ring_halo, solid_on, x, y, r);
    set_ring(force_ring, force_ring_halo, force_on, x, y,
        Math.max(0.5, gaussian_extent(splat.velocity_radius, splat.velocity_strength, RING_WEIGHT) * h));

    if (line_on) {
        const [ax, ay] = px(mouse.wall_anchor);
        wall_line.setAttribute("x1", String(ax)); wall_line.setAttribute("y1", String(ay));
        wall_line.setAttribute("x2", String(x));  wall_line.setAttribute("y2", String(y));
        wall_line.setAttribute("stroke-width", String(2 * r));
    }
}

function ui_update_bounds() {
    const h = force.span * 0.25;
    ui_bounds.update(force.center[0], force.center[1], h * ASPECT_NUM, h);
}

function ui_set_force_active(on: boolean) {
    if (on === force.is_active) return;
    force.is_active = on;
    ui_field_s.toggle_visibility();
    ui_bounds.toggle_visibility();
}

function init_ui() {
    wall_ring = $("wall-ring");
    wall_line = $("wall-line");
    force_ring = $("force-ring");
    wall_ring_halo = ring_halo(wall_ring);
    force_ring_halo = ring_halo(force_ring);
    
    ui_bounds    = new UI_BOUNDS();
    ui_status    = new UI_STATUS();
    ui_inspector = new UI_INSPECTOR();

    brushes_capture_defaults();
    brushes_read();   // brush defaults in texels of the grid just built
    // defaults quoted in tooltips, read before restore_all() applies saved values
    const DEF = {
        target_fps: renderer.target_fps,
        smoothing: fluid.pressure_smoothing,
        exposure: fluid.display.exposure,
        arrow_rows: fluid.display.arrow_rows,
        force_strength: splat.velocity_strength,
        relaxation: force.relaxation,
        jacobi_scale: fluid.jacobi_scale,
        max_velocity: fluid.max_velocity,
        drag: fluid.drag,
        base_diffusion: fluid.base_diffusion,
        curl_diffusion: fluid.curl_diffusion,
        velocity_diffusion: fluid.velocity_diffusion,
        max_diffusion: fluid.max_diffusion,
        diffusion_radius: fluid.diffusion_texel_radius,
    };

    // the refresh rate is measured over the first frames, after the saved
    // settings are restored: let a saved target above it through (it is still
    // capped when used, see pacing.target_fps) instead of clamping it away
    const saved_target_fps = () => { const v = store.get("precision.target fps"); return typeof v === "number" ? v : 0; };
    const sim = ui_inspector.section("precision");
    // rows were renamed: carry saved values over to the new keys
    for (const [from, to] of [["precision.sim resolution", "precision.simulation"], ["precision.dye resolution", "precision.dye"]]) {
        const v = store.get(from);
        if (v !== undefined && store.get(to) === undefined) store.set(to, v);
        if (v !== undefined) store.del(from);
    }
    sim.subtitle("resolution");
    sim.float({label:"simulation", tooltip:`$Simulation resolution$ {Velocity / pressure grid size. The grid has about res² cells, shaped to the window. Applied on enter, rebuilding the textures (the flow is carried over).} {While [dynamic res.] is on, this row is locked and shows the resolution in use.} {Settings given in texels are tuned at ${SIM_REF_RESOLUTION} and scaled with this, so the flow keeps the same feel: only the detail and the cost change.} $$Values$$ {[64 – 192]: fast, coarse eddies\n[${SIM_RESOLUTION}]: default, balanced\n[512 – 1024]: fine detail\n[> 1536]: very fine, heavy}`, obj:fluid, key:"sim_resolution", min:32, max:2048, int:true, scrub:false, keep_on_reset:true, onChange:apply_resolution, frozen:() => fluid.dynamic_resolution ? eff_sim_resolution() : undefined});
    sim.float({label:"dye", tooltip:`$Dye resolution$ {Dye texture size, about res² texels shaped to the window. Applied on enter, rebuilding the textures (the dye is carried over).} {The diffusion radius is tuned at ${DYE_REF_RESOLUTION} and scaled with this.} $$Values$$ {[128 – 384]: fast, softer\n[${DYE_RESOLUTION}]: default, sharp\n[1024 – 2048]: very sharp\n[4096]: heavy}`, obj:fluid, key:"dye_resolution", min:64, max:4096, int:true, scrub:false, keep_on_reset:true, onChange:apply_resolution});
    sim.slider({label:"target fps", tooltip:() => `$Target fps$ {Simulation steps per second. Each step simulates 1/target s, so the flow moves at the same speed whatever the value: higher is smoother and more accurate, but costs more GPU time per second. Capped at the screen's refresh rate (${pacing.refresh} Hz detected).} $$Values$$ {[30]: half the work, choppier\n[${DEF.target_fps}]: default\n[${pacing.refresh}]: one step per screen refresh}`, obj:renderer, key:"target_fps", min:10, max:() => Math.max(pacing.refresh, saved_target_fps()), int:true, unit:{symbol:"fps", name:"steps per second"}, persist:true});
    sim.toggle({label:"dynamic res.", tooltip:"$Dynamic resolution$ {Lowers the sim and dye resolution (to as little as 40%) while the device can't hold the target fps, and raises them again when it can. The resolutions above are the ceiling. While it is on, the [simulation] row shows the resolution in use.} {Each change rebuilds the textures, a short hitch.}", obj:fluid, key:"dynamic_resolution", int:true, onChange:() => pacing.toggled(), persist:true});
    sim.subtitle("time");
    sim.float({label:"elapsed time", tooltip:"$Elapsed time$ {Elapsed time in seconds.}", obj:renderer, key:"time", min:0.0, step:0.15, unit:{symbol:"s", name:"seconds"}, persist:false, track:false});
    sim.slider({label:"time scale", tooltip:"$Time scale$ {Multiplies the simulated time that passes per frame.} $$Values$$ {[0]: paused\n[0.1 – 0.9]: slow motion\n[1]: real time\n[1 – 2]: fast forward, less stable}", obj:renderer, key:"time_scale", min:0.0, max:2.0});
    sim.subtitle("pressure solve");
    sim.slider({label:"v-cycles", tooltip:`$Pressure solve$ {Multigrid V-cycles per step. Each cycle fixes pressure at every scale at once, so few are needed. One costs about 8 Jacobi passes (at the default smoothing).} $$Values$$ {[0]: no projection, the fluid compresses\n[1]: fast, slightly soft\n[2 – 3]: good quality\n[> 4]: little visible gain}`, obj:fluid, key:"pressure_cycles", min:0, max:8, int:true});
    sim.slider({label:"smoothing", tooltip:`$Smoothing sweeps$ {Jacobi sweeps on every level before and after each coarse correction. More sweeps make each cycle stronger but slower.} $$Values$$ {[1]: cheapest\n[${DEF.smoothing}]: default\n[3 – 6]: helps around thin walls}`, obj:fluid, key:"pressure_smoothing", min:1, max:6, int:true});
    sim.slider({label:"reach", tooltip:`$Pressure reach$ {How far the fluid pushes back on a stroke, in texels of the ${SIM_REF_RESOLUTION} reference grid (scaled with the sim resolution, so it covers the same part of the screen). Beyond it the pressure fades out, so a stroke keeps its momentum instead of the whole fluid reacting at once.} $$Values$$ {[16 – 48]: punchy, jets run straight like the old solver\n[64 – 256]: balanced\n[${MG_REACH_UNLIMITED}]: unlimited: fully incompressible, strokes curl back sooner}`, obj:fluid, key:"pressure_reach", min:4, max:MG_REACH_UNLIMITED, log:true, int:true, unit:{symbol:"tx", name:`texel at the ${SIM_REF_RESOLUTION} reference grid`}, persist:true});

    // colors added with "+" are stored too, the saved index alone would point
    // past the end of the default palette after a reload
    const CUSTOM_COLORS = "palette.custom";
    const custom_colors = (): string[] => {
        const v = store.get(CUSTOM_COLORS);
        return Array.isArray(v) ? v.filter(h => typeof h === "string" && /^#[0-9a-f]{6}$/i.test(h)) : [];
    };
    const hex_rgb = (h:string) => { const n = parseInt(h.slice(1), 16); return new Uint8Array([(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]); };
    const rgb_hex = (c:ArrayLike<number>) => "#" + [c[0], c[1], c[2]].map(v => v.toString(16).padStart(2, "0")).join("");
    for (const h of custom_colors())
        stroke.choosen_palette.push(get_color_data(hex_rgb(h)));

    ui_palette_s = ui_inspector.section("palette", () => mouse.mode & MOUSE_MODE_DYE);
    ui_palette_s.palette({
        label: "color", obj: stroke, key: "palette_color",
        colors: () => palette_color_data,
        onAdd: c => {
            stroke.choosen_palette.push(c);
            store.set(CUSTOM_COLORS, [...custom_colors(), rgb_hex(c.color)]);
        },
        // the built-in colors come first, the stored ones follow
        removable: i => i >= palette.length,
        onRemove: i => {
            stroke.choosen_palette.splice(i, 1);
            store.set(CUSTOM_COLORS, custom_colors().filter((_, k) => k !== i - palette.length));
        },
    });

    ui_dye_brush_s = ui_inspector.section("dye brush", () => mouse.mode & MOUSE_MODE_DYE);
    ui_brush_fields = [];
    ui_brush_fields.push(ui_dye_brush_s.slider({label:"radius", tooltip:() => `$Dye radius$ {Size of the dye brush, in sim texels. Keeps its screen size when the sim resolution changes (the texel count follows).} $$Values$$ {[1 – 8]: thin lines\n[${brush_default.dye_radius()}]: default\n[> 60]: big soft blobs}`, obj:brushes, key:"dye_radius", def:brush_default.dye_radius, unit:{symbol:"tx", name:"texel"}, min:0.5, max:200, step:0.1, log:true, persist:true, onChange:brushes_apply}));
    ui_dye_brush_s.slider({label:"strength", tooltip:"$Dye strength$ {How strongly the brush replaces the existing dye per frame. It blends, it never adds, so slow strokes can't saturate.} $$Values$$ {[0 – 0.2]: faint, builds up slowly\n[0.3 – 0.6]: normal\n[0.8 – 1]: opaque, overrides what is there}", obj:splat, key:"dye_strength", min:0, max:1, persist:true});

    ui_force_brush_s = ui_inspector.section("force brush", () => mouse.mode & MOUSE_MODE_FORCE);
    ui_brush_fields.push(ui_force_brush_s.slider({label:"radius", tooltip:() => `$Force radius$ {Size of the push applied by the brush, in sim texels. Wider pushes survive the pressure projection and carry flow farther.} $$Values$$ {[1 – 10]: sharp, dies quickly\n[${brush_default.force_radius()}]: default\n[> 80]: broad, slow currents}`, obj:brushes, key:"force_radius", def:brush_default.force_radius, unit:{symbol:"tx", name:"texel"}, min:0.5, max:200, step:0.1, log:true, persist:true, onChange:brushes_apply}));
    ui_force_brush_s.slider({label:"strength", tooltip:`$Force strength$ {Scales the push at the center of the brush. The push is added to the existing flow (it doesn't replace it), fading out with the Gaussian.} $$Values$$ {[0 – 0.3]: gentle\n[${DEF.force_strength}]: default\n[0.8 – 1]: full push}`, obj:splat, key:"velocity_strength", min:0, max:1, persist:true});
    ui_force_brush_s.slider({label:"speed sensitivity", tooltip:"$Speed sensitivity$ {Converts mouse speed into fluid speed.} $$Values$$ {[0]: the brush injects no motion\n[0.2 – 0.5]: normal\n[> 1]: small movements make violent jets}", obj:splat, key:"force_scale", min:0, max:2, persist:true});

    ui_wall_s = ui_inspector.section("wall brush", () => mouse.mode === MOUSE_MODE_WALL);
    ui_brush_fields.push(ui_wall_s.slider({label:"radius", tooltip:() => `$Wall radius$ {Half thickness of the wall stroke, in sim texels. Total thickness is twice this value. The eraser reaches a bit further (+0.045 screen heights) so it clears walls cleanly.} $$Values$$ {[< 3]: leaks\n[${brush_default.wall_radius()}]: default\n[> 30]: big blocks}`, obj:brushes, key:"wall_radius", def:brush_default.wall_radius, unit:{symbol:"tx", name:"texel"}, min:1, max:150, step:0.1, log:true, persist:true, onChange:brushes_apply}));
    ui_brush_fields.push(ui_wall_s.slider({label:"edge thickness", tooltip:() => `$Edge thickness$ {Thickness of the wall's rim, in sim texels. Above about 1 texel the edge stays smooth and anti-aliased, it just gets thicker. Keeps its screen size when the sim resolution changes.} $$Values$$ {[< 1]: jagged, aliased edges\n[${brush_default.wall_outline()}]: default\n[> 6]: thick rim}`, obj:brushes, key:"wall_outline", def:brush_default.wall_outline, unit:{symbol:"tx", name:"texel"}, min:0.25, max:20, step:0.1, log:true, onChange:brushes_apply, persist:true}));

    ui_field_s = ui_inspector.section("force field", () => force.is_active);
    ui_field_glsl = ui_field_s.glsl({
        label:"field", obj:force.glsl, key:"src",
        tooltip:"$Field source$ {Edit [get_velocity(vec2 p)] in GLSL. [p] is the world position, the return value is the velocity at that point before the strength is applied.} {Compile with [Ctrl+S]. Errors show on the line.}",
        title: () => force.glsl.label,
        set_title: (t:string) => force.glsl.label = t,
        library: { defaults: () => DEFAULT_FORCE_FIELDS, storage_key: "saved_force_fields" },
        button:"get_velocity(vec2 p)",
        required_fn:"get_velocity", line_offset:49,
        compile:(s:string, restoring?: boolean) => {
            if (!restoring && !force.is_active) {
                force.is_active = true;
                ui_force_btn.set(true, false);
            }

            return recompile_forcefield(s);
        }
    });
    ui_field_center = ui_field_s.vec2({label:"center", tooltip:"$Center$ {World coordinates that sit at the middle of the screen. Right-drag pans it.} $$Values$$ {Any value. The corner labels show the result.}", obj:force, key:"center", step:0.01, onChange:ui_update_bounds, persist:true});
    ui_field_strength = ui_field_s.slider({label:"strength", tooltip:`$Force strength$ {Scales the velocity returned by [get_velocity], in texels/s of the ${SIM_REF_RESOLUTION} reference grid (scaled with the sim resolution).} {Higher values push the fluid harder and hit the speed cap sooner.} $$Values$$ {[1 – 100]: gentle drift\n[100 – 1000]: strong flow\n[> 1000]: saturates [max velocity]}`, obj:force, key:"strength", min:1, max:10000, persist:true});
    ui_field_span = ui_field_s.slider({label:"window", tooltip:"$Window$ {World width that the screen shows. Mouse wheel zooms it.} $$Values$$ {[0.5 – 5]: zoomed in on the details\n[10 – 40]: a few periods of the field\n[> 100]: whole field in view}", obj:force, key:"span", min:0.5, max:200, log:true, onChange:ui_update_bounds, persist:true});
    ui_field_s.separator();
    ui_field_s.subtitle("vector field")
    ui_field_s.toggle({label:"pure field", tooltip:"$Pure field$ {Pulls the velocity back toward the field after the pressure solve, so the picture follows the vector field and the fluid only adds perturbations.} {Off: the field is a plain force and the solver reshapes it.}", obj:force, key:"pure_vector_field", int:true, persist:true});
    ui_field_s.slider({label:"relaxation", tooltip:`$Relaxation$ {With [pure field] on: how quickly the velocity returns to the field, in 1/s.} $$Values$$ {[0 – 1]: loose, the fluid dominates\n[2 – 5]: field plus eddies\n[> 15]: practically the raw field\n[${DEF.relaxation}]: default}`, obj:force, key:"relaxation", min:0.0, max:500.0, visible:() => force.pure_vector_field, persist:true})

    ui_fluid_s = ui_inspector.section("simulation");
    ui_fluid_bg = ui_fluid_s.color(({
        label: "background", tooltip:"$Background$ {Color of the empty fluid. Changing it clears the dye. Locked while a non-dye view is shown.} $$Values$$ {Each channel [0 – 1].}", obj: fluid, key: "bg_arr", onPick: () => {
            color_logarithm(fluid.bg, fluid.bg_arr);
            renderer.request_color_clear(false, false);
        },
        frozen: () => fluid.display_mode === DISPLAY_DYE ? undefined : fluid.bg_arr,
        persist:true
    }));
    ui_fluid_s.slider({label:"jacobi scale", tooltip:`$Pressure carry-over$ {Fraction of last frame's pressure used as the solver's starting guess. High values converge faster over time.} $$Values$$ {[0 – 0.5]: restarts, needs more v-cycles\n[${DEF.jacobi_scale}]: default\n[1]: never forgets: steadier pressure view, but can add noise to the velocity near closed borders}`, obj:fluid, key:"jacobi_scale", min:0, max:1, persist:true});
    ui_fluid_s.slider({label:"curl strength", tooltip:"$Vorticity confinement$ {Re-injects the swirl lost to numerical blur, so eddies live longer.} $$Values$$ {[0]: smooth, dies quickly\n[5 – 20]: lively\n[> 35]: noisy, can go unstable}", obj:fluid, key:"curl_strength", min:0, max:60, persist:true});
    ui_fluid_s.slider({label:"velocity decay", tooltip:"$Velocity decay$ {Multiplier applied to the velocity every step. Below 1 acts like friction.} $$Values$$ {[1]: motion never fades\n[0.999 – 0.9999]: slow fade\n[< 0.99]: thick, syrup-like}", obj:fluid, key:"velocity_dissipation", min:0.9, max:1, step:0.0001, persist:true});
    ui_fluid_s.slider({label:"max velocity", tooltip:`$Max velocity$ {Speed cap in texels/s of the ${SIM_REF_RESOLUTION} reference grid (scaled with the sim resolution, so it is the same speed on screen). It keeps the solver stable.} $$Values$$ {[50 – 300]: calm\n[400 – 1500]: lively\n[${DEF.max_velocity}]: default\n[> 3000]: only with a small dt}`, obj:fluid, key:"max_velocity", min:0, max:10000, persist:true});
    ui_fluid_s.slider({label:"drag", tooltip:`$Drag$ {Quadratic drag: slows fast flow much more than slow flow. The velocity loses drag·(speed / max velocity)² per second, so it only bites near the speed cap.} $$Values$$ {[0]: off\n[${DEF.drag}]: default, barely noticeable\n[1 – 10]: fast jets tame quickly\n[> 100]: hard ceiling well below [max velocity]}`, obj:fluid, key:"drag", min:0, max:1500, persist:true});
    ui_fluid_s.slider({label:"arrow resolution", tooltip:`$Arrow resolution$ {Number of arrows per screen height (toggle the arrows from the toolbar). The grid cells are square, so the columns follow the window shape.} $$Values$$ {[10 – 15]: coarse, big arrows\n[${DEF.arrow_rows}]: default\n[25 – 30]: dense, small arrows}`, obj:fluid.display, key:"arrow_rows", min:10, max:30, int:true, visible:() => fluid.display.arrows === 1, persist:true});

    ui_diffusion_s = ui_inspector.section("diffusion");
    ui_diffusion_s.slider({label:"base diff.", tooltip:`$Base diffusion$ {Rate at which dye blends with its surroundings everywhere, in 1/s.} $$Values$$ {[${DEF.base_diffusion}]: default, crisp, only advection mixes\n[0.5 – 2]: soft\n[> 5]: washes out fast}`, obj:fluid, key:"base_diffusion", min:0, max:10, persist:true});
    ui_diffusion_s.slider({label:"curl diff.", tooltip:`$Curl diffusion$ {Extra blending where the flow swirls, like eddy mixing: rate per unit of curl.} $$Values$$ {[0]: off\n[${DEF.curl_diffusion}]: default, swirls soften slowly\n[0.1 – 0.5]: swirls blend\n[> 1]: vortex cores dissolve}`, obj:fluid, key:"curl_diffusion", min:0, max:2, persist:true});
    ui_diffusion_s.slider({label:"vel. diff.", tooltip:`$Speed diffusion$ {Extra blending proportional to the local speed (rate per texel/s of the ${SIM_REF_RESOLUTION} reference grid). Fast regions easily reach [max diff.], so this mostly decides where the cap applies.} $$Values$$ {[0]: off\n[${DEF.velocity_diffusion}]: default, barely noticeable\n[0.01 – 0.05]: moving dye smears gently\n[> 0.1]: fast dye blends quickly}`, obj:fluid, key:"velocity_diffusion",min:0, max:0.5, persist:true});
    ui_diffusion_s.slider({label:"max diff.", tooltip:`$Max diffusion$ {Upper limit of the total blending rate, in 1/s.} $$Values$$ {[0]: off, no diffusion at all\n[${DEF.max_diffusion}]: default, slow\n[2 – 10]: noticeable within seconds\n[> 15]: can wash out the dye in under a second}`, obj:fluid, key:"max_diffusion", min:0, max:30, persist:true});
    ui_diffusion_s.slider({label:"diff. radius", tooltip:`$Diffusion radius$ {Radius of the blending ring, in texels of the ${DYE_REF_RESOLUTION} reference dye grid (scaled with the dye resolution, so it covers the same part of the screen): each step mixes a texel with 8 samples on this ring. Larger rings spread color farther per step.} $$Values$$ {[${DEF.diffusion_radius}]: default\n[1 – 4]: fine, local blending\n[10 – 30]: wide\n[> 40]: very wide soft spread; the 8 taps can show as a faint star}`, obj:fluid, key:"diffusion_texel_radius", min:1, max:51, persist:true});

    const SECTION_OF_TOOL: Record<number, string> = {
        [MOUSE_MODE_DYE_FORCE]:"Dye brush",
        [MOUSE_MODE_DYE]:"Dye brush",
        [MOUSE_MODE_FORCE]:"Force brush",
        [MOUSE_MODE_WALL]:"Wall brush"
    };
    ui_toolbar = new UI_TOOLBAR<mouse_mode_t>([
        { id:MOUSE_MODE_DYE_FORCE, tip:"Dye + Force", icon:TOOL_ICONS[0], key:"q" },
        { id:MOUSE_MODE_DYE, tip:"Dye", icon:TOOL_ICONS[1], key:"w" },
        { id:MOUSE_MODE_FORCE, tip:"Force", icon:TOOL_ICONS[2], key:"e" },
        { id:MOUSE_MODE_WALL, tip:"Wall · pick again: erase · Shift: invert · Ctrl: straight line", icon:TOOL_ICONS[3], key:"r", separator:true },
    ], mouse.mode, id => {
        if (id !== MOUSE_MODE_WALL) obstacle_splat.erase_mode = false;   // leaving the wall tool ends erasing
        ui_inspector.focus(SECTION_OF_TOOL[id]);
        if (mouse.mode === id) { ui_sync_tool(true); return; }
        const prev = mouse.mode;
        mouse.mode = id;
        ui_sync_tool(true);
        ui_fluid_bg.refresh();
        ui_visualizer_s.refresh();
    }, id => {
        if (id === MOUSE_MODE_WALL) obstacle_splat.erase_mode = !obstacle_splat.erase_mode;
    });

    ui_force_btn = ui_toolbar.add_toggle({
        tip: "Force field [F] · hold: edit the field [T]",
        icon: FORCE_ICON, 
        initial: force.is_active, 
        onToggle: ui_set_force_active,
        onHold: () => ui_field_glsl.open(),   // touch / pen long-press
    });
    
    // these two toolbar toggles are saved like the inspector values
    const OPEN_BORDERS_KEY = "toolbar.open borders", ARROWS_KEY = "toolbar.arrows";
    const saved_flag = (k:string) => { const v = store.get(k); return v === 0 || v === 1 ? v : undefined; };
    fluid.open_borders = saved_flag(OPEN_BORDERS_KEY) ?? fluid.open_borders;
    fluid.display.arrows = saved_flag(ARROWS_KEY) ?? fluid.display.arrows;

    ui_borders_btn = ui_toolbar.add_toggle({
        tip: "Open borders toogle [TAB]",
        icon: BORDERS_ICON,
        initial: fluid.open_borders === 0,
        onToggle: (v:boolean) => {
            if (v === !fluid.open_borders) return;
            fluid.open_borders = v ? 0 : 1;
            store.set(OPEN_BORDERS_KEY, fluid.open_borders);
        }
    });
    ui_toolbar.add_toggle({
        tip: "Arrows: pressure push in the pressure view, flow elsewhere",
        icon: ARROWS_ICON,
        initial: fluid.display.arrows === 1,
        onToggle: (v:boolean) => {
            fluid.display.arrows = v ? 1 : 0;
            store.set(ARROWS_KEY, fluid.display.arrows);
            ui_fluid_s.refresh();
        },
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
        else return fluid.max_force * 2;
    }
    const PALETTE_OPTIONS: EnumOption[] = [
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
        options: () => fluid.display_mode === DISPLAY_DIVERGENCE ? [PALETTE_OPTIONS[3]] : [PALETTE_OPTIONS[0],PALETTE_OPTIONS[1],PALETTE_OPTIONS[2]],
        // divergence view forces the diverging palette, dye ignores palettes entirely
        frozen: () => fluid.display_mode === DISPLAY_DIVERGENCE ? PALETTE_DIVERGING
             : undefined
    });
    const auto_on = () => fluid.display.auto_exposure === 1;
    ui_visualizer_s.toggle({label:"auto exposure", tooltip:"$Auto exposure$ {Scales the view by the field's own strength (its RMS over the fluid), eased over time, so it stays readable as the flow speeds up or calms down.} {Off: the fixed [ref] value is used.}", obj:fluid.display, key:"auto_exposure", int:true, persist:true});
    ui_visualizer_s.slider({label:"exposure", tooltip:`$Exposure$ {Brightness under auto exposure. The field's RMS lands at 1 - e^-exposure of the palette.} $$Values$$ {[0.3]: dark, only peaks light up\n[${DEF.exposure}]: default\n[> 1.5]: bright, peaks saturate}`, obj:fluid.display, key:"exposure", min:0.05, max:3, visible:auto_on, persist:true});
    ui_visualizer_s.slider({label:"adapt time", tooltip:"$Adaptation time$ {How quickly auto exposure follows changes in the field.} $$Values$$ {[0]: instant, can flicker\n[0.3 – 1]: smooth\n[> 2]: slow, lags behind bursts}", obj:fluid.display, key:"adapt_time", min:0, max:5, unit:{symbol:"s", name:"seconds"}, visible:auto_on, persist:true});
    ui_visualizer_s.slider({label:"ref", tooltip:`$Reference$ {Value that maps to about 63% of the palette. Everything is compressed smoothly above it. Velocity and pressure are measured at the ${SIM_REF_RESOLUTION} reference grid, so the same ref fits any sim resolution.} $$Values$$ {Small: sensitive, detail in weak regions\nLarge: only strong regions light up}`, obj:display_obj, key:"ref", min:0, max:display_max, visible:() => !auto_on()});
    ui_visualizer_s.slider({label:"thresh", tooltip:"$Threshold$ {Palette position below which values are scaled by [k]. Values above it are stretched to meet them, so there's no jump at the threshold.} $$Values$$ {[0]: off\n[0.05 – 0.3]: lifts or hides weak values}", obj:display_obj, key:"thresh", min:0, max:1});
    ui_visualizer_s.slider({label:"k", tooltip:"$Low-end scale$ {Factor for values below the threshold.} $$Values$$ {[1]: no change\n[0 – 0.5]: compresses weak values toward the darkest color}", obj:display_obj, key:"k", min:0, max:1});
    
    if (!force.is_active)
        ui_bounds.toggle_visibility();

    ui_views = new UI_VIEW_SELECT<fluid_display_t>(
        Object.keys(DISPLAY2STR).map((_, i) =>
            ({id: i as fluid_display_t, name: DISPLAY2STR[i as fluid_display_t], key: String(i + 1) })),
        fluid.display_mode,
        id => {
            const prev = fluid.display_mode;
            if (id === prev) return;
            fluid.display_mode = id;
            ui_fluid_bg.refresh();
        }
    );

    ui_inspector.restore_all();
    ui_ready = true;

    ui_container = $("hud");
    ui_update_bounds();

    ui_container?.classList.toggle("hidden");
}