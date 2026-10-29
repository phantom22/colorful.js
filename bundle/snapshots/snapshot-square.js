const searchParams = new (class {
    url;
    constructor() {
        this.url = new URL(window.location.href);
    }
    getNumber(p, fallback = 0, lower = -Infinity, upper = Infinity) {
        const v = this.url.searchParams.get(p), nv = Number(v);
        // @ts-ignore
        return v === null || isNaN(v) ? fallback : Math.min(Math.max(nv, lower), upper);
    }
    getUint8Color(p, fallback = new Uint8Array([0, 0, 0])) {
        const v = this.url.searchParams.get(p);
        if (v === null)
            return fallback;
        try {
            const av = JSON.parse(v), o = new Uint8Array(4);
            if (!Array.isArray(av))
                return fallback;
            const l = av.length;
            if (l < 3 || l > 4)
                return fallback;
            for (let i = 0; i < 3; ++i) {
                const val = av[i];
                if (val < 0 || val > 255 || val === undefined)
                    return fallback;
                o[i] = val;
            }
            if (l === 3)
                o[3] = 255;
            else if (av[3] !== undefined && av[3] >= 0 && av[3] <= 255)
                o[3] = av[3];
            else
                return fallback;
            return Uint8Array.from(av);
        }
        catch (e) {
            return fallback;
        }
    }
    getBoolean(p) {
        return this.url.searchParams.get(p) === "true";
    }
    getString(p, fallback = "") {
        return this.url.searchParams.get(p) || fallback;
    }
});
const side_length = searchParams.getNumber("side_length", 64, 1), brush_size = Math.floor(searchParams.getNumber("brush_size", 5, 0)), grid_bg = searchParams.getUint8Color("grid_bg");
const fluid = {
    gain: searchParams.getNumber("gain", 5.0, 0.1, 30.0),
    drag: searchParams.getNumber("drag", 0.03, 0.01, 6.0),
    phi_decay: searchParams.getNumber("phi_decay", 55.0, 2.0, 55.0),
    strength: searchParams.getNumber("strength", 3000.0, 0.5),
    jacobi_iterations: Math.floor(searchParams.getNumber("jacobi_iterations", 4, 0, 60)),
    //fade_rate: searchParams.getNumber("fade_rate", 0.0, 0.0, 0.5),
    phi_diffusion: searchParams.getNumber("phi_diffusion", 60.0, 1.0),
    dye_diffusion: searchParams.getNumber("dye_diffusion", 50.0, 1.0),
    inject_rate: 25.0,
    inject_duration: 90.0,
    inject_max: 0.5,
    inject_spread: 15.0,
    pause_jacobi_while_draggin: false,
    just_drag: false
};
function rate_from_ms(wave_delay_ms, convergence_fraction = 0.95) {
    const t_seconds = wave_delay_ms * 0.001;
    return -Math.log(1 - convergence_fraction) / t_seconds;
}
{
    let params = new URLSearchParams([
        ["side_length", `${side_length}`],
        ["brush_size", `${brush_size}`],
        ["gain", `${fluid.gain}`],
        ["drag", `${fluid.drag}`],
        ["phi_decay", `${fluid.phi_decay}`],
        ["phi_diffusion", `${fluid.phi_diffusion}`],
        ["dye_diffusion", `${fluid.dye_diffusion}`],
        ["strength", `${fluid.strength}`],
        ["jacobi_iterations", `${fluid.jacobi_iterations}`],
        //["fade_rate", `${fluid.fade_rate}`]
    ]);
    const updated_search_params = `?${params.toString()}&grid_bg=[${grid_bg}]`;
    if (window.location.search !== updated_search_params)
        window.history.replaceState({}, '', updated_search_params);
}
let show_menu = false;
function dom_toggle_menu() {
    show_menu = show_menu ? false : true;
    menu_el.style.visibility = show_menu ? "visible" : "hidden";
    keyboard.shift_down = false;
    keyboard.ctrl_down = false;
    mouse.m1_down = false;
    stroke.flat_queue.clear();
}
/** last cliked button from #color-picker */
let picked_colors_els = new Set();
/** used instead of setting bttn.dataset["id"] */
const color_button_to_pallete_id = new WeakMap();
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
        stroke.palette_color = 0;
        for (const el of picked_colors_els) {
            el.classList.remove("picked");
            el.textContent = "";
        }
        picked_colors_els.clear();
        bttn.classList.add("picked");
        bttn.textContent = "1";
        picked_colors_els.add(bttn);
        stroke.choosen_palette = [color];
        return;
    }
}
const _pack_buffer = new ArrayBuffer(4), _pack8 = new Uint8Array(_pack_buffer), _pack32 = new Uint32Array(_pack_buffer);
/** This approach was used to guarantee endian compatibility. */
function pack_uint8(color) {
    _pack8[0] = color[0];
    _pack8[1] = color[1];
    _pack8[2] = color[2];
    _pack8[3] = 255;
    return _pack32[0]; // Guaranteed exact memory layout for current CPU
}
function complementary_color(color) {
    return new Uint8Array([
        255 - color[0], 255 - color[1], 255 - color[2], 255
    ]);
}
function uint8_to_float32(color) {
    return new Float32Array([
        color[0] / 255, color[1] / 255, color[2] / 255, 1
    ]);
}
function get_color_data(color) {
    return {
        color,
        fcolor: uint8_to_float32(color),
        packed: pack_uint8(color)
    };
}
function luminance(color) {
    return 0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2];
}
const palette = [
    new Uint8Array([170, 20, 45]),
    new Uint8Array([235, 50, 65]),
    new Uint8Array([255, 120, 140]),
    new Uint8Array([180, 35, 20]),
    new Uint8Array([242, 75, 40]),
    new Uint8Array([255, 140, 110]),
    new Uint8Array([185, 60, 10]),
    new Uint8Array([248, 110, 20]),
    new Uint8Array([255, 160, 80]),
    new Uint8Array([180, 95, 5]),
    new Uint8Array([245, 155, 15]),
    new Uint8Array([255, 185, 45]),
    new Uint8Array([165, 125, 0]),
    new Uint8Array([235, 195, 10]),
    new Uint8Array([255, 215, 55]),
    new Uint8Array([120, 145, 5]),
    new Uint8Array([175, 215, 15]),
    new Uint8Array([205, 240, 50]),
    new Uint8Array([30, 145, 35]),
    new Uint8Array([60, 210, 65]),
    new Uint8Array([115, 240, 105]),
    new Uint8Array([5, 140, 75]),
    new Uint8Array([15, 205, 115]),
    new Uint8Array([75, 240, 150]),
    new Uint8Array([5, 130, 130]),
    new Uint8Array([10, 195, 195]),
    new Uint8Array([65, 235, 225]),
    new Uint8Array([10, 115, 170]),
    new Uint8Array([20, 175, 240]),
    new Uint8Array([85, 215, 255]),
    new Uint8Array([25, 85, 190]),
    new Uint8Array([45, 135, 255]),
    new Uint8Array([115, 180, 255]),
    new Uint8Array([55, 60, 200]),
    new Uint8Array([90, 100, 255]),
    new Uint8Array([150, 160, 255]),
    new Uint8Array([90, 45, 195]),
    new Uint8Array([140, 80, 255]),
    new Uint8Array([180, 135, 255]),
    new Uint8Array([130, 30, 180]),
    new Uint8Array([190, 60, 245]),
    new Uint8Array([215, 115, 255]),
    new Uint8Array([160, 20, 140]),
    new Uint8Array([235, 45, 205]),
    new Uint8Array([255, 105, 230]),
    new Uint8Array([165, 15, 90]),
    new Uint8Array([240, 40, 140]),
    new Uint8Array([255, 110, 180]),
    new Uint8Array([230, 230, 230]),
    new Uint8Array([255, 255, 255]),
    new Uint8Array([230, 230, 230]),
    new Uint8Array([96, 96, 96]),
    new Uint8Array([128, 128, 128]),
    new Uint8Array([160, 160, 160]),
    new Uint8Array([0, 0, 0]),
    new Uint8Array([32, 32, 32]),
    new Uint8Array([64, 64, 64])
];
let palette_color_data = palette.map(v => get_color_data(v));
function mat4x4_mul(A, B) {
    const [a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p] = A, [$, _, C, D, E, F, G, H, I, J, K, L, M, N, O, P] = B;
    return new Float32Array([
        a * $ + b * E + c * I + d * M, a * _ + b * F + c * J + d * N, a * C + b * G + c * K + d * O, a * D + b * H + c * L + d * P,
        e * $ + f * E + g * I + h * M, e * _ + f * F + g * J + h * N, e * C + f * G + g * K + h * O, e * D + f * H + g * L + h * P,
        i * $ + j * E + k * I + l * M, i * _ + j * F + k * J + l * N, i * C + j * G + k * K + l * O, i * D + j * H + k * L + l * P,
        m * $ + n * E + o * I + p * M, m * _ + n * F + o * J + p * N, m * C + n * G + o * K + p * O, m * D + n * H + o * L + p * P,
    ]);
}
function create_view_projection_matrix(x, y, s, ar) {
    const l = -ar, r = ar, b = -1, t = 1, n = -1, f = 1;
    const projection_matrix = new Float32Array([
        2 / (r - l), 0, 0, 0,
        0, 2 / (t - b), 0, 0,
        0, 0, -2 / (f - n), 0,
        -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1
    ]);
    const inv_s = 1. / s;
    const view_matrix = new Float32Array([
        inv_s, 0, 0, 0,
        0, inv_s, 0, 0,
        0, 0, 1, 0,
        -x * inv_s, -y * inv_s, 0, 1
    ]);
    return mat4x4_mul(projection_matrix, view_matrix);
}
function create_buffer_vec2(data, at) {
    const out = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, out);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(at);
    return out;
}
function bind_vec2_attr(buffer, at) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(at);
}
function create_buffer_uint32(data, at) {
    const out = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, out);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.vertexAttribIPointer(at, 1, gl.UNSIGNED_INT, 0, 0);
    gl.enableVertexAttribArray(at);
    return out;
}
function bind_uint32_attr(buffer, at) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribIPointer(at, 1, gl.UNSIGNED_INT, 0, 0);
    gl.enableVertexAttribArray(at);
}
function create_dyn_buffer_uint8(data, at) {
    const out = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, out);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.vertexAttribIPointer(at, 1, gl.UNSIGNED_BYTE, 0, 0);
    gl.enableVertexAttribArray(at);
    return out;
}
function bind_uint8_attr(buffer, at) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribIPointer(at, 1, gl.UNSIGNED_BYTE, 0, 0);
    gl.enableVertexAttribArray(at);
}
function create_R32UI_texture(width, height) {
    const o = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, o);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32UI, width, height, 0, gl.RED_INTEGER, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return o;
}
function create_RGBA32F_texture(size, data) {
    const o = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, o);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, size, size, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return o;
}
function create_R32F_texture(size, data) {
    const o = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, o);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, size, size, 0, gl.RED, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return o;
}
function create_RGBA_texture(size, data) {
    const o = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, o);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return o;
}
function create_vertex_array() {
    const o = gl.createVertexArray();
    gl.bindVertexArray(o);
    return o;
}
function create_frame_buffer(tex) {
    const o = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, o);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return o;
}
function create_frame_buffer2(tex0, tex1) {
    const o = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, o);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex0, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, tex1, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return o;
}
function resize_R32UI_texture(tex, width, height) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32UI, width, height, 0, gl.RED_INTEGER, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
}
function int_to_gpu(loc, x) {
    gl.uniform1i(loc, x);
}
function float_to_gpu(loc, x) {
    gl.uniform1f(loc, x);
}
function mat4x4_to_gpu(loc, x) {
    gl.uniformMatrix4fv(loc, false, x);
}
function fill_RGBAF32(arr, _with) {
    arr[0] = _with[0];
    arr[1] = _with[1];
    arr[2] = _with[2];
    arr[3] = _with[3];
    let filled = 4;
    while (filled < arr.length) {
        const chunk = Math.min(filled, arr.length - filled);
        arr.copyWithin(filled, 0, chunk);
        filled += chunk;
    }
}
const main_vert = `
#version 300 es
layout(location = 0) in vec2 pos;
layout(location = 1) in vec2 uv;
layout(location = 2) in uint hovered;

uniform mat4 u_view_proj;

out vec2 v_uv;
flat out uint v_hovered;
out vec2 v_local_pos;

void main() {
    v_local_pos = pos;
    v_uv = uv;
    v_hovered = hovered;
    gl_Position = u_view_proj * vec4(pos, 0.0, 1.0);
}`;
const main_esagonal_frag = `
#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 v_uv;
flat in uint v_hovered;
in vec2 v_local_pos;

uniform sampler2D u_dye;
uniform sampler2D u_hcolor;

out vec4 o_color;

void main() {
    vec2 p = abs(v_local_pos);
    float max_dist = max(p.x * 0.8660254 + p.y * 0.5, p.y);
    if (max_dist > 0.86235) {
        o_color = vec4(1.0, 1.0, 1.0, 1.0);
        return;
    }

    o_color = vec4(texture(u_dye, v_uv).rgb, 1.0);

    if (v_hovered == 1u) {
        vec3 hcolor = texture(u_hcolor, v_uv).rgb;

        // tint toward the stroke colour
        vec3 tinted = mix(o_color.rgb, hcolor, 0.6);

        // then keep your contrast rule, based on the tinted result
        float lum = dot(tinted, vec3(0.299, 0.587, 0.114));
        tinted = lum > 0.5 ? tinted * 0.6
                        : mix(tinted, vec3(1.0), 0.35);

        o_color = vec4(tinted, 1.0);
    }
}`;
const main_square_frag = `
#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 v_uv;
flat in uint v_hovered;
in vec2 v_local_pos;

uniform sampler2D u_dye;
uniform sampler2D u_hcolor;

out vec4 o_color;

void main() {
    vec2 p = abs(v_local_pos);
    float max_dist = max(p.x, p.y);
    if (max_dist > 0.497) { // adjust the threshold (0.5) to change the square size
        o_color = vec4(1.0, 1.0, 1.0, 1.0);
        return;
    }

    o_color = vec4(texture(u_dye, v_uv).rgb, 1.0);

    if (v_hovered == 1u) {
        vec3 hcolor = texture(u_hcolor, v_uv).rgb;

        // tint toward the stroke colour
        vec3 tinted = mix(o_color.rgb, hcolor, 0.6);

        // then keep your contrast rule, based on the tinted result
        float lum = dot(tinted, vec3(0.299, 0.587, 0.114));
        tinted = lum > 0.5 ? tinted * 0.6
                        : mix(tinted, vec3(1.0), 0.35);

        o_color = vec4(tinted, 1.0);
    }
}`;
const state_vert = `
#version 300 es
layout(location = 0) in vec2 uv;
layout(location = 1) in vec2 adj_uv1;
layout(location = 2) in vec2 adj_uv2;
layout(location = 3) in vec2 adj_uv3;

out vec2 v_uv;
out vec2 v_adj_uv1;
out vec2 v_adj_uv2;
out vec2 v_adj_uv3;

void main() {
    v_uv = uv;
    v_adj_uv1 = adj_uv1;
    v_adj_uv2 = adj_uv2;
    v_adj_uv3 = adj_uv3;

    gl_Position = vec4(v_uv * 2.0 - 1.0, 0.0, 1.0);
    gl_PointSize = 1.0;
}`;
const mask_vert = `
#version 300 es
layout(location = 0) in vec2 pos;
layout(location = 1) in uint id;

uniform mat4 u_view_proj;

flat out uint v_id;

void main() {
    v_id = id;
    gl_Position = u_view_proj * vec4(pos, 0.0, 1.0);
}`;
const mask_frag = `
#version 300 es
precision highp float;
precision highp int;

flat in uint v_id;

out uint o_color;

void main() {
    o_color = v_id;
}`;
const sym_force_and_damping = `
#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 v_uv;
in vec2 v_adj_uv1;
in vec2 v_adj_uv2;
in vec2 v_adj_uv3;

uniform sampler2D u_flux;
uniform float u_delta_time, u_gain, u_drag, u_phi_decay, u_phi_diffusion;
layout(location = 0) out vec4 o_flux;

void main() {
    bool h3 = v_adj_uv3.x > -1.0;
    vec4 f  = texture(u_flux, v_uv);
    float phi  = f.a;
    float phi1 = texture(u_flux, v_adj_uv1).a;
    float phi2 = texture(u_flux, v_adj_uv2).a;
    float phi3 = h3 ? texture(u_flux, v_adj_uv3).a : 0.0;

    vec3 nf = f.rgb + u_delta_time * u_gain *
              vec3(phi - phi1, phi - phi2, h3 ? phi - phi3 : 0.0);
    nf *= exp(-u_drag * u_delta_time);

    // diffuse φ toward the neighbor average (stable: blend factor < 1)
    float avg = (phi1 + phi2 + phi3) / (h3 ? 3.0 : 2.0);
    float nphi = mix(phi, avg, 1.0 - exp(-u_phi_diffusion * u_delta_time));
    nphi *= exp(-u_phi_decay * u_delta_time);

    o_flux = vec4(nf, nphi);
}`;
const sym_pressure_jacobi = `
#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 v_uv;
in vec2 v_adj_uv1;
in vec2 v_adj_uv2;
in vec2 v_adj_uv3;

uniform sampler2D u_flux, u_pressure;
layout(location = 0) out vec4 o_pressure;

void main() {
    bool h3 = v_adj_uv3.x > -1.0;
    vec4 f = texture(u_flux, v_uv);
    float div = f.r + f.g + (h3 ? f.b : 0.0);
    float p1 = texture(u_pressure, v_adj_uv1).r;
    float p2 = texture(u_pressure, v_adj_uv2).r;
    float p3 = h3 ? texture(u_pressure, v_adj_uv3).r : 0.0;
    o_pressure = vec4((p1 + p2 + p3 + div) / (h3 ? 3.0 : 2.0), 0.0, 0.0, 1.0);
}`;
const sym_gradient_subtract = `
#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 v_uv;
in vec2 v_adj_uv1;
in vec2 v_adj_uv2;
in vec2 v_adj_uv3;

uniform sampler2D u_flux, u_pressure;
layout(location = 0) out vec4 o_flux;

void main() {
    bool h3 = v_adj_uv3.x > -1.0;
    vec4 f = texture(u_flux, v_uv);
    float p  = texture(u_pressure, v_uv).r;
    float p1 = texture(u_pressure, v_adj_uv1).r;
    float p2 = texture(u_pressure, v_adj_uv2).r;
    float p3 = h3 ? texture(u_pressure, v_adj_uv3).r : 0.0;
    o_flux = vec4(f.r - (p - p1), f.g - (p - p2), h3 ? f.b - (p - p3) : 0.0, f.a);
}
`;
const sym_dye_advection = `
#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 v_uv;
in vec2 v_adj_uv1;
in vec2 v_adj_uv2;
in vec2 v_adj_uv3;

uniform sampler2D u_flux, u_dye, u_inject;
uniform float u_delta_time, u_dye_diffusion, u_inject_rate, u_inject_duration,
        u_inject_spread, u_inject_max;

layout(location = 0) out vec4 o_dye;
layout(location = 1) out vec4 o_inject;

void main() {
    bool h3 = v_adj_uv3.x > -1.0;
    vec4 f = texture(u_flux, v_uv);
    vec3 c  = texture(u_dye, v_uv).rgb;
    vec3 c1 = texture(u_dye, v_adj_uv1).rgb;
    vec3 c2 = texture(u_dye, v_adj_uv2).rgb;
    vec3 c3 = h3 ? texture(u_dye, v_adj_uv3).rgb : c;

    vec3 k = u_delta_time * vec3(max(-f.r, 0.0), max(-f.g, 0.0), h3 ? max(-f.b, 0.0) : 0.0);
    float s = k.x + k.y + k.z;
    if (s > 1.0) k /= s;          // CFL clamp: keeps this a convex combination

    vec3 nc = c + k.x * (c1 - c) + k.y * (c2 - c) + k.z * (c3 - c);
    vec3 avg = (c1 + c2 + (h3 ? c3 : vec3(0.0))) / (h3 ? 3.0 : 2.0);
    float a = 1.0 - exp(-u_dye_diffusion * u_delta_time);
    nc = mix(nc, avg, a);

    vec4 inj = texture(u_inject, v_uv);
    vec4 i1  = texture(u_inject, v_adj_uv1);
    vec4 i2  = texture(u_inject, v_adj_uv2);
    vec4 i3  = h3 ? texture(u_inject, v_adj_uv3) : vec4(0.0);

    // 1. spread the source: alpha-weighted color, averaged alpha
    float aw = inj.a + i1.a + i2.a + i3.a;
    vec3 scol = aw > 1e-6
        ? (inj.rgb * inj.a + i1.rgb * i1.a + i2.rgb * i2.a + i3.rgb * i3.a) / aw
        : inj.rgb;
    float aavg = (i1.a + i2.a + i3.a) / (h3 ? 3.0 : 2.0);
    float sp   = 1.0 - exp(-u_inject_spread * u_delta_time);
    float na   = mix(inj.a, aavg, sp);
    vec3  ncol = mix(inj.rgb, scol, sp);

    // 2. let the source color drift toward the local dye (frame-rate independent)
    ncol = mix(ncol, nc, 1.0 - exp(-2.0 * u_delta_time));

    // 3. eased, capped pull: weak at the edges of the source, never fully overrides
    float pull = u_inject_max * smoothstep(0.0, 1.0, na)
            * (1.0 - exp(-u_inject_rate * u_delta_time));
    nc = mix(nc, ncol, pull);

    o_inject = vec4(ncol, max(na - u_delta_time / u_inject_duration, 0.0));
    o_dye = vec4(nc, 1.0);
}
`;
const NO_DEFAULT = undefined;
const U_UPDATE = 1, U_INIT = 2;
const GL_INT = 4, GL_FLOAT = 5, GL_MAT4x4 = 6, GL_TEXTURE = 7;
const MAX_VALIDITY_WARN_COUNT = 30;
class uniform {
    constructor(name, type, flags, v, validity_check) {
        const important = name.startsWith("!"), val = important ? name.slice(1) : name;
        this.name = val;
        this.important = important;
        this.update = flags & U_UPDATE;
        this.init = flags & U_INIT;
        if (v instanceof Function)
            this.get = v;
        else
            this.default = v;
        // @ts-ignore
        this.loc = null;
        this.type = type;
        this.validity_check = validity_check;
        this.validity_warn_count = 0;
    }
    get v() {
        if (this.get !== undefined)
            return this.get();
        return this.default;
    }
}
const _warn_uniform_not_defined = {};
function warn_uniform_not_defined(from, uniform_name) {
    if (_warn_uniform_not_defined[from] === undefined) {
        _warn_uniform_not_defined[from] = {};
    }
    if (_warn_uniform_not_defined[from][uniform_name])
        return;
    _warn_uniform_not_defined[from][uniform_name] = true;
    console.warn(`uniform '${uniform_name}' is not defined in the shader.`);
}
const _warn_uniform_no_getter = {};
function warn_uniform_no_getter(from, uniform_name) {
    if (_warn_uniform_no_getter[from] === undefined) {
        _warn_uniform_no_getter[from] = {};
    }
    if (_warn_uniform_no_getter[from][uniform_name])
        return;
    _warn_uniform_no_getter[from][uniform_name] = true;
    console.warn(`uniform '${uniform_name}' has both no getter function and no default` +
        ` value for automatic gpu uniform update.`);
}
const shaders = {};
class shader_program {
    constructor(id, vert_src, frag_src, uniforms) {
        if (shaders[id] !== undefined)
            throw `shader_program: a program with id '${id}' already exists.`;
        const v = gl.createShader(gl.VERTEX_SHADER);
        if (v === null)
            throw "shader_program: failed to create vertex shader";
        gl.shaderSource(v, vert_src.trim());
        gl.compileShader(v);
        if (!gl.getShaderParameter(v, gl.COMPILE_STATUS))
            throw `Shader{${id}}: failed to compile vertex shader, reason:` +
                gl.getShaderInfoLog(v);
        const f = gl.createShader(gl.FRAGMENT_SHADER);
        if (f === null)
            throw "shader_program: failed to create fragment shader";
        gl.shaderSource(f, frag_src.trim());
        gl.compileShader(f);
        if (!gl.getShaderParameter(f, gl.COMPILE_STATUS))
            throw `Shader{${id}}: failed to compile fragment shader, reason:` +
                gl.getShaderInfoLog(f);
        const p = gl.createProgram();
        gl.attachShader(p, v);
        gl.attachShader(p, f);
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS))
            throw `Shader{${id}}: failed to create link shader program,` +
                `reason: ${gl.getProgramInfoLog(p)}`;
        gl.useProgram(p);
        this.vertex = v;
        this.fragment = f;
        this.program = p;
        const uniforms_to_update = [];
        this.uniforms_to_update = uniforms_to_update;
        this.uniforms = {};
        for (const u of uniforms) {
            const name = u.name, loc = gl.getUniformLocation(p, name);
            if (loc === null) {
                const msg = `Shader{${id},${name}}: not defined.`;
                if (!u.important) {
                    console.warn(msg);
                    continue;
                }
                else
                    throw msg;
            }
            u.loc = loc;
            this.uniforms[name] = u;
            let pass_to_GPU;
            switch (u.type) {
                case GL_INT:
                    pass_to_GPU = int_to_gpu;
                    break;
                case GL_FLOAT:
                    pass_to_GPU = float_to_gpu;
                    break;
                case GL_MAT4x4:
                    pass_to_GPU = mat4x4_to_gpu;
                    break;
                case GL_TEXTURE:
                    pass_to_GPU = int_to_gpu;
                    break;
                default:
                    throw `Shader{${id},${name}}: invalid uniform type.`;
            }
            const no_loc = loc === null, no_getter = u.default === undefined && u.get === undefined;
            if (no_loc)
                u.update_value = () => warn_uniform_not_defined(id, name);
            else if (no_getter)
                u.update_value = () => warn_uniform_no_getter(id, name);
            else if (u.validity_check instanceof Function) {
                if (u.v instanceof Function) {
                    u.update_value = () => {
                        const v = u.v;
                        // @ts-ignore
                        if (!u.validity_check(v)) {
                            console.warn(`Shader{${id},${name}}: value ${v}: failed` +
                                " validity check.");
                            if (++u.validity_warn_count === MAX_VALIDITY_WARN_COUNT)
                                u.update_value = () => pass_to_GPU(loc, u.v);
                        }
                        pass_to_GPU(loc, v);
                    };
                }
                else {
                    u.update_value = () => {
                        const v = u.v;
                        // @ts-ignore
                        if (!u.validity_check(v)) {
                            console.warn(`Shader{${id},${name}}: value` +
                                // @ts-ignore
                                typeof v === "number" ? v.toFixed(3) : v.toString() +
                                `: failed validity check.`);
                            u.update_value = () => pass_to_GPU(loc, u.v);
                        }
                        pass_to_GPU(loc, v);
                    };
                }
            }
            else // @ts-ignore
                u.update_value = () => pass_to_GPU(u.loc, u.v);
            if (u.update)
                if (no_loc || no_getter)
                    console.error(`Shader{${id},${name}}: couldn't be added to` +
                        " uniforms_to_update.");
                else
                    uniforms_to_update.push(name);
            if (u.init)
                if (no_getter)
                    console.error(`Shader{${id},${name}}: couldn't be` +
                        "initialized.");
                else
                    pass_to_GPU(loc, u.v);
        }
        shaders[id] = this;
    }
    use_program() {
        gl.useProgram(this.program);
        for (const key of this.uniforms_to_update) {
            this.uniforms[key].update_value();
        }
    }
}
class adj_node {
    constructor(id) {
        this.id = id;
        this.next = new Set();
    }
}
class EsagonalGrid {
    constructor(side_length, color = new Uint8Array([255, 255, 255, 255]), brush_size = 0) {
        if (!Number.isInteger(side_length) || side_length < 1)
            throw `EsagonalGrid: side_length must be an integer greater than 1`;
        this.side_length = side_length;
        const num_triangles = 6 * side_length ** 2;
        this.triangle_count = num_triangles;
        this.vertex_count = num_triangles * 3;
        this.adj_map = Array(num_triangles + 1);
        this.mesh = new Float32Array(num_triangles * 6);
        const _2_side = side_length * 2;
        const points = Array.from({ length: _2_side + 1 }, () => Array.from({ length: _2_side + 1 }, () => Array(2)));
        let a = 0, b = 0;
        {
            const step = 1 / side_length, sqrt_step = Math.sqrt(3) / 2 * step;
            for (let a = 0; a <= _2_side; ++a) {
                for (let b = 0; b <= _2_side; ++b) {
                    const u = b - side_length, v = a - side_length;
                    points[a][b][0] = (u - 0.5 * v) * step;
                    points[a][b][1] = v * sqrt_step;
                }
            }
        }
        /**
         * Offset to be applied to `a` and `b` during the construction of the
         *  hexagon mesh. Both parameters are used in the matrix of points that
         *  will define the mesh itself.
         *
         * Each vertex lies on the point matrix defined by
         *  [b/_2l, 0.75 + (b/2 - a) * _2l] where 0 <= a,b <= 2*side_length,
         *      and _2l = side_length.
         *
         * The hexagon is built starting from the center (depth=d=0) up to
         *  d=side_length, one side at a time.
         *
         * Each side consists of `2*d-1` triangles and, apart from `d=0`, each
         *  depth has two different triangle arrangements.
         *
         * Those arrangements are [v1,v2,v3] and [v4,v5,v6] (at zero depth the
         *  first arrangement is used).
         *
         * v1,v2,v3,v4,v5 and v6 where chosen carefully so that after
         *  constructing the last [v1,v2,v3] of the side there is no need to
         *  move the anchor point before building the next side; while, after
         *  each [v1,v2,v3] and [v4,v5,v6] pair, the anchor moves to v5.
         *
         * The following datastructure, hovewer holds the information only for
         *  [v2,v3,v5] since v1=v4=[0,0] and v2=v6.
         */
        const side_vertex_order = [
            [[1, 0], [0, -1], [1, 1]],
            [[1, 1], [1, 0], [0, 1]],
            [[0, 1], [1, 1], [-1, 0]],
            [[-1, 0], [0, 1], [-1, -1]],
            [[-1, -1], [-1, 0], [0, -1]],
            [[0, -1], [-1, -1], [1, 0]]
        ];
        /** flat vertex coordinate index. */
        let v = 0;
        /** both a and b refer to the exact center of the point matrix. */
        b = a = side_length;
        let triangle_id = 0;
        /** d=depth starting from the center of the hexagon. */
        for (let d = 0; d < side_length; ++d) {
            /** `2*d-1` is the number of triangles per side at depth d. */
            const pair_count = Math.floor((2 * d + 1) / 2), last_layer = d === side_length - 1, triangle_count = 6 * (2 * d + 1);
            /** s=current side, starting from the upper right, clock-wise. */
            for (let s = 0; s < 6; ++s) {
                const deltas = side_vertex_order[s], next_layer_adj = 2 * (3 + s + 6 * d) + 1, 
                /** f(d,s) = 2*(3+s+6*d) + 1
                 * f(d-1,s) = f(d,s) - 12 */
                prev_layer_adj = next_layer_adj - 12;
                for (let p = 0; p < pair_count; ++p) {
                    const delta_a = deltas[2][1], delta_b = deltas[2][0];
                    const v1 = points[a][b], v2 = points[a + deltas[0][1]][b + deltas[0][0]], v3 = points[a + deltas[1][1]][b + deltas[1][0]], v5 = points[a + delta_a][b + delta_b];
                    this.mesh[v] = v1[0];
                    this.mesh[v + 1] = v1[1];
                    this.mesh[v + 2] = v2[0];
                    this.mesh[v + 3] = v2[1];
                    this.mesh[v + 4] = v3[0];
                    this.mesh[v + 5] = v3[1];
                    const t1 = ++triangle_id;
                    const first_pair = s === 0 && p === 0;
                    this.adj_map[t1] = last_layer ?
                        (first_pair ?
                            [t1 + 1, t1 + triangle_count - 1] :
                            [t1 - 1, t1 + 1]) :
                        (first_pair ?
                            [t1 + 1, t1 + triangle_count - 1, t1 + next_layer_adj] :
                            [t1 - 1, t1 + 1, t1 + next_layer_adj]);
                    this.mesh[v + 6] = v1[0];
                    this.mesh[v + 7] = v1[1];
                    this.mesh[v + 8] = v5[0];
                    this.mesh[v + 9] = v5[1];
                    this.mesh[v + 10] = v2[0];
                    this.mesh[v + 11] = v2[1];
                    const t2 = ++triangle_id;
                    this.adj_map[t2] = [t2 - prev_layer_adj, t2 - 1, t2 + 1];
                    a = a + delta_a;
                    b = b + delta_b;
                    v = v + 12;
                }
                /** last triangle for the side s at depth d. */
                const v1 = points[a][b], v2 = points[a + deltas[0][1]][b + deltas[0][0]], v3 = points[a + deltas[1][1]][b + deltas[1][0]];
                this.mesh[v] = v1[0];
                this.mesh[v + 1] = v1[1];
                this.mesh[v + 2] = v2[0];
                this.mesh[v + 3] = v2[1];
                this.mesh[v + 4] = v3[0];
                this.mesh[v + 5] = v3[1];
                const t = ++triangle_id;
                this.adj_map[t] = last_layer ?
                    (s === 0 ?
                        (d === 0 ?
                            [t + 1, t + triangle_count - 1] :
                            [t - 1, t + 1]) :
                        (s !== 5 ?
                            [t - 1, t + 1] :
                            [t - triangle_count + 1, t - 1])) :
                    (s === 0 ?
                        (d === 0 ?
                            [t + 1, t + triangle_count - 1, t + next_layer_adj] :
                            [t - 1, t + 1, t + next_layer_adj]) :
                        (s !== 5 ?
                            [t - 1, t + 1, t + next_layer_adj] :
                            [t - triangle_count + 1, t - 1, t + next_layer_adj]));
                v = v + 6;
            }
            /** when last (upper left) side is done, the last access point is
             *      [a=center-d, b=center].
             * a must be decreased once to move up to the next depth level. */
            --a;
        }
        const texture_size = Math.ceil(Math.sqrt(this.vertex_count));
        this.texture_size = texture_size;
        const nt6 = num_triangles * 6, nt3 = num_triangles * 3, nt2 = num_triangles * 2;
        this.ids = new Uint32Array(nt3);
        this.uvs = new Float32Array(nt6);
        this.cell_uvs = new Float32Array(nt2);
        this.hovered = new Uint8Array(nt3);
        //this.hovered.fill(0);
        for (let i = 0; i < num_triangles; ++i) {
            const id = i + 1, base_i = i * 3, base_u = i * 6, base_uc = i * 2, col = id % texture_size, row = Math.floor(id / texture_size), u = (col + 0.5) / texture_size, v = (row + 0.5) / texture_size;
            this.cell_uvs[base_uc] = u;
            this.cell_uvs[base_uc + 1] = v;
            this.ids[base_i] = id;
            this.ids[base_i + 1] = id;
            this.ids[base_i + 2] = id;
            this.uvs[base_u] = u;
            this.uvs[base_u + 1] = v;
            this.uvs[base_u + 2] = u;
            this.uvs[base_u + 3] = v;
            this.uvs[base_u + 4] = u;
            this.uvs[base_u + 5] = v;
        }
        this.cell_adj_uvs_1 = new Float32Array(nt2);
        this.cell_adj_uvs_2 = new Float32Array(nt2);
        this.cell_adj_uvs_3 = new Float32Array(nt2);
        for (let i = 0; i < num_triangles; ++i) {
            const id = i + 1, base_i = i * 6, base_ic = i * 2, base_1 = (this.adj_map[id][0] - 1) * 6, base_2 = (this.adj_map[id][1] - 1) * 6, base_3 = this.adj_map[id][2] === undefined ?
                -1 :
                (this.adj_map[id][2] - 1) * 6;
            const u1 = this.uvs[base_1], v1 = this.uvs[base_1 + 1];
            this.cell_adj_uvs_1[base_ic] = u1;
            this.cell_adj_uvs_1[base_ic + 1] = v1;
            const u2 = this.uvs[base_2], v2 = this.uvs[base_2 + 1];
            this.cell_adj_uvs_2[base_ic] = u2;
            this.cell_adj_uvs_2[base_ic + 1] = v2;
            const u3 = base_3 === -1 ? -1.0 : this.uvs[base_3], v3 = base_3 === -1 ? -1.0 : this.uvs[base_3 + 1];
            this.cell_adj_uvs_3[base_ic] = u3;
            this.cell_adj_uvs_3[base_ic + 1] = v3;
        }
        const r_size = texture_size ** 2, rgba_size = r_size * 4;
        this.dye = new Float32Array(rgba_size);
        fill_RGBAF32(this.dye, new Float32Array([
            color[0] / 255, color[1] / 255, color[2] / 255, 1.0
        ]));
        this.hover_texture = new Uint8Array(rgba_size);
        const ht_u32view = new Uint32Array(this.hover_texture.buffer);
        ht_u32view.fill(0);
        this.hover_texture_u32view = ht_u32view;
        this.flux = new Float32Array(rgba_size);
        this.flux.fill(0.0);
        this.pressure = new Float32Array(r_size);
        this.pressure.fill(0.0);
        this.inject = new Float32Array(rgba_size);
        this.inject.fill(0.0);
        this.adj_graph = Array(num_triangles + 1);
        for (let id = 1; id < this.adj_map.length; ++id) {
            const node = new adj_node(id);
            this.adj_graph[id] = node;
            const adj_ids = this.adj_map[id];
            for (let j = 0; j < adj_ids.length; ++j) {
                const nid = adj_ids[j];
                if (nid > id)
                    break;
                const next_node = this.adj_graph[nid];
                node.next.add(next_node);
                next_node.next.add(node);
            }
            if (brush_size === 0) {
                node.brush = new Set([id]);
                continue;
            }
            const brush = new Set(adj_ids);
            let frontier = new Set(brush);
            brush.add(id);
            for (let i = 1; i < brush_size; ++i) {
                const new_frontier = new Set();
                for (const frontier_id of frontier) {
                    const next = this.adj_map[frontier_id];
                    if (next === undefined) {
                        console.warn(frontier_id);
                        continue;
                    }
                    for (const next_id of next) {
                        if (brush.has(next_id))
                            continue;
                        new_frontier.add(next_id);
                        brush.add(next_id);
                    }
                }
                frontier = new_frontier;
            }
            node.brush = brush;
        }
    }
}
class SquareGrid {
    constructor(side_length, color = new Uint8Array([255, 255, 255, 255]), brush_size = 0) {
        if (!Number.isInteger(side_length) || side_length < 1)
            throw `RectGrid: side_length must be an integer greater than 1`;
        const num_triangles = 2 * side_length ** 2;
        this.triangle_count = num_triangles;
        this.vertex_count = num_triangles * 3;
        this.adj_map = Array(num_triangles + 1);
        this.adj_graph = Array(num_triangles + 1);
        this.mesh = new Float32Array(num_triangles * 6);
        const L = side_length + 1;
        const points = Array(L);
        let uvs_x = new Map(), uvs_y = new Map();
        const write_uv = (id, tgt, off, count = 1) => {
            let u, v;
            if (id === undefined)
                u = v = -1.0;
            else if (uvs_x.has(id)) {
                u = uvs_x.get(id);
                v = uvs_y.get(id);
            }
            else {
                u = ((id % ts) + 0.5) / ts;
                v = (Math.floor(id / ts) + 0.5) / ts;
                uvs_x.set(id, u);
                uvs_y.set(id, v);
            }
            for (let i = 0; i < count; ++i, off += 2) {
                tgt[off] = u;
                tgt[off + 1] = v;
            }
        };
        const ts = Math.ceil(Math.sqrt(this.vertex_count));
        {
            const delta = 1 / side_length;
            for (let x = 0; x < L; ++x) {
                const n = x * delta;
                points[x] = -0.5 + n;
            }
        }
        const nt6 = num_triangles * 6, nt3 = num_triangles * 3, nt2 = num_triangles * 2;
        this.ids = new Uint32Array(nt3);
        this.uvs = new Float32Array(nt6);
        this.cell_uvs = new Float32Array(nt2);
        this.hovered = new Uint8Array(nt3);
        this.cell_adj_uvs_1 = new Float32Array(nt2);
        this.cell_adj_uvs_2 = new Float32Array(nt2);
        this.cell_adj_uvs_3 = new Float32Array(nt2);
        let v = 0;
        const adj_delta = 2 * side_length - 1;
        this.adj_graph = Array.from({ length: this.triangle_count }, (_, i) => i === 0 ? undefined : new adj_node(i));
        for (let x = 0; x < side_length; ++x) {
            for (let y = 1; y < side_length + 1; ++y) {
                const id1 = v / 6 + 1, id2 = id1 + 1, offset3 = (id1 - 1) * 3, offset2 = (id1 - 1) * 2;
                const x1 = points[x], x2 = points[x + 1], y1 = points[y], y2 = points[y - 1];
                this.mesh[v] = x1;
                this.mesh[v + 1] = y1;
                this.mesh[v + 2] = x2;
                this.mesh[v + 3] = y2;
                this.mesh[v + 4] = x1;
                this.mesh[v + 5] = y2;
                this.mesh[v + 6] = x1;
                this.mesh[v + 7] = y1;
                this.mesh[v + 8] = x2;
                this.mesh[v + 9] = y1;
                this.mesh[v + 10] = x2;
                this.mesh[v + 11] = y2;
                write_uv(id1, this.uvs, v, 3);
                write_uv(id2, this.uvs, v + 6, 3);
                write_uv(id1, this.cell_uvs, offset2);
                write_uv(id2, this.cell_uvs, offset2 + 2);
                this.ids[offset3] = this.ids[offset3 + 1] = this.ids[offset3 + 2] = id1;
                this.ids[offset3 + 3] = this.ids[offset3 + 4] = this.ids[offset3 + 5] = id2;
                const has_left = x > 0, has_right = x < side_length - 1, has_below = y > 1, has_above = y < side_length;
                const m1 = [];
                if (has_left)
                    m1.push(id1 - adj_delta);
                if (has_below)
                    m1.push(id1 - 1);
                m1.push(id2);
                const m2 = [id1];
                if (has_above)
                    m2.push(id2 + 1);
                if (has_right)
                    m2.push(id2 + adj_delta);
                this.adj_map[id1] = m1;
                this.adj_map[id2] = m2;
                write_uv(m1[0], this.cell_adj_uvs_1, offset2);
                write_uv(m1[1], this.cell_adj_uvs_2, offset2);
                write_uv(m1[2], this.cell_adj_uvs_3, offset2);
                write_uv(m2[0], this.cell_adj_uvs_1, offset2 + 2);
                write_uv(m2[1], this.cell_adj_uvs_2, offset2 + 2);
                write_uv(m2[2], this.cell_adj_uvs_3, offset2 + 2);
                this.adj_graph[id1] = new adj_node(id1);
                this.adj_graph[id2] = new adj_node(id2);
                for (const id of this.adj_map[id1]) {
                    this.adj_graph[id1].next.add(this.adj_graph[id]);
                    this.adj_graph[id].next.add(this.adj_graph[id1]);
                }
                for (const id of this.adj_map[id2]) {
                    this.adj_graph[id2].next.add(this.adj_graph[id]);
                    this.adj_graph[id].next.add(this.adj_graph[id2]);
                }
                v = v + 12;
            }
        }
        this.texture_size = ts;
        const r_size = ts ** 2, rgba_size = r_size * 4;
        this.hover_texture = new Uint8Array(rgba_size);
        const ht_u32view = new Uint32Array(this.hover_texture.buffer);
        ht_u32view.fill(0);
        this.hover_texture_u32view = ht_u32view;
        this.flux = new Float32Array(rgba_size);
        this.flux.fill(0.0);
        this.pressure = new Float32Array(r_size);
        this.pressure.fill(0.0);
        this.inject = new Float32Array(rgba_size);
        this.inject.fill(0.0);
        this.dye = new Float32Array(rgba_size);
        fill_RGBAF32(this.dye, new Float32Array([
            color[0] / 255, color[1] / 255, color[2] / 255, 1.0
        ]));
    }
    get_brush(id) {
        const node = this.adj_graph[id];
        if (node.brush !== undefined)
            return new Set(node.brush);
        if (brush_size === 0) {
            node.brush = new Set([id]);
        }
        else {
            const brush = new Set(this.adj_map[id]);
            let frontier = new Set(brush);
            brush.add(id);
            for (let i = 1; i < brush_size; ++i) {
                const new_frontier = new Set();
                for (const frontier_id of frontier) {
                    const next = this.adj_map[frontier_id];
                    if (next === undefined) {
                        console.warn(frontier_id);
                        continue;
                    }
                    for (const next_id of next) {
                        if (brush.has(next_id))
                            continue;
                        new_frontier.add(next_id);
                        brush.add(next_id);
                    }
                }
                frontier = new_frontier;
            }
            node.brush = brush;
        }
        return new Set(node.brush);
    }
}
/** event called on window.onresize */
function update_viewport() {
    const _width = window.innerWidth, _height = window.innerHeight;
    if (_width !== width || _height !== height) {
        canvas_rect = canvas_el.getBoundingClientRect();
        camera.units_per_pixel_x = 2 * camera.scale / canvas_rect.width;
        camera.units_per_pixel_y = 2 * camera.scale / canvas_rect.height;
        canvas_el.width = width = _width;
        canvas_el.height = height = _height;
        resize_R32UI_texture(mask_texture, width, height);
        camera.ar = width / height;
        renderer.update_view_proj_mat = true;
        renderer.force_render_mask = true;
        mouse.m1_down = false;
        keyboard.shift_down = false;
        keyboard.ctrl_down = false;
        stroke.queue = [];
        stroke.flat_queue.clear();
        mouse.last_hovered_id = -1;
    }
}
function wave_start(ids, color_data) {
    const brush = typeof ids === "number" ?
        new Set(grid.adj_graph[ids].brush) :
        new Set(ids);
    const inj_v = color_data !== undefined
        ? color_data.fcolor
        : stroke.choosen_palette[stroke.palette_color].fcolor;
    if (color_data === undefined && stroke.choosen_palette.length > 1) {
        stroke.palette_color = (stroke.palette_color + 1) % stroke.choosen_palette.length;
    }
    const flux_v = new Float32Array([0.0, 0.0, 0.0, fluid.strength]);
    let _col = Array(brush.size), _row = Array(brush.size), i = -1;
    gl.bindTexture(gl.TEXTURE_2D, inject_tex[0]);
    for (const id of brush) {
        const col = id % grid.texture_size, row = Math.floor(id / grid.texture_size);
        _col[++i] = col;
        _row[i] = row;
        if (fluid.just_drag)
            continue;
        gl.texSubImage2D(gl.TEXTURE_2D, 0, col, row, 1, 1, gl.RGBA, gl.FLOAT, inj_v);
    }
    if (!fluid.just_drag) {
        i = -1;
        gl.bindTexture(gl.TEXTURE_2D, inject_tex[1]);
        for (const id of brush) {
            gl.texSubImage2D(gl.TEXTURE_2D, 0, _col[++i], _row[i], 1, 1, gl.RGBA, gl.FLOAT, inj_v);
        }
    }
    i = -1;
    gl.bindTexture(gl.TEXTURE_2D, flux_tex[0]);
    for (const id of brush) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, _col[++i], _row[i], 1, 1, gl.RGBA, gl.FLOAT, flux_v);
    }
}
function inward_wave() {
    const from = 6 * (side_length - 2) ** 2 + 1, to = 6 * side_length ** 2, mod = 5, m = from % mod;
    const s = new Set();
    for (let i = from; i < to; ++i) {
        if (i % mod === m) {
            s.add(i);
            wave_start(s);
            s.clear();
        }
    }
    wave_start(s);
}
function fill_grid(color) {
    const clear_color = color === undefined ?
        get_color_data(grid_bg) :
        color;
    const n = grid.texture_size, flat_n = n * n;
    fill_RGBAF32(grid.dye, clear_color.fcolor);
    //grid.pressure.fill(0.0);
    grid.inject.fill(0.0);
    grid.flux.fill(0.0);
    gl.bindTexture(gl.TEXTURE_2D, inject_tex[0]);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, n, n, gl.RGBA, gl.FLOAT, grid.inject);
    gl.bindTexture(gl.TEXTURE_2D, inject_tex[1]);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, n, n, gl.RGBA, gl.FLOAT, grid.inject);
    gl.bindTexture(gl.TEXTURE_2D, dye_tex[0]);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, n, n, gl.RGBA, gl.FLOAT, grid.dye);
    gl.bindTexture(gl.TEXTURE_2D, dye_tex[1]);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, n, n, gl.RGBA, gl.FLOAT, grid.dye);
    gl.bindTexture(gl.TEXTURE_2D, flux_tex[0]);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, n, n, gl.RGBA, gl.FLOAT, grid.flux);
    gl.bindTexture(gl.TEXTURE_2D, pressure_tex[pressure_read]);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, n, n, gl.RED, gl.FLOAT, grid.pressure);
}
const stroke = {
    /** this set is used to both apply and remove the highlight color effect. */
    flat_queue: new Set(),
    /** this array encodes the individual queued strokes with their respective
     * color. */
    queue: [],
    /** default value set to -1, since this variable gets incremented by one
     * each time a new queued stroke is done (this also applied to the first
     * one). */
    count: -1,
    choosen_palette: [],
    /** index of the color used from the current choosen palette of colors. */
    palette_color: 0,
};
function process_stroke(hovered) {
    if (hovered === 0 || hovered === mouse.last_hovered_id)
        return;
    if (keyboard.shift_down) {
        const brush = grid.get_brush(hovered);
        // @ts-ignore
        const newly_hovered = brush.difference(stroke.flat_queue);
        if (newly_hovered.size === 0)
            return;
        const current_color_packed = stroke.queue[stroke.count].color_data.packed;
        const v = new Uint8Array([1, 1, 1]);
        gl.bindBuffer(gl.ARRAY_BUFFER, hovered_buffer);
        for (const id of newly_hovered) {
            stroke.queue[stroke.count].stroke.add(id);
            stroke.flat_queue.add(id);
            const byte_offset = id * 3 - 1;
            gl.bufferSubData(gl.ARRAY_BUFFER, byte_offset, v);
            grid.hover_texture_u32view[id] = current_color_packed;
        }
        renderer.hover_texture_is_dirty = true;
    }
    else if (keyboard.ctrl_down) {
        fill_grid(stroke.choosen_palette[stroke.palette_color]);
    }
    else {
        wave_start(grid.get_brush(hovered));
    }
    mouse.last_hovered_id = hovered;
}
function remove_highlights() {
    const v = new Uint8Array([0, 0, 0]);
    gl.bindBuffer(gl.ARRAY_BUFFER, hovered_buffer);
    for (const id of stroke.flat_queue) {
        const byte_offset = id * 3 - 1;
        gl.bufferSubData(gl.ARRAY_BUFFER, byte_offset, v);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    stroke.flat_queue.clear();
}
function process_queued_strokes() {
    if (stroke.flat_queue.size === 0)
        return;
    remove_highlights();
    const mod = 3, s = new Set();
    for (let i = 0; i < stroke.queue.length; ++i) {
        const q = stroke.queue[i];
        const first = q.stroke.entries().next();
        if (first.done === true)
            continue;
        const m = first.value[0] % mod;
        for (const id of q.stroke) {
            s.add(id);
            if (id % mod === m) {
                wave_start(s, q.color_data);
                s.clear();
            }
        }
        if (s.size > 0) {
            wave_start(s, q.color_data);
            s.clear();
        }
    }
    stroke.queue = [];
    stroke.count = -1;
}
const renderer = {
    /** buffer used to read from the vertex mask texture. */
    id_mask_data: new Uint32Array(1),
    update_view_proj_mat: false,
    /** this is set to true on window.onresize; forces to recalculate the vertex
     * mask texture during the draw pass. */
    force_render_mask: true,
    hover_texture_is_dirty: false,
    /** when true, considering both mouse and keyboard state, an action is
     * performed (i.e. a verte is clicked or hovered, the grid is filled or
     * cleared); can be set to true only once per frame. */
    request_mouse_sample: false,
    /** when true, the grid vertex color lut table will get cleared with grid_bg
     * color (initial grid color). */
    request_color_clear: false,
    /** current frame id. */
    frame: 0,
    /** used to calculate delta_time. */
    prev_timestamp: 0,
    delta_time: 0,
    window_hidden: false,
    dt_getter: () => renderer.delta_time
};
function draw(timestamp) {
    const n = grid.texture_size, triangle_count = grid.triangle_count;
    renderer.delta_time = (timestamp - renderer.prev_timestamp) * 0.001;
    renderer.prev_timestamp = timestamp;
    if (renderer.window_hidden) {
        requestAnimationFrame(draw);
        return;
    }
    ++renderer.frame;
    esc_button_el.textContent = `${(1 / renderer.delta_time).toFixed(1)} fps`;
    mouse.wheel_already_processed = false;
    if (renderer.update_view_proj_mat)
        view_proj_mat =
            create_view_projection_matrix(camera.x, camera.y, camera.scale, camera.ar);
    if (renderer.request_color_clear) {
        fill_grid();
        renderer.request_color_clear = false;
    }
    // poll previous mouse inputs
    for (let i = 0; i < pbo_count; i++) {
        const sync = syncs[i];
        if (sync) {
            const status = gl.clientWaitSync(sync, 0, 0), pixel_data = renderer.id_mask_data;
            if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) {
                gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbos[i]);
                gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixel_data);
                process_stroke(pixel_data[0]);
                gl.deleteSync(sync);
                syncs[i] = null;
            }
        }
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    if (renderer.force_render_mask || renderer.request_mouse_sample) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, mask_fbo);
        if (renderer.force_render_mask) {
            mask_p.use_program();
            gl.bindVertexArray(mask_vao);
            gl.viewport(0, 0, width, height);
            gl.clearBufferuiv(gl.COLOR, 0, new Uint32Array([0, 0, 0, 0]));
            mask_p.uniforms["u_view_proj"].update_value();
            gl.drawArrays(gl.TRIANGLES, 0, vertex_count);
            renderer.force_render_mask = false;
        }
        if (renderer.request_mouse_sample) { //&&
            //gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
            gl.readBuffer(gl.COLOR_ATTACHMENT0);
            // orphan the buffer before writing to prevent webgl warnings
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbos[pbo_write_index]);
            gl.bufferData(gl.PIXEL_PACK_BUFFER, 4, gl.STREAM_READ);
            gl.readPixels(mouse.x, mouse.y, 1, 1, gl.RED_INTEGER, gl.UNSIGNED_INT, 0);
            if (syncs[pbo_write_index])
                gl.deleteSync(syncs[pbo_write_index]);
            syncs[pbo_write_index] =
                gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
            pbo_write_index = (pbo_write_index + 1) % pbo_count;
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
            renderer.request_mouse_sample = false;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    //////////////////////////////////
    //       STATE PROPAGATION      //
    //////////////////////////////////
    const no_iterations = fluid.jacobi_iterations === 0;
    gl.viewport(0, 0, n, n);
    //gl.disable(gl.BLEND);
    gl.bindVertexArray(sym_vao);
    // first step
    force_and_damping_p.use_program();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, flux_tex[no_iterations ? flux_read : 0]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, flux_fbo[no_iterations ? 1 - flux_read : 1]);
    gl.drawArrays(gl.POINTS, 0, triangle_count);
    flux_read = 1 - flux_read;
    // second step
    if (!no_iterations) {
        pressure_jacobi_p.use_program();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, flux_tex[1]);
        for (let i = 0; i < fluid.jacobi_iterations; ++i) {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, pressure_tex[pressure_read]);
            gl.bindFramebuffer(gl.FRAMEBUFFER, pressure_fbo[1 - pressure_read]);
            gl.drawArrays(gl.POINTS, 0, triangle_count);
            pressure_read = 1 - pressure_read;
        }
        // third step
        gradient_subtract_p.use_program();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, flux_tex[1]);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, pressure_tex[pressure_read]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, flux_fbo[0]);
        gl.drawArrays(gl.POINTS, 0, triangle_count);
    }
    // fourth step
    dye_advection_p.use_program();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, flux_tex[no_iterations ? flux_read : 0]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, dye_tex[dye_read]);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, inject_tex[dye_read]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dye_fbo[1 - dye_read]);
    gl.drawArrays(gl.POINTS, 0, triangle_count);
    dye_read = 1 - dye_read;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    //////////////////////////////////
    //         MAIN SHADER          //
    //////////////////////////////////
    gl.bindVertexArray(vao);
    p.use_program();
    if (renderer.update_view_proj_mat) {
        p.uniforms["u_view_proj"].update_value();
        renderer.update_view_proj_mat = false;
    }
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dye_tex[dye_read]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, hover_texture);
    if (renderer.hover_texture_is_dirty) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, grid.hover_texture);
        renderer.hover_texture_is_dirty = false;
    }
    gl.bindTexture(gl.TEXTURE_2D, hover_texture);
    gl.enable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, vertex_count);
    requestAnimationFrame(draw);
}
let gl, 
/** grid shader program. */
p, 
/** grid vertex mask shader program. */
mask_p, force_and_damping_p, pressure_jacobi_p, gradient_subtract_p, dye_advection_p, grid, mask_texture, mask_fbo, state_fbo0, state_fbo1, 
/** camera (orthographic) projection matrix. */
view_proj_mat, 
/** window.innerWidth */
width, 
/** window.innerHeight */
height, 
/** grid vertex array object. */
vao, hover_texture, 
/** mask grid vertex array object. */
mask_vao, 
/** fluid symulation */
sym_vao, flux_tex, flux_fbo, pressure_tex, pressure_fbo, dye_tex, dye_fbo, inject_tex, flux_read, pressure_read, dye_read, hovered_buffer, 
/** grid.vertex_count */
vertex_count, 
/** used to asynchronously read from gpu without cpu stalls. */
pbos = [], syncs = [], pbo_count = 3, pbo_write_index = 0;
/** canvas DOM element (#screen). */
let canvas_el, 
/** color picker DOM element (#color-picker). */
color_picker_el, 
/** info curtain DOM element (#menu) */
menu_el, 
/** esc button DOM element (#esc-button). */
esc_button_el, 
/** updated in update_viewport */
canvas_rect;
const camera = {
    x: 0,
    y: 0,
    scale: 0.6,
    /** inner window aspect ratio. */
    ar: 0,
    min_coord: -0.5,
    max_coord: 0.5,
    min_scale: 0.0005,
    max_scale: 2,
    /** used for mouse movement scaling to properly move the camera,
     * recalculated both in update_viewport and in w_wheel */
    units_per_pixel_x: 0,
    units_per_pixel_y: 0
};
/** event called by window.onload */
function init() {
    canvas_el = document.getElementById("screen");
    if (!(canvas_el instanceof HTMLCanvasElement))
        throw "Colorful.js: couldn't find 'canvas#screen' element.";
    color_picker_el = document.getElementById("color-picker");
    if (color_picker_el === null)
        throw "Colorful.js: couldn't find '#color-picker' element.";
    menu_el = document.getElementById("menu");
    if (menu_el === null)
        throw "Colorful.js: couldn't find '#menu' element.";
    esc_button_el = document.getElementById("esc-button");
    if (esc_button_el === null)
        throw "Colorful.js: couldn't find '#esc-button' element.";
    esc_button_el.onclick = dom_toggle_menu;
    gl = canvas_el.getContext("webgl2");
    const ext1 = gl.getExtension("EXT_color_buffer_float"), ext2 = gl.getExtension("EXT_float_blend");
    if (!ext1)
        throw "EXT_color_buffer_float is not supported on this hardware";
    else if (!ext2)
        throw "EXT_float_blean is not supported on this hardware";
    dom_update_color_picker();
    //////////////////////////////////
    //         MAIN SHADER          //
    //////////////////////////////////
    canvas_rect = canvas_el.getBoundingClientRect();
    camera.units_per_pixel_x = 2 * camera.scale / canvas_rect.width;
    camera.units_per_pixel_y = 2 * camera.scale / canvas_rect.height;
    width = window.innerWidth;
    height = window.innerHeight;
    camera.ar = width / height;
    view_proj_mat =
        create_view_projection_matrix(camera.x, camera.y, camera.scale, camera.ar);
    canvas_el.width = width;
    canvas_el.height = height;
    p = new shader_program("main", main_vert, main_square_frag, [
        new uniform("u_view_proj", GL_MAT4x4, U_INIT, () => view_proj_mat),
        new uniform("u_dye", GL_TEXTURE, U_INIT, 0),
        new uniform("u_hcolor", GL_TEXTURE, U_INIT, 1)
    ]);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    grid = new SquareGrid(side_length, grid_bg, brush_size);
    const texture_size = grid.texture_size;
    vertex_count = grid.vertex_count;
    //////////////////////////////////
    //       MAIN SHADER            //
    //////////////////////////////////
    vao = create_vertex_array();
    const pos_buffer = create_buffer_vec2(grid.mesh, 0);
    create_buffer_vec2(grid.uvs, 1);
    hovered_buffer = create_dyn_buffer_uint8(grid.hovered, 2);
    hover_texture = create_RGBA_texture(texture_size, grid.hover_texture);
    //////////////////////////////////
    //       MASK SHADER            //
    //////////////////////////////////
    mask_p = new shader_program("mask", mask_vert, mask_frag, [
        new uniform("u_view_proj", GL_MAT4x4, 0, () => view_proj_mat),
    ]);
    mask_vao = create_vertex_array();
    bind_vec2_attr(pos_buffer, 0);
    create_buffer_uint32(grid.ids, 1);
    mask_texture = create_R32UI_texture(width, height);
    mask_fbo = create_frame_buffer(mask_texture);
    //////////////////////////////////
    //   FORCE AND DAMPING SHADER   //
    //////////////////////////////////
    force_and_damping_p = new shader_program("force_and_damping", state_vert, sym_force_and_damping, [
        new uniform("u_flux", GL_TEXTURE, U_INIT, 0),
        new uniform("u_delta_time", GL_FLOAT, U_UPDATE | U_INIT, renderer.dt_getter),
        new uniform("u_gain", GL_FLOAT, U_UPDATE | U_INIT, () => fluid.gain),
        new uniform("u_drag", GL_FLOAT, U_UPDATE | U_INIT, () => fluid.drag),
        new uniform("u_phi_decay", GL_FLOAT, U_UPDATE | U_INIT, () => fluid.phi_decay),
        new uniform("u_phi_diffusion", GL_FLOAT, U_UPDATE | U_INIT, () => fluid.phi_diffusion)
    ]);
    sym_vao = create_vertex_array();
    create_buffer_vec2(grid.cell_uvs, 0),
        create_buffer_vec2(grid.cell_adj_uvs_1, 1),
        create_buffer_vec2(grid.cell_adj_uvs_2, 2),
        create_buffer_vec2(grid.cell_adj_uvs_3, 3);
    //////////////////////////////////
    //     PRESSURE JACOBI SHADER   //
    //////////////////////////////////
    pressure_jacobi_p = new shader_program("pressure_jacobi", state_vert, sym_pressure_jacobi, [
        new uniform("u_flux", GL_TEXTURE, U_INIT, 0),
        new uniform("u_pressure", GL_TEXTURE, U_INIT, 1)
    ]);
    //////////////////////////////////
    //   GRADIENT SUBTRACT SHADER   //
    //////////////////////////////////
    gradient_subtract_p = new shader_program("gradient_subtract", state_vert, sym_gradient_subtract, [
        new uniform("u_flux", GL_TEXTURE, U_INIT, 0),
        new uniform("u_pressure", GL_TEXTURE, U_INIT, 1)
    ]);
    //////////////////////////////////
    //     DYE ADVECTION SHADER     //
    //////////////////////////////////
    dye_advection_p = new shader_program("dye_advection", state_vert, sym_dye_advection, [
        new uniform("u_flux", GL_TEXTURE, U_INIT, 0),
        new uniform("u_dye", GL_TEXTURE, U_INIT, 1),
        new uniform("u_inject", GL_TEXTURE, U_INIT, 2),
        new uniform("u_delta_time", GL_FLOAT, U_UPDATE | U_INIT, renderer.dt_getter),
        new uniform("u_dye_diffusion", GL_FLOAT, U_UPDATE | U_INIT, () => fluid.dye_diffusion),
        new uniform("u_inject_rate", GL_FLOAT, U_UPDATE | U_INIT, () => fluid.inject_rate),
        new uniform("u_inject_duration", GL_FLOAT, U_UPDATE | U_INIT, () => fluid.inject_duration),
        new uniform("u_inject_spread", GL_FLOAT, U_UPDATE | U_INIT, () => fluid.inject_spread),
        new uniform("u_inject_max", GL_FLOAT, U_UPDATE | U_INIT, () => fluid.inject_max),
    ]);
    //////////////////////////////////
    //       SYM TEXTURE SETUP      //
    //////////////////////////////////
    const flux_0 = create_RGBA32F_texture(texture_size, grid.flux), flux_1 = create_RGBA32F_texture(texture_size, null), press_0 = create_R32F_texture(texture_size, grid.pressure), press_1 = create_R32F_texture(texture_size, null), dye_0 = create_RGBA32F_texture(texture_size, grid.dye), dye_1 = create_RGBA32F_texture(texture_size, null), inject_0 = create_RGBA32F_texture(texture_size, grid.inject), inject_1 = create_RGBA32F_texture(texture_size, null), flux_fbo_0 = create_frame_buffer(flux_0), flux_fbo_1 = create_frame_buffer(flux_1), press_fbo_0 = create_frame_buffer(press_0), press_fbo_1 = create_frame_buffer(press_1), dye_fbo_0 = create_frame_buffer2(dye_0, inject_0), dye_fbo_1 = create_frame_buffer2(dye_1, inject_1);
    flux_tex = [flux_0, flux_1];
    flux_fbo = [flux_fbo_0, flux_fbo_1];
    pressure_tex = [press_0, press_1];
    pressure_fbo = [press_fbo_0, press_fbo_1];
    dye_tex = [dye_0, dye_1];
    inject_tex = [inject_0, inject_1];
    dye_fbo = [dye_fbo_0, dye_fbo_1];
    flux_read = 0;
    pressure_read = 0;
    dye_read = 0;
    //////////////////////////////////
    //       MASK SHADER PBOS       //
    //////////////////////////////////
    for (let i = 0; i < pbo_count; ++i) {
        const pbo = gl.createBuffer();
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
        gl.bufferData(gl.PIXEL_PACK_BUFFER, 4, gl.STREAM_READ);
        pbos.push(pbo);
        syncs.push(null);
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    canvas_el.onmouseleave = c_mouseleave;
    canvas_el.onmousedown = c_mousedown;
    window.onmousemove = w_mousemove;
    color_picker_el.onmousemove = w_mousemove;
    window.onmouseup = w_mouseup;
    canvas_el.oncontextmenu = (e) => {
        e.preventDefault();
    };
    draw(0);
}
const keyboard = {
    /** set to true when the shift button is pressed. */
    shift_down: false,
    /** set to true only when the ctrl button is pressed and shift is not. */
    ctrl_down: false
};
/** event called on window.onkeydown */
function w_keydown(e) {
    if (e.key === "Shift") {
        keyboard.shift_down = true;
        stroke.count = -1;
        stroke.palette_color = 0;
    }
    else if (e.key === "Control" && !mouse.m1_down)
        keyboard.ctrl_down = true;
}
/** event called on window.onkeyup */
function w_keyup(e) {
    if (e.key === "Shift") {
        keyboard.shift_down = false;
        process_queued_strokes();
    }
    else if (e.key === "Control")
        keyboard.ctrl_down = false;
    else if (e.key === "p")
        inward_wave();
    else if (e.key === "c")
        renderer.request_color_clear = true;
    else if (e.key === "Escape")
        dom_toggle_menu();
}
window.onkeydown = w_keydown;
window.onkeyup = w_keyup;
const mouse = {
    /** current frame's sampled mouse x position relative to the canvas. */
    x: -1,
    /** current frame's sampled mouse y position relative to the canvas. */
    y: -1,
    /** value set to true whenever the mouse's left button is pressed. */
    m1_down: false,
    /** value set to true only when mouse1_down is not true and the mouse's
      * wheel button is pressed. */
    m3_down: false,
    /** both values used for moving the camera when pressing mouse3. */
    prev_clientX: -1,
    prev_clientY: -1,
    /** value used to prevent checking multiple times, on the same frame, which
     * the mouse position and its related events. */
    last_sample_frame: -1,
    wheel_already_processed: false,
    wheel_zoom_factor: 8,
    trackpad_zoom_factor: 2,
    /** last hovered vertex id, used to prevent the same vertex from being
     * processed multiple times */
    last_hovered_id: -1
};
let prev_jacobi;
/** event called on canvas.onmouseleave */
function c_mouseleave() {
    mouse.last_hovered_id = -1;
}
/** event called on canvas.onmousedown */
function c_mousedown(e) {
    const frame = renderer.frame;
    if (e.button === 2 || mouse.last_sample_frame === frame)
        return;
    if (e.button === 0) {
        mouse.m1_down = true;
        mouse.m3_down = false;
        prev_jacobi = fluid.jacobi_iterations;
        if (fluid.pause_jacobi_while_draggin)
            fluid.jacobi_iterations = 0;
        if (keyboard.shift_down) {
            /* change stroke color only if there were at least one new valid
            * non hovered vertex. */
            stroke.queue[++stroke.count] = {
                stroke: new Set(),
                color_data: stroke.choosen_palette[stroke.palette_color]
            };
            if (stroke.choosen_palette.length > 1) {
                stroke.palette_color = (stroke.palette_color + 1) % stroke.choosen_palette.length;
            }
        }
    }
    else if (!mouse.m1_down && e.button === 1) {
        mouse.prev_clientX = e.clientX;
        mouse.prev_clientY = e.clientY;
        mouse.m3_down = true;
        mouse.last_sample_frame = frame;
        return;
    }
    else {
        return;
    }
    if (renderer.force_render_mask)
        return;
    mouse.x =
        Math.floor((e.clientX - canvas_rect.left) * width / canvas_rect.width);
    mouse.y =
        Math.floor((canvas_rect.bottom - e.clientY) * height / canvas_rect.height);
    renderer.request_mouse_sample = true;
    mouse.last_sample_frame = frame;
}
/** event called on window.onmousemove */
function w_mousemove(e) {
    if ((!mouse.m1_down && !mouse.m3_down) || renderer.force_render_mask
        || mouse.last_sample_frame === renderer.frame)
        return;
    const clientX = e.clientX, clientY = e.clientY;
    mouse.x =
        Math.floor((clientX - canvas_rect.left) * width / canvas_rect.width);
    mouse.y =
        Math.floor((canvas_rect.bottom - clientY) * height / canvas_rect.height);
    if (mouse.m3_down) {
        camera.x -= (clientX - mouse.prev_clientX) * camera.units_per_pixel_x;
        camera.y += (clientY - mouse.prev_clientY) * camera.units_per_pixel_y;
        camera.x =
            Math.max(Math.min(camera.x, camera.max_coord), camera.min_coord);
        camera.y =
            Math.max(Math.min(camera.y, camera.max_coord), camera.min_coord);
        mouse.prev_clientX = clientX;
        mouse.prev_clientY = clientY;
        renderer.update_view_proj_mat = true;
        renderer.force_render_mask = true;
    }
    else {
        renderer.request_mouse_sample = true;
        mouse.last_sample_frame = renderer.frame;
    }
}
/** event called on window.onmouseup */
function w_mouseup(e) {
    if (e.button === 2) {
        e.preventDefault();
        return;
    }
    if (e.button === 1) {
        // @ts-ignore
        prev_clientX = prev_clientY = undefined;
        mouse.m3_down = false;
    }
    if (e.button !== 0)
        return;
    fluid.jacobi_iterations = prev_jacobi;
    mouse.m1_down = false;
    mouse.last_hovered_id = -1;
    mouse_down_on_color = false;
}
function event_triggered_by_trackpad(e) {
    if (e.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) {
        return false;
    }
    else {
        const has_frac = !Number.isInteger(e.deltaY) || !Number.isInteger(e.deltaX);
        const small_delta = Math.abs(e.deltaY) < 50 && Math.abs(e.deltaX) < 50;
        return has_frac || small_delta;
    }
}
/** event called on canvas.onwheel */
function w_wheel(e) {
    if (e.ctrlKey) {
        e.preventDefault();
        return;
    }
    if (mouse.wheel_already_processed)
        return;
    mouse.wheel_already_processed = true;
    const factor = event_triggered_by_trackpad(e)
        ? mouse.trackpad_zoom_factor * renderer.delta_time
        : mouse.wheel_zoom_factor * renderer.delta_time;
    camera.scale += e.deltaY < 0 ? factor : -factor;
    camera.scale =
        Math.min(Math.max(camera.scale, camera.min_scale), camera.max_scale);
    camera.units_per_pixel_x = 2 * camera.scale / canvas_rect.width;
    camera.units_per_pixel_y = 2 * camera.scale / canvas_rect.height;
    renderer.update_view_proj_mat = true;
    renderer.force_render_mask = true;
}
/** event called on window.onmouseleave and on window.onblur */
function state_cleanup() {
    mouse.m1_down = false;
    mouse.m3_down = false;
    keyboard.shift_down = false;
    keyboard.ctrl_down = false;
    mouse.last_hovered_id = -1;
    remove_highlights();
    stroke.queue = [];
    stroke.count = -1;
}
function d_visibilitychange() {
    renderer.window_hidden = document.hidden;
}
window.onresize = update_viewport;
window.onblur = state_cleanup;
document.onvisibilitychange = d_visibilitychange;
// window.onmouseleave = state_cleanup;
window.addEventListener("wheel", w_wheel, { passive: false });
window.onload = init;
// mix colors in different color space
// add esc menu sliders
