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
 * (--dye-c / --force-c in styles.css, also used by the brush rings). Kept
 * simple: they are drawn at 20 px. */
const NS = ' vector-effect="non-scaling-stroke"';
const DYE_GLYPH = `<path d="M12 3c3 4 5 6.5 5 9.5a5 5 0 0 1-10 0C7 9.5 9 7 12 3z"${NS}/>`,
      // wind: two lines with curled ends
      FORCE_GLYPH = `<path d="M3 9h11a3 3 0 1 0-3-3"${NS}/><path d="M3 15h14a3 3 0 1 1-3 3"${NS}/>`;
const WALL_GLYPH = '<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M4 12h16M10 5v7M15 12v7"/>';
const TOOL_ICONS = [
    // dye + force: the droplet with two speed lines behind it
    `<g class="ic-dye" transform="translate(3.6 1.6) scale(.86)">${DYE_GLYPH}</g>` +
    `<g class="ic-force"><path d="M2.5 11.5h5M3.5 15.5h4.5"/></g>`,
    `<g class="ic-dye">${DYE_GLYPH}</g>`,
    `<g class="ic-force">${FORCE_GLYPH}</g>`,
    WALL_GLYPH,
];

/** tool variant icons: a glyph shrunk toward the top left, with a solid badge
 * in the bottom right corner, outlined in the background color so it reads
 * on top of the glyph. */
const with_badge = (base:string, b:string) => `<g transform="scale(.8)">${base}</g>${b}`;
/** a small marker-style eraser (body + lighter tip), for every erase mode. */
const BADGE_ERASER = '<g class="eraser" transform="translate(18.2 18.4) rotate(-40)">' +
    '<rect class="er-body" x="-5.4" y="-2.7" width="10.8" height="5.4" rx="1.3"/>' +
    '<rect class="er-tip" x="-5.4" y="-2.7" width="3.6" height="5.4" rx="1.3"/></g>';
/** a map pin: a geyser is a source placed on the canvas. */
const PIN = (x:number, y:number, s:number, cls:string) =>
    `<g class="pin ${cls}" transform="translate(${x} ${y}) scale(${s})"><path d="M0 7.5S-4.2 3.2-4.2 0a4.2 4.2 0 0 1 8.4 0C4.2 3.2 0 7.5 0 7.5z"/><circle cy="0" r="1.5"/></g>`;
const BADGE_PIN = PIN(18.4, 15.6, 1, "badge-pin");
/** straight wall line: a segment with its two ends. */
const LINE_GLYPH = (cls:string) => `<g class="${cls}"><path d="M5 19L19 5"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/></g>`;
const BADGE_LINE = '<g class="line-badge"><path class="halo" d="M14 22l7.5-7.5"/><path d="M14 22l7.5-7.5"/>' +
    '<circle cx="14" cy="22" r="1.7"/><circle cx="21.5" cy="14.5" r="1.7"/></g>';

/** brush / geysers / erase geysers, for the dye, force and dye + force tools. */
function geyser_variants(id:mouse_mode_t, icon:string, name:string, key:string, push:boolean): ToolVariant[] {
    const place = push ? "drag to place and aim, click one to edit" : "click to place, click one to edit";
    return [
        { icon, tip:`${name} brush  [${key}]`, tip_touch:`${name} brush`, pick:() => ui_select_tool(id, 0) },
        { icon:with_badge(icon, BADGE_PIN), tip:`${name} geysers: ${place}  [${key} again]`,
          tip_touch:`${name} geysers: ${place.replace(/click/g, "tap")}`, pick:() => ui_select_tool(id, 1) },
        // erasing geysers: a big pin (in the tool's color) with the eraser
        { icon:with_badge(PIN(12, 9.5, 1.35, push ? "pin-force" : "pin-dye"), BADGE_ERASER), tip:`Erase ${name.toLowerCase()} geysers  [${key} twice more · or Shift]`,
          tip_touch:`Erase ${name.toLowerCase()} geysers`, pick:() => ui_select_tool(id, 2) },
    ];
}

/** picks a tool in one of its modes (the flyout buttons). Wall: 0 draw,
 * 1 erase, 2 straight lines, 3 straight erase. Others: 0 brush, 1 geysers,
 * 2 erase geysers. */
