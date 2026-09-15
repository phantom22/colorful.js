/** last cliked button from #color-picker */
let picked_colors_els = new Set() as Set<HTMLElement>;
/** used instead of setting bttn.dataset["id"] */
const color_button_to_pallete_id = new WeakMap() as WeakMap<HTMLElement, number>;

function dom_update_color_picker() {
    let i = 0;
    const ch = color_picker_el.children,
          els_array = [...picked_colors_els];
    for (; i<ch.length; ++i) {
        const el = color_picker_el.children[i] as HTMLElement;
        el.style.backgroundColor = `rgba(${palette[i].toString()})`;
        el.textContent = picked_colors_els.has(el)
            ? (els_array.indexOf(el) + 1).toString()
            : "";
    }

    for (; i<palette.length; ++i) {
        const bttn = document.createElement("button"),
              color = palette[i];
        bttn.style.backgroundColor = `rgb(${color.toString()})`;
        
        const [r,g,b] = color,
              luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        bttn.style.color = luminance > 128 ? "black" : "white";
        color_button_to_pallete_id.set(bttn, i);

        bttn.onmousedown = color_mousedown;
        bttn.onmouseenter = color_mouseenter;
        bttn.onmouseup = color_mouseup;

        color_picker_el.appendChild(bttn);
    }

    if (picked_colors_els.size === 0) {
        const el = color_picker_el.children[0] as HTMLElement;
        el.classList.add("picked");
        el.textContent = "1";
        picked_colors_els.add(el);
        choosen_palette = [palette_color_data[0]];
    }
}

let mouse_down_on_color = false,
    /** used to properly select/deselect without processing multiple times the
     * same elements on the same mouse stroke. */
    curr_stroke_els = new Set() as Set<HTMLElement>;

function color_mousedown(e:MouseEvent) {
    mouse_down_on_color = true;
    curr_stroke_els.clear();
    color_mouseenter(e);
}

function color_mouseenter(e:MouseEvent) {
    const bttn = e.target as HTMLElement;
    if (mouse_down_on_color === false) {
        w_mousemove(e)
        return;
    }
    else if (!e.shiftKey || curr_stroke_els.has(bttn))
        return;

    curr_stroke_els.add(bttn);
    const data =
        palette_color_data[color_button_to_pallete_id.get(bttn) as number];    
    if (picked_colors_els.has(bttn)) {
        bttn.classList.remove("picked");
        bttn.textContent = "";
        picked_colors_els.delete(bttn);

        choosen_palette.splice(choosen_palette.indexOf(data), 1);

        const els_array = [...picked_colors_els];
        for (let i=choosen_palette.indexOf(data)+1; i<els_array.length; ++i)
            els_array[i].textContent = i.toString();
    }
    else {
        bttn.classList.add("picked");
        picked_colors_els.add(bttn);
        bttn.textContent = picked_colors_els.size.toString();
        choosen_palette.push(data);
    }
}

function color_mouseup(e:MouseEvent) {
    const bttn = e.target as HTMLElement,
          color = palette_color_data[color_button_to_pallete_id.get(bttn) as number];

    if (!e.shiftKey) {
        palette_color = 0;
        for (const el of picked_colors_els) {
            el.classList.remove("picked");
            el.textContent = "";
        }
        picked_colors_els.clear();

        bttn.classList.add("picked");
        bttn.textContent = "1";
        picked_colors_els.add(bttn);
        choosen_palette = [color];
        return;
    }
}