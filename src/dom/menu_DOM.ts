
let show_menu = false;
function dom_toggle_menu() {
    show_menu = show_menu ? false : true;

    menu_el.style.visibility = show_menu ? "visible" : "hidden";
    
    shift_down = false;
    ctrl_down = false;
    mouse1_down = false;
    wave_queue.clear();
}