function ui_select_tool(id:mouse_mode_t, variant:number) {
    if (mouse.mode !== id) ui_toolbar.pick(id);
    if (id === MOUSE_MODE_WALL) {
        obstacle_splat.erase_mode = variant % 2 === 1;
        obstacle_splat.line_mode = variant >= 2;
    } else {
        geysers.mode = variant;
        geysers.drag = null;
        if (variant !== 1) ui_geyser_editor_close();
    }
    ui_sync_tool(true);
}

/** the mode a tool is in, as its variant index (see ui_select_tool). */
function tool_variant(id:mouse_mode_t) {
    if (id !== mouse.mode) return 0;
    if (id === MOUSE_MODE_WALL) return (obstacle_splat.line_mode ? 2 : 0) + (obstacle_splat.erase_mode ? 1 : 0);
    return geysers.mode;
}

const FORCE_ICON =
    '<path d="M13 5.5c-1.8-1-3.4 0-3.7 2L8 19c-.3 1.6-1.4 2.300-2.800 1.600"/>' +
    '<path d="M5.500 11.500h7"/>' +
    '<path d="M15.500 13.500l4.500 5.500m0-5.500l-4.500 5.500" stroke-width="1.400"/>';

/** a vector field arrow. */
/** velocity arrows toggle: arrows from the center out to the edge of an
 * invisible slanted ellipse, so they are longer along its long axis. */
const ARROWS_ICON = (() => {
    const N = 8, A = 11, B = 7, tilt = -35 * Math.PI / 180;    // semi-axes, long axis up-right
    const START = 1.2, H = 2.1, HA = 0.6;                       // gap at the center, head length / half angle
    const f = (v:number) => v.toFixed(2);
    let d = "";
    for (let k = 0; k < N; k++) {
        const phi = (k + 0.5) * 2 * Math.PI / N;
        const c = Math.cos(phi - tilt), s = Math.sin(phi - tilt);
        const r = 1 / Math.hypot(c / A, s / B);                  // center to the ellipse along phi
        const tx = Math.cos(phi), ty = Math.sin(phi);
        const hx = 12 + tx * r, hy = 12 + ty * r;
        const ca = Math.cos(HA), sa = Math.sin(HA);
        d += `M${f(12 + tx * START)} ${f(12 + ty * START)}L${f(hx)} ${f(hy)}` +
             `M${f(hx - H * (tx * ca - ty * sa))} ${f(hy - H * (ty * ca + tx * sa))}L${f(hx)} ${f(hy)}` +
             `L${f(hx - H * (tx * ca + ty * sa))} ${f(hy - H * (ty * ca - tx * sa))}`;
    }
    return `<path d="${d}" stroke-width="1.4"/>`;
})();

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
/** shows the tool's effective mode on its button, the brush ring and the
 * status bar: the wall tool's sticky erase (inverted by shift), and the
 * geyser modes of the force / dye + force tools (shift: erase geysers).
 * Returns whether the brush erases. */
let _shown_tool = "";
function ui_sync_tool(force = false) {
    const geyser = geysers_active();
    const erasing = mouse.mode === MOUSE_MODE_WALL ? wall_erasing() : geysers_erasing();
    const lines = mouse.mode === MOUSE_MODE_WALL && obstacle_splat.line_mode;
    const key = `${mouse.mode}|${erasing}|${geyser}|${lines}|${geysers.mode}|${obstacle_splat.erase_mode}`;
    if (force || key !== _shown_tool) {
        _shown_tool = key;
        _shown_erasing = erasing;
        // unset while the toolbar constructor picks
        ui_toolbar?.mark(MOUSE_MODE_WALL, "erase", mouse.mode === MOUSE_MODE_WALL && erasing);
        ui_toolbar?.mark(MOUSE_MODE_WALL, "line", lines);
        for (const id of [MOUSE_MODE_DYE_FORCE, MOUSE_MODE_DYE, MOUSE_MODE_FORCE, MOUSE_MODE_WALL] as mouse_mode_t[])
            ui_toolbar?.show_variant(id, tool_variant(id));
        for (const id of [MOUSE_MODE_DYE, MOUSE_MODE_FORCE, MOUSE_MODE_DYE_FORCE] as mouse_mode_t[]) {
            ui_toolbar?.mark(id, "geyser", geyser && mouse.mode === id && !erasing);
            ui_toolbar?.mark(id, "erase", geyser && mouse.mode === id && erasing);
        }
        wall_ring.classList.toggle("erase", erasing);
        force_ring.classList.toggle("erase", erasing);
        wall_ring.classList.toggle("dye", mouse.mode !== MOUSE_MODE_WALL);
        wall_ring.classList.toggle("wall", mouse.mode === MOUSE_MODE_WALL);
        document.getElementById("geysers")?.classList.toggle("active", geyser);
        ui_status.tool(mouse.mode === MOUSE_MODE_WALL
            ? `Wall${erasing || lines ? ` (${[erasing ? "erase" : "", lines ? "lines" : ""].filter(Boolean).join(", ")})` : ""}`
            : geyser ? `${MODE2STR[mouse.mode]} (${erasing ? "erase geysers" : "geysers"})` : MODE2STR[mouse.mode]);
    }
    return erasing;
}

