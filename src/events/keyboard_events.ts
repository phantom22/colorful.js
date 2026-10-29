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
    let t:number;
    switch (e.key) {
        case "Shift":
            keyboard.shift_down = true;
            stroke.palette_color = 0;
            return;
        case "Control":
            if (mouse.m1_down) return;
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
            fluid.display_palette = t < 0 ? PALETTE_TURBO : t as fluid_display_palette_t;
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
            if (keyboard.alt_down) return;
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