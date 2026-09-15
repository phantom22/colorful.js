/** last cliked button from #color-picker */
let picked_colors_els = new Set() as Set<HTMLElement>;
function update_palette_picker() {
    let i = 0;
    const ch = color_picker_el.children,
          els_array = [...picked_colors_els];
    for (; i<ch.length; ++i) {
        const el = color_picker_el.children[i] as HTMLElement;
        el.style.backgroundColor = `rgba(${palette[i].toString()})`;
        if (picked_colors_els.has(el))
            el.textContent = (els_array.indexOf(el) + 1).toString();
        else
            el.textContent = "";
    }

    for (; i<palette.length; ++i) {
        const bttn = document.createElement("button"),
              color = palette[i];
        bttn.style.backgroundColor = `rgb(${color.toString()})`;
        
        const [r,g,b] = palette[i],
              luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        bttn.style.color = luminance > 128 ? "black" : "white";

        const v = i;
        bttn.onclick = (e:MouseEvent) => {
            palette_color = 0;
            if (!e.ctrlKey) {
                for (const el of picked_colors_els) {
                    el.classList.remove("picked");
                    el.textContent = "";
                }
                picked_colors_els.clear();

                bttn.classList.add("picked");
                bttn.textContent = "1";
                picked_colors_els.add(bttn);
                palette_colors = [color];
                return;
            }
            
            if (picked_colors_els.has(bttn)) {
                bttn.classList.remove("picked");
                bttn.textContent = "";
                picked_colors_els.delete(bttn);
                palette_colors.splice(palette_colors.indexOf(color), 1);

                const els_array = [...picked_colors_els];
                for (let i=0; i<els_array.length; ++i)
                    els_array[i].textContent = (i+1).toString();
            }
            else {
                bttn.classList.add("picked");
                picked_colors_els.add(bttn);
                bttn.textContent = picked_colors_els.size.toString();
                palette_colors.push(color);
            }
        };

        color_picker_el.appendChild(bttn);
    }

    if (picked_colors_els.size === 0) {
        const el = color_picker_el.children[0] as HTMLElement;
        el.classList.add("picked");
        el.textContent = "1";
        picked_colors_els.add(el);
        palette_colors = [palette[0]];
    }
}

let show_info = false;
function toggle_info() {
    show_info = show_info ? false : true;

    curtain_el.style.visibility = show_info ? "visible" : "hidden";
    
    shift_down = false;
    ctrl_down = false;
    mouse1_down = false;
    wave_queue.clear();
}