/** screen pixel position of a uv point. */
function uv_screen(uv:ArrayLike<number>): [number, number] {
    return [canvas_rect.left + uv[0] * canvas_rect.width, canvas_rect.bottom - uv[1] * canvas_rect.height];
}

/** geyser marker tick: points where it pushes, longer when it pushes harder. */
function geyser_tick(x:number, y:number, angle:number, strength:number) {
    const a = angle * Math.PI / 180, len = 8 + 32 * Math.min(1, strength / GEYSER_MAX_STRENGTH * 2);
    return [x + Math.cos(a) * len, y - Math.sin(a) * len];
}

/** geyser markers (a dot and a tick along its push) and the aim arrow of a
 * drag in progress. Markers are rebuilt only when something changed. */
let _geyser_marks = "";
function ui_update_geysers() {
    const d = geysers.drag, aim = !!d && d.moved && !d.erase && mouse.mode !== MOUSE_MODE_DYE;
    const key = `${geysers.version}|${canvas_rect.width}|${canvas_rect.height}|${canvas_rect.left}|${canvas_rect.top}|${geysers.editing ? geysers.list.indexOf(geysers.editing) : -1}`;
    const g = document.getElementById("geysers"), arrow = document.getElementById("geyser-aim");
    if (arrow) {
        arrow.style.display = aim ? "" : "none";
        if (aim) {
            const [x1, y1] = uv_screen(d!.from), [x2, y2] = uv_screen(mouse.uv_pos);
            const [, strength] = geyser_aim(d!.from, mouse.uv_pos);
            for (const l of arrow.querySelectorAll("line")) {
                l.setAttribute("x1", String(x1)); l.setAttribute("y1", String(y1));
                l.setAttribute("x2", String(x2)); l.setAttribute("y2", String(y2));
            }
            const t = arrow.querySelector("text")!;
            t.setAttribute("x", String(x2 + 10)); t.setAttribute("y", String(y2 - 10));
            t.textContent = `${strength.toFixed(2)} h/s`;
        }
    }
    if (key === _geyser_marks || !g) return;
    _geyser_marks = key;
    g.innerHTML = geysers.list.map(q => {
        const [x, y] = uv_screen(q.uv), [tx, ty] = geyser_tick(x, y, q.angle, q.strength);
        const line = (c:string) => q.force ? `<line class="${c}" x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}"/>` : "";
        const fill = q.dye ? ` style="fill:${css_color(q.color)}"` : "";
        const sel = q === geysers.editing ? " selected" : "";
        return line("geyser-tick") + line("geyser-tick in") +
               `<circle class="geyser-dot${sel}"${fill} cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${sel ? 5 : 3.5}"/>`;
    }).join("");
}

/** 0..1 rgb -> css rgb(). */
function css_color(c:ArrayLike<number>) {
    const v = (x:number) => Math.round(255 * Math.min(1, Math.max(0, x)));
    return `rgb(${v(c[0])},${v(c[1])},${v(c[2])})`;
}

/** the geyser editor: a small panel next to the clicked geyser, built from the
 * inspector's rows (not saved). Dye + force geysers show the color row too. */
