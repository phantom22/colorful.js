"use strict";
/** last cliked button from #color-picker */
let picked_colors_els = new Set();
/** used instead of setting bttn.dataset["id"] */
const color_button_to_pallete_id = new WeakMap();
let show_palette = false;
function dom_update_color_picker() {
    let i = 0;
    const ch = color_picker_el.children, els_array = [...picked_colors_els];
    for (; i < ch.length; ++i) {
        const el = color_picker_el.children[i];
        el.style.backgroundColor = `rgba(${palette[i].toString()})`;
        el.textContent = picked_colors_els.has(el)
            ? (els_array.indexOf(el) + 1).toString()
            : "";
    }
    for (; i < palette.length; ++i) {
        const bttn = document.createElement("button"), color = palette[i];
        bttn.style.backgroundColor = `rgb(${color.toString()})`;
        bttn.style.color = luminance(color) > 128 ? "black" : "white";
        color_button_to_pallete_id.set(bttn, i);
        bttn.onmousedown = color_mousedown;
        bttn.onmouseenter = color_mouseenter;
        bttn.onmouseup = color_mouseup;
        color_picker_el.appendChild(bttn);
    }
    if (picked_colors_els.size === 0) {
        const el = color_picker_el.children[0];
        el.classList.add("picked");
        el.textContent = "1";
        picked_colors_els.add(el);
        stroke.choosen_palette = [palette_color_data[0]];
    }
}
let mouse_down_on_color = false, 
/** used to properly select/deselect without processing multiple times the
 * same elements on the same mouse stroke. */
curr_stroke_els = new Set();
function color_mousedown(e) {
    mouse_down_on_color = true;
    curr_stroke_els.clear();
    color_mouseenter(e);
}
function color_mouseenter(e) {
    const bttn = e.target;
    if (mouse_down_on_color === false) {
        w_mousemove(e);
        return;
    }
    else if (!e.shiftKey || curr_stroke_els.has(bttn))
        return;
    curr_stroke_els.add(bttn);
    const data = palette_color_data[color_button_to_pallete_id.get(bttn)];
    if (picked_colors_els.has(bttn)) {
        if (picked_colors_els.size === 1)
            return;
        bttn.classList.remove("picked");
        bttn.textContent = "";
        picked_colors_els.delete(bttn);
        const els_array = [...picked_colors_els], ind = stroke.choosen_palette.indexOf(data);
        stroke.choosen_palette.splice(ind, 1);
        for (let i = ind; i < els_array.length; ++i)
            els_array[i].textContent = (i + 1).toString();
    }
    else {
        bttn.classList.add("picked");
        picked_colors_els.add(bttn);
        bttn.textContent = picked_colors_els.size.toString();
        stroke.choosen_palette.push(data);
    }
}
function color_mouseup(e) {
    const bttn = e.target, color = palette_color_data[color_button_to_pallete_id.get(bttn)];
    if (!e.shiftKey) {
        for (const el of picked_colors_els) {
            el.classList.remove("picked");
            el.textContent = "";
        }
        picked_colors_els.clear();
        bttn.classList.add("picked");
        bttn.textContent = "1";
        picked_colors_els.add(bttn);
        stroke.choosen_palette = [color];
        stroke.palette_color = 0;
        return;
    }
}
function dom_toggle_picker() {
    show_palette = show_palette ? false : true;
    color_picker_el.style.display = show_palette ? "" : "none";
}
