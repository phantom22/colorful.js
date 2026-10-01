
let show_menu = false;
function dom_toggle_menu() {
    show_menu = show_menu ? false : true;

    menu_el.style.visibility = show_menu ? "visible" : "hidden";
    
    keyboard.shift_down = false;
    keyboard.ctrl_down = false;
    mouse.m1_down = false;
    
    stroke.flat_queue.clear();
}