let geyser_editor: HTMLElement, geyser_section: UI_SECTION, geyser_dye_title: HTMLElement, geyser_force_title: HTMLElement;
const GEYSER_PLACEHOLDER: geyser_t = {
    uv: new Float32Array(2), angle: 0, strength: 0, color: [1, 1, 1], rgba: new Float16Array(4), dye: true, force: true,
    dye_radius: 0, dye_strength: 0, velocity_radius: 0, velocity_strength: 0,
};
function ui_init_geyser_editor() {
    const el = geyser_editor = document.createElement("div");
    el.id = "geyser-editor";
    el.hidden = true;
    isolate(el);
    const head = document.createElement("div");
    head.className = "ge-head";
    head.innerHTML = `<span>GEYSER</span><button type="button" class="ge-del" title="Delete this geyser">delete</button><button type="button" class="ge-close" title="Close [Esc]">×</button>`;
    head.querySelector(".ge-close")!.addEventListener("click", () => ui_geyser_editor_close());
    head.querySelector(".ge-del")!.addEventListener("click", () => {
        const g = geysers.editing;
        if (!g) return;
        geysers.list = geysers.list.filter(q => q !== g);
        geysers.version++;
        ui_geyser_editor_close();
    });

    const target = () => geysers.editing ?? GEYSER_PLACEHOLDER;
    const changed = () => geyser_changed(target());
    const s = geyser_section = new UI_SECTION("geyser");
    geyser_dye_title = s.subtitle("dye");
    s.color({label:"color", tooltip:"$Color$ {Dye this geyser blends in.}", obj:target, key:"color", visible:() => target().dye, onPick:changed});
    geyser_force_title = s.subtitle("force");
    s.vec2({label:"center", tooltip:"$Center$ {Where the geyser sits, as a fraction of the screen width (x) and height (y), from the bottom left.} $$Values$$ {[0 – 1] on both axes.}", obj:target, key:"uv", min:0, max:1, step:0.001, onChange:changed});
    s.slider({label:"direction", tooltip:"$Direction$ {Where it pushes, in degrees.} $$Values$$ {[0]: right\n[90]: up\n[±180]: left\n[-90]: down}", obj:target, key:"angle", min:-180, max:180, step:1, unit:{symbol:"°", name:"degrees"}, visible:() => target().force, onChange:changed});
    s.slider({label:"strength", tooltip:`$Strength$ {Speed of the flow it keeps up, in screen heights per second. Set by the length of the drag that placed it.} $$Values$$ {[0.2 – 1]: gentle stream\n[1 – 3]: jet\n[${GEYSER_MAX_STRENGTH}]: max}`, obj:target, key:"strength", min:0, max:GEYSER_MAX_STRENGTH, step:0.01, unit:{symbol:"h/s", name:"screen heights per second"}, visible:() => target().force, onChange:changed});

    el.append(head, s.body);
    $("hud").appendChild(el);
}

function ui_geyser_editor_open(g:geyser_t) {
    geysers.editing = g;
    geysers.version++;                       // marks the selected one
    geyser_dye_title.hidden = !g.dye;
    geyser_force_title.hidden = !g.force;     // a dye geyser's center row then sits under "dye"
    geyser_section.refresh();
    geyser_editor.hidden = false;
    // beside the geyser, kept on screen
    const [x, y] = uv_screen(g.uv), r = geyser_editor.getBoundingClientRect();
    const left = x + 16 + r.width > innerWidth - 8 ? x - 16 - r.width : x + 16;
    const top = Math.min(Math.max(8, y - 16), innerHeight - r.height - 8);
    geyser_editor.style.left = `${Math.max(8, left)}px`;
    geyser_editor.style.top = `${top}px`;
}

/** after the geyser changed from outside the editor (a re-aim drag). */
function ui_geyser_editor_refresh() {
    if (geysers.editing) geyser_section.refresh();
}

