let last_picked_color_el: HTMLElement;
function update_palette_picker() {
    let i = 0;
    const ch = palette_grid_el.children;
    for (; i<ch.length; ++i) {
        // @ts-ignore
        palette_grid_el.children[i].style.backgroundColor =
            `rgba(${palette[i].toString()})`;
    }

    for (; i<palette.length; ++i) {
        const bttn = document.createElement("button");
        bttn.style.backgroundColor = `rgba(${palette[i].toString()})`;

        const v = i;
        bttn.onclick = () => {
            palette_color = v;
            last_picked_color_el.classList.remove("picked");
            bttn.classList.add("picked");
            last_picked_color_el = bttn;
        };

        palette_grid_el.appendChild(bttn);
    }

    if (last_picked_color_el === undefined) {
        // @ts-ignore
        last_picked_color_el = palette_grid_el.children[0];
        last_picked_color_el.classList.add("picked");
    }
}

let show_info = false;
function toggle_info() {
    show_info = show_info ? false : true;

    const v = show_info ? "block" : "none";

    info_el.style.display = v;
    curtain_el.style.display = v;
    
    shift_down = false;
    ctrl_down = false;
    mouse_down = false;
    wave_queue.clear();
}