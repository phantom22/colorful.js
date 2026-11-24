const keyboard = {
    /** set to true when the shift button is pressed. */
    shift_down: false,
    /** set to true only when the ctrl button is pressed and shift is not. */
    ctrl_down: false,
    alt_down: false
}

/** event called on window.onkeydown */
function w_keydown(e:KeyboardEvent) {
    if (in_field(e)) return;
    // the help overlay is modal: only ? and Esc, the rest (arrows, page keys)
    // scrolls it as the browser does
    if (ui_help_open() && e.key !== "?" && e.key !== "Escape") return;
    let t:number;
    switch (e.key) {
        case "Shift":
            keyboard.shift_down = true;
            return;
        case "Control":
            if (mouse.m1_down) return;
            keyboard.ctrl_down = true;
            return;
        case "Alt":
            e.preventDefault();
            keyboard.alt_down = true;
            return;
        case "f":
            ui_set_force_active(!force.is_active);
            ui_force_btn.set(force.is_active, false);
            return;
        case "Backspace":
            if (e.shiftKey) { renderer.dye_clear_pending = true; return; }   // only the dye
            renderer.request_color_clear(true, keyboard.ctrl_down, false, true);
            return;
        case "Escape":          // closes an open editor; the UI itself stays (H hides it)
            if (ui_help_open()) ui_help_show(false);
            else if (geysers.editing) ui_geyser_editor_close();
            else if (ui_field_glsl.is_open) ui_field_glsl.close();
            else ui_plain_brush();
            return;
        case "?":
            ui_help_show(!ui_help_open());
            return;
        case "z":
        case "Z":
            if ((e.ctrlKey || e.metaKey) && scene_undo()) e.preventDefault();
            return;
        case "g":
        case "G":
            if (mouse.m1_down) return;      // not mid-stroke
            ui_toggle_geysers();
            return;
        case "h":
        case "H":
            ui_container.hidden = !ui_container.hidden;
            if (ui_field_glsl.is_open) ui_field_glsl.close();
            return;
        case "ArrowRight":
            e.preventDefault();
            // @ts-ignore
            fluid.display_palette = (fluid.display_palette + 1) % 3;
            ui_visualizer_s.refresh();
            return;
        case "ArrowLeft":
            e.preventDefault();
            t = fluid.display_palette - 1;
            fluid.display_palette = t < 0 ? PALETTE_TURBO : t as fluid_display_palette_t;
            ui_visualizer_s.refresh();
            return;
        // arrows: handled here, so the browser doesn't also scroll the inspector
        case "ArrowUp":
            if (!force.is_active) return;               // strength only matters with the field on
            e.preventDefault();
            force.strength *= Math.exp(50 * 0.008);
            force.strength = Math.min(force.strength, 10000);
            ui_field_strength.refresh();
            return;
        case "ArrowDown":
            if (!force.is_active) return;
            e.preventDefault();
            force.strength *= Math.exp(-50 * 0.008);
            force.strength = Math.max(force.strength, 0.5);
            ui_field_strength.refresh();
            return;
        case "Tab":
            e.preventDefault();
            if (keyboard.alt_down) return;
            ui_borders_btn.toggle();
            return;
        case "a":
            ui_arrows_btn.toggle();
            return;
        case "i":
            ui_inspector.stow(!ui_inspector.stowed);   // slides out to the right, the tab brings it back
            return;
        case "t":
            e.preventDefault();
            ui_field_glsl.open();
            return;
    }
}

/** event called on window.onkeyup */
function w_keyup(e:KeyboardEvent) {
    switch (e.key) {
        case "Shift":
            keyboard.shift_down = false;
            return;
        case "Control":
            keyboard.ctrl_down = false;
            return;
        case "Tab":
            if (in_field(e)) return;
            e.preventDefault();
            return;
    }       
}

addEventListener("keydown", w_keydown);
addEventListener("keyup", w_keyup);