function ui_geyser_editor_close() {
    if (!geysers.editing && geyser_editor?.hidden) return;
    geysers.editing = null;
    geysers.version++;
    if (geyser_editor) geyser_editor.hidden = true;
    (document.activeElement as HTMLElement | null)?.blur();
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
    ui_update_geysers();
    const wall = mouse.mode === MOUSE_MODE_WALL;
    const erasing = ui_sync_tool();
    const on = mouse.over_canvas && !mouse.m2_down;
    const line_on = wall_line_pending();     // also while the pointer is past the edge
    const solid_on = on && mouse.mode !== MOUSE_MODE_FORCE;
    const force_on = on && (mouse.mode & MOUSE_MODE_FORCE) !== 0;
    wall_line.style.display = line_on ? "" : "none";
    if (!on && !line_on) {
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
    ui_init_geyser_editor();

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
    const W = MOUSE_MODE_WALL;
    ui_toolbar = new UI_TOOLBAR<mouse_mode_t>([
        { id:MOUSE_MODE_DYE_FORCE, icon:TOOL_ICONS[0], key:"q",
          tip:"Dye + Force · pick again: geysers · again: erase geysers",
          tip_touch:"Dye + Force · tap again: geysers · again: erase geysers · swipe right: all modes",
          variants:geyser_variants(MOUSE_MODE_DYE_FORCE, TOOL_ICONS[0], "Dye + Force", "Q", true) },
        { id:MOUSE_MODE_DYE, icon:TOOL_ICONS[1], key:"w",
          tip:"Dye · pick again: color geysers · again: erase geysers",
          tip_touch:"Dye · tap again: color geysers · again: erase geysers · swipe right: all modes",
          variants:geyser_variants(MOUSE_MODE_DYE, TOOL_ICONS[1], "Dye", "W", false) },
        { id:MOUSE_MODE_FORCE, icon:TOOL_ICONS[2], key:"e",
          tip:"Force · pick again: geysers · again: erase geysers",
          tip_touch:"Force · tap again: geysers · again: erase geysers · swipe right: all modes",
          variants:geyser_variants(MOUSE_MODE_FORCE, TOOL_ICONS[2], "Force", "E", true) },
        { id:W, icon:TOOL_ICONS[3], key:"r", separator:true,
          tip:"Wall · pick again: erase · Shift: invert · Ctrl: straight lines",
          tip_touch:"Wall · tap again: erase · long-press: straight lines · swipe right: all modes",
          variants:[
              { icon:TOOL_ICONS[3], tip:"Wall  [R]", tip_touch:"Wall", pick:() => ui_select_tool(W, 0) },
              { icon:with_badge(TOOL_ICONS[3], BADGE_ERASER), tip:"Erase walls  [R again · or hold Shift]", tip_touch:"Erase walls", pick:() => ui_select_tool(W, 1) },
              { icon:with_badge(TOOL_ICONS[3], BADGE_LINE), tip:"Straight walls: press, drag, release  [or hold Ctrl]", tip_touch:"Straight walls: press, drag, release", pick:() => ui_select_tool(W, 2) },
              { icon:with_badge(LINE_GLYPH("line-glyph"), BADGE_ERASER), tip:"Erase in straight lines  [or hold Ctrl + Shift]", tip_touch:"Erase in straight lines", pick:() => ui_select_tool(W, 3) },
          ],
          onHold:() => {                   // touch: sticky straight-line mode (ctrl's job on a keyboard)
              if (mouse.mode !== MOUSE_MODE_WALL) { ui_toolbar.pick(MOUSE_MODE_WALL); obstacle_splat.line_mode = true; }
              else obstacle_splat.line_mode = !obstacle_splat.line_mode;
              ui_sync_tool(true);
          } },
    ], mouse.mode, id => {
        if (id !== MOUSE_MODE_WALL) obstacle_splat.erase_mode = obstacle_splat.line_mode = false;   // leaving the wall tool ends erasing and lines
        if (id !== mouse.mode) { geysers.mode = 0; ui_geyser_editor_close(); }   // and geyser mode
        ui_inspector.focus(SECTION_OF_TOOL[id]);
        if (mouse.mode === id) { ui_sync_tool(true); return; }
        const prev = mouse.mode;
        mouse.mode = id;
        ui_sync_tool(true);
        ui_fluid_bg.refresh();
        ui_visualizer_s.refresh();
    }, id => {
        if (id === MOUSE_MODE_WALL) obstacle_splat.erase_mode = !obstacle_splat.erase_mode;
        // force / dye + force: brush -> geysers -> erase geysers -> brush
        if (id !== MOUSE_MODE_WALL) {
            geysers.mode = (geysers.mode + 1) % 3;
            geysers.drag = null;
            if (geysers.mode !== 1) ui_geyser_editor_close();
        }
    });

    ui_force_btn = ui_toolbar.add_toggle({
        tip: "Force field [F] · edit the field [T]",
        tip_touch: "Force field · long-press: edit the field",
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
        tip: "Open borders [TAB]",
        tip_touch: "Open borders",
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