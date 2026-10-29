let ui_toolbar: UI_TOOLBAR<mouse_mode_t>,
    ui_status: UI_STATUS,
    ui_views: UI_VIEW_SELECT<fluid_display_t>,
    ui_inspector: UI_INSPECTOR,
    ui_palette: UI_PALETTE,
    ui_bounds: UI_BOUNDS,
    //ui_brush_s: UI_SECTION,
    ui_dye_brush_s: UI_SECTION,
    ui_force_brush_s: UI_SECTION,
    ui_diffusion_s: UI_SECTION,
    ui_wall_s: UI_SECTION,
    ui_field_s: UI_SECTION,
    ui_fluid_s: UI_SECTION,
    ui_field_strength: UI_SLIDER,
    ui_field_center: UI_VECTOR,
    ui_field_span: UI_SLIDER,
    ui_visualizer_s: UI_SECTION,

    ui_container: HTMLDivElement,

    ui_force_btn: { set: (on: boolean, notify?: boolean) => void; toggle: () => void; readonly on: boolean; },
    ui_borders_btn: { set: (on: boolean, notify?: boolean) => void; toggle: () => void; readonly on: boolean; },
    ui_fluid_bg: UI_COLOR,

    ui_field_glsl: UI_GLSL;


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
    ui_bounds    = new UI_BOUNDS();
    ui_status    = new UI_STATUS();
    ui_inspector = new UI_INSPECTOR();

    const sim = ui_inspector.section("Precision");
    sim.slider({label:"time scale", tooltip:"$Time scale$ {Multiplies the simulated time that passes per frame.} $$Values$$ {[0]: paused\n[0.1 – 0.9]: slow motion\n[1]: real time\n[1 – 2]: fast forward, less stable}", obj:renderer, key:"time_scale", min:0.0, max:2.0});
    sim.slider({label:"dt", tooltip:"$Time step$ {Seconds simulated per step. Smaller steps are more accurate and stable, larger ones are faster but smear and can blow up.} $$Values$$ {[0.004 – 0.008]: very accurate (120–240 Hz)\n[0.0167]: default (60 Hz)\n[> 0.025]: visibly unstable with strong forces}", obj:renderer, key:"fixed_delta_time", min:0.0, max:1/30});
    sim.slider({label:"iterations", tooltip:"$Pressure iterations$ {Jacobi passes per step. Pressure travels one texel per pass, so more passes make the fluid more incompressible and let flow reach far through thin tubes.} $$Values$$ {[0]: no projection, the fluid compresses\n[20 – 40]: fast, mushy\n[60 – 150]: good quality\n[> 200]: only for long thin channels}", obj:fluid, key:"jacobi_iterations", min:0, max:300, int:true});

    ui_palette = ui_inspector.palette(
        palette_color_data, stroke.palette_color,
        i => { stroke.palette_color = i; },
        c => { stroke.choosen_palette.push(c); }
    );

    ui_dye_brush_s = ui_inspector.section("Dye brush", () => mouse.mode === MOUSE_MODE_DYE || mouse.mode === MOUSE_MODE_DYE_FORCE);
    ui_dye_brush_s.slider({label:"radius", tooltip:"$Dye radius$ {Size of the dye brush, as the 1/e radius of a Gaussian in sim texels.} $$Values$$ {[1 – 5]: thin lines\n[10 – 25]: normal\n[> 40]: big soft blobs}"   , obj:splat, key:"dye_radius", min:1e-4, max:0.01, log:true});
    ui_dye_brush_s.slider({label:"strength", tooltip:"$Dye strength$ {How strongly the brush replaces the existing dye per frame. It blends, it never adds, so slow strokes can't saturate.} $$Values$$ {[0 – 0.2]: faint, builds up slowly\n[0.3 – 0.6]: normal\n[0.8 – 1]: opaque, overrides what is there}", obj:splat, key:"dye_strength", min:0, max:1});

    ui_force_brush_s = ui_inspector.section("Force brush", () => mouse.mode === MOUSE_MODE_DYE_FORCE || mouse.mode === MOUSE_MODE_FORCE);
    ui_force_brush_s.slider({label:"radius", tooltip:"$Force radius$ {Size of the push applied by the brush, in sim texels (1/e radius). Wider pushes survive the pressure projection and carry flow farther.} $$Values$$ {[1 – 8]: sharp, dies quickly\n[15 – 30]: normal\n[> 40]: broad, slow currents}", obj:splat, key:"velocity_radius", min:1e-4, max:0.02, log:true});
    ui_force_brush_s.slider({label:"strength", tooltip:"$Force strength$ {Opacity of the push at the center of the brush.} $$Values$$ {[0 – 0.3]: gentle\n[0.4 – 0.7]: normal\n[0.8 – 1]: full push}", obj:splat, key:"velocity_strength", min:0, max:1});
    ui_force_brush_s.slider({label:"speed sensitivity", tooltip:"$Speed sensitivity$ {Converts mouse speed into fluid speed.} $$Values$$ {[0]: the brush injects no motion\n[0.2 – 0.5]: normal\n[> 1]: small movements make violent jets}", obj:splat, key:"force_scale", min:0, max:2});

    ui_wall_s = ui_inspector.section("Wall brush", () => mouse.mode === MOUSE_MODE_WALL);
    ui_wall_s.slider({label:"radius", tooltip:"$Wall radius$ {Half thickness of the wall stroke, in units of screen height. Total thickness is twice this value.} $$Values$$ {[< 0.006]: under 3 texels, leaks\n[0.008 – 0.02]: solid walls\n[> 0.03]: big blocks}", obj:obstacle_splat, key:"radius", min:0.002, max:0.05, log:true});
    ui_wall_s.slider({label:"outline thickness", tooltip:"$Edge softness$ {Width of the soft ramp at the wall contour. It makes the rim smooth and anti-aliased.} $$Values$$ {[0.0005 – 0.002]: crisp\n[0.003]: default\n[> 0.006]: blurry walls}", obj:obstacle_splat, key:"outline_width", min:0.0005, max:0.01, log:true});

    ui_field_s = ui_inspector.section("Force field", () => force.is_active);
    ui_field_glsl = ui_field_s.glsl({
        label:"field", obj:force, key:"glsl",
        tooltip:"$Field source$ {Edit [get_velocity(vec2 p)] in GLSL. [p] is the world position, the return value is the velocity at that point before the strength is applied.} {Compile with [Ctrl+S]. Errors show on the line.}",
        title:"glsl code", button:"get_velocity(vec2 p)",
        required_fn:"get_velocity", line_offset:0,
        compile:(s:string) => {
            if (!force.is_active) {
                force.is_active = true;
                ui_force_btn.set(true, false);
            }

            return recompile_forcefield(s);
        }
    });
    ui_field_center = ui_field_s.vec2({label:"center", tooltip:"$Center$ {World coordinates that sit at the middle of the screen. Right-drag pans it.} $$Values$$ {Any value. The corner labels show the result.}", obj:force, key:"center", step:0.01, onChange:ui_update_bounds});
    ui_field_strength = ui_field_s.slider({label:"strength", tooltip:"$Force strength$ {Scales the velocity returned by [get_velocity].} {Higher values push the fluid harder and hit the speed cap sooner.} $$Values$$ {[1 – 100]: gentle drift\n[100 – 1000]: strong flow\n[> 1000]: saturates [max velocity]}", obj:force, key:"strength", min:1, max:10000});
    ui_field_span = ui_field_s.slider({label:"window", tooltip:"$Window$ {World width that the screen shows. Mouse wheel zooms it.} $$Values$$ {[0.5 – 5]: zoomed in on the details\n[10 – 40]: a few periods of the field\n[> 100]: whole field in view}", obj:force, key:"span", min:0.5, max:200, log:true, onChange:ui_update_bounds});
    ui_field_s.separator();
    ui_field_s.subtitle("vector field")
    ui_field_s.toggle({label:"pure field", tooltip:"$Pure field$ {Pulls the velocity back toward the field after the pressure solve, so the picture follows the vector field and the fluid only adds perturbations.} {Off: the field is a plain force and the solver reshapes it.}", obj:force, key:"pure_vector_field", int:true});
    ui_field_s.slider({label:"relaxation", tooltip:"$Relaxation$ {How quickly the velocity returns to the field, in 1/s.} $$Values$$ {[0 – 1]: loose, the fluid dominates\n[2 – 5]: field plus eddies\n[> 15]: practically the raw field}", obj:force, key:"relaxation", min:0.0, max:30.0, visible:() => force.pure_vector_field })

    ui_fluid_s = ui_inspector.section("Simulation");
    ui_fluid_bg = ui_fluid_s.color(({
        label: "background", tooltip:"$Background$ {Color of the empty fluid. Changing it clears the dye. Locked while a non-dye view is shown.} $$Values$$ {Each channel [0 – 1].}", obj: fluid, key: "bg_arr", onPick: () => {
            color_logarithm(fluid.bg, fluid.bg_arr);
            renderer.request_color_clear = { pending: true, noise: false };
        },
        frozen: () => fluid.display_mode === DISPLAY_DYE ? undefined : fluid.bg_arr,
    }));
    ui_fluid_s.slider({label:"jacobi scale", tooltip:"$Pressure carry-over$ {Fraction of last frame's pressure used as the starting guess. High values converge faster over time.} $$Values$$ {[0 – 0.5]: restarts, needs many iterations\n[0.8 – 0.95]: good\n[1]: never forgets, can accumulate noise}", obj:fluid, key:"jacobi_scale", min:0, max:1});
    ui_fluid_s.slider({label:"curl strength", tooltip:"$Vorticity confinement$ {Re-injects the swirl lost to numerical blur, so eddies live longer.} $$Values$$ {[0]: smooth, dies quickly\n[5 – 20]: lively\n[> 35]: noisy, can go unstable}", obj:fluid, key:"curl_strength", min:0, max:60});
    ui_fluid_s.slider({label:"velocity decay", tooltip:"$Velocity decay$ {Multiplier applied to the velocity every step. Below 1 acts like friction.} $$Values$$ {[1]: motion never fades\n[0.999 – 0.9999]: slow fade\n[< 0.99]: thick, syrup-like}", obj:fluid, key:"velocity_dissipation", min:0.9, max:1, step:0.0001});
    ui_fluid_s.slider({label:"max velocity", tooltip:"$Max velocity$ {Speed cap in texels/s. It keeps the solver stable.} $$Values$$ {[50 – 300]: calm\n[400 – 1500]: normal\n[> 3000]: only with a small dt}", obj:fluid, key:"max_velocity", min:0, max:10000});

    ui_diffusion_s = ui_inspector.section("Diffusion");
    ui_diffusion_s.slider({label:"base diff.", tooltip:"$Base diffusion$ {Rate at which dye blends with its surroundings everywhere, in 1/s.} $$Values$$ {[0]: crisp, only advection mixes\n[0.5 – 2]: soft\n[> 5]: washes out fast}", obj:fluid, key:"base_diffusion", min:0, max:10});
    ui_diffusion_s.slider({label:"curl diff.", tooltip:"$Curl diffusion$ {Extra blending where the flow swirls, like eddy mixing.} $$Values$$ {[0]: off\n[0.05 – 0.3]: swirls blend\n[> 1]: vortex cores dissolve}", obj:fluid, key:"curl_diffusion", min:0, max:2});
    ui_diffusion_s.slider({label:"vel. diff.", tooltip:"$Speed diffusion$ {Extra blending proportional to the local speed.} $$Values$$ {[0]: off\n[0.02 – 0.1]: moving dye smears gently\n[> 0.3]: heavy blur in fast regions}", obj:fluid, key:"velocity_diffusion",min:0, max:0.5});
    ui_diffusion_s.slider({label:"max diff.", tooltip:"$Max diffusion$ {Upper limit of the total rate, in 1/s.} $$Values$$ {[2 – 10]: safe\n[> 20]: can wash out the dye in a few frames}", obj:fluid, key:"max_diffusion", min:0, max:30});
    ui_diffusion_s.slider({label:"diff. radius", tooltip:"$Diffusion radius$ {Radius of the blending ring in dye texels. Larger spreads color farther per step.} $$Values$$ {[1 – 3]: fine\n[4 – 6]: normal\n[> 8]: star-shaped artifacts}", obj:fluid, key:"diffusion_texel_radius", min:1, max:12});

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
        { id:MOUSE_MODE_WALL, tip:"Wall", icon:TOOL_ICONS[3], key:"r", separator:true },
    ], mouse.mode, id => {
        ui_status.tool(MODE2STR[id]);
        ui_inspector.focus(SECTION_OF_TOOL[id]);
        if (mouse.mode === id) return;
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
        onToggle: (v:boolean) => {
            if (v === !fluid.open_borders) return;
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
    ui_visualizer_s.slider({label:"ref", tooltip:"$Reference$ {Value that maps to about 63% of the palette. Everything is compressed smoothly above it.} $$Values$$ {Small: sensitive, detail in weak regions\nLarge: only strong regions light up}", obj:display_obj, key:"ref", min:0, max:display_max});
    ui_visualizer_s.slider({label:"thresh", tooltip:"$Threshold$ {Palette position below which values are scaled by [k].} $$Values$$ {[0]: off\n[0.05 – 0.3]: lifts or hides weak values}", obj:display_obj, key:"thresh", min:0, max:1});
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

    ui_container = $("hud");
    ui_update_bounds();

    document.getElementById("hud")?.classList.toggle("hidden");
}