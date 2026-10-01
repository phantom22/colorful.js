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
const gpu = Math.floor(searchParams.getNumber("gpu", 1, 0, 1)), side_length = searchParams.getNumber("side_length", gpu ? 64 : 32, 1), brush_size = Math.floor(searchParams.getNumber("brush_size", gpu ? 5 : 1, 0)), blend_value = searchParams.getNumber("blend_value", gpu ? 0.6 : 0.008, 0, 1), decay_min_radius = searchParams.getNumber("decay_min_radius", -2), wave_decay = searchParams.getNumber("wave_decay", gpu ? 0.999 : 0.9, 0, 1), grid_bg = searchParams.getUint8Color("grid_bg"), wave_delay = searchParams.getNumber("wave_delay", 30, 1), 
// cpu-side specific
new_wave_delay = searchParams.getNumber("new_wave_delay", 500, 1), new_wave_p = searchParams.getNumber("new_wave_p", 0.0002, 0, 1), new_color_p = searchParams.getNumber("new_color_p", 0.1, 0, 1), new_color_compl_p = searchParams.getNumber("new_color_compl_p", 0.5, 0, 1), 
// gpu-side specific
max_weight = 3.0;
let state_rate = searchParams.getNumber("wave_delay_ms", 60, 1), weight_decay = searchParams.getNumber("color_decay_ms", 600, 1), diffusion_rate = searchParams.getNumber("color_diffusion_ms", 10, 1);
function rate_from_ms(wave_delay_ms, convergence_fraction = 0.95) {
    const t_seconds = wave_delay_ms * 0.001;
    return -Math.log(1 - convergence_fraction) / t_seconds;
}
function ms_from_rate(rate, convergence_fraction = 0.95) {
    return (-Math.log(1 - convergence_fraction) / rate) * 1000;
}
function not_saturated(target_ms, threshold = 1.0) {
    return (renderer.delta_time * 1000 / target_ms) < threshold;
}
{
    let params;
    if (gpu) {
        params = new URLSearchParams([
            ["gpu", `${gpu}`],
            ["side_length", `${side_length}`],
            ["brush_size", `${brush_size}`],
            ["wave_delay_ms", `${state_rate}`],
            ["color_decay_ms", `${weight_decay}`],
            ["color_diffusion_ms", `${diffusion_rate}`]
        ]);
    }
    else {
        params = new URLSearchParams([
            ["gpu", `${gpu}`],
            ["side_length", `${side_length}`],
            ["brush_size", `${brush_size}`],
            ["blend_value", `${blend_value}`],
            ["wave_delay", `${wave_delay}`],
            ["wave_decay", `${wave_decay}`],
            ["decay_min_radius", `${decay_min_radius}`],
            ["new_wave_delay", `${new_wave_delay}`],
            ["new_wave_p", `${new_wave_p}`],
            ["new_color_p", `${new_color_p}`],
            ["new_color_compl_p", `${new_color_compl_p}`]
        ]);
    }
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
const gpu_vert = `
#version 300 es
layout(location = 0) in vec2 pos;
layout(location = 1) in uint id;
layout(location = 2) in vec2 uv;
layout(location = 3) in vec2 adj_uv1;
layout(location = 4) in vec2 adj_uv2;
layout(location = 5) in vec2 adj_uv3;
layout(location = 6) in uint hovered;

uniform mat4 u_view_proj;

flat out uint v_id;
out vec2 v_uv;
out vec2 v_adj_uv1;
out vec2 v_adj_uv2;
out vec2 v_adj_uv3;
flat out uint v_hovered;
out vec2 v_local_pos;

void main() {
    v_local_pos = pos;
    v_id = id;
    v_uv = uv;
    v_adj_uv1 = adj_uv1;
    v_adj_uv2 = adj_uv2;
    v_adj_uv3 = adj_uv3;
    v_hovered = hovered;
    gl_Position = u_view_proj * vec4(pos, 0.0, 1.0);
}`;
const gpu_frag = `
#version 300 es
precision highp float;
precision highp sampler2D;

flat in uint v_id;
in vec2 v_uv;
in vec2 v_adj_uv1;
in vec2 v_adj_uv2;
in vec2 v_adj_uv3;
flat in uint v_hovered;
in vec2 v_local_pos;

uniform sampler2D u_texture;
uniform sampler2D u_state_weights;
uniform sampler2D u_wcolor_dist;
uniform sampler2D u_hcolor;

uniform float u_blend_value;
uniform float u_wave_decay;
uniform float u_decay_min_radius;

out vec4 o_color;

void main() {
    vec2 p = abs(v_local_pos);
    float max_dist = max(p.x * 0.8660254 + p.y * 0.5, p.y);
    if (max_dist > 0.86235) {
        o_color = vec4(1.0, 1.0, 1.0, 1.0);
        return;
    }

    vec3 original_color = texture(u_texture, v_uv).rgb;
    float state = texture(u_state_weights, v_uv).r;

    vec4 wcolor_dist = texture(u_wcolor_dist, v_uv);
    vec3 wave_color = wcolor_dist.rgb;
    
    // float distance = wcolor_dist.a;
    // float decay_factor = u_blend_value * pow(u_wave_decay, max(distance - u_decay_min_radius - 1.0, 0.0));
    // decay_factor = clamp(decay_factor, 0.0, 1.0);

    float factor = smoothstep(0.0, 0.15, state);
    o_color = vec4(mix(original_color, wave_color, factor), 1.0);

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
const cpu_vert = `
#version 300 es
layout(location = 0) in vec2 pos;
layout(location = 1) in uint id;
layout(location = 2) in vec2 uv;

uniform mat4 u_view_proj;

flat out uint v_id;
out vec2 v_uv;
out vec2 v_local_pos;

void main() {
    v_local_pos = pos;
    v_id = id;
    v_uv = uv;
    gl_Position = u_view_proj * vec4(pos, 0.0, 1.0);
}`;
const cpu_frag = `
#version 300 es
precision highp float;
precision highp sampler2D;

flat in uint v_id;
in vec2 v_uv;
in vec2 v_local_pos;

uniform sampler2D u_texture;

out vec4 o_color;

void main() {
    vec2 p = abs(v_local_pos);
    float max_dist = max(p.x * 0.8660254 + p.y * 0.5, p.y);

    if (max_dist > 0.86235) {
        o_color = vec4(1.0, 1.0, 1.0, 1.0);
    }
    else {  
        o_color = texture(u_texture, v_uv);
    }
}`;
const state_vert = `
#version 300 es
layout(location = 0) in uint id;
layout(location = 1) in vec2 uv;
layout(location = 2) in vec2 adj_uv1;
layout(location = 3) in vec2 adj_uv2;
layout(location = 4) in vec2 adj_uv3;

flat out uint v_id;
out vec2 v_uv;
out vec2 v_adj_uv1;
out vec2 v_adj_uv2;
out vec2 v_adj_uv3;

void main() {
    v_id = id;
    v_uv = uv;
    v_adj_uv1 = adj_uv1;
    v_adj_uv2 = adj_uv2;
    v_adj_uv3 = adj_uv3;

    gl_Position = vec4(v_uv * 2.0 - 1.0, 0.0, 1.0);
    gl_PointSize = 1.0;
}`;
const state_frag = `
#version 300 es
precision highp float;
precision highp sampler2D;

flat in uint v_id;
in vec2 v_uv;
in vec2 v_adj_uv1;
in vec2 v_adj_uv2;
in vec2 v_adj_uv3;

uniform sampler2D u_state_weights;
uniform sampler2D u_wcolor_dist;

const float MAX_WEIGHT = ${max_weight.toFixed(1)};

uniform highp float u_delta_time;
uniform highp float u_state_rate;
uniform highp float u_weight_decay;
uniform highp float u_diffusion_rate;

layout(location = 0) out highp vec4 o_state_weights;
layout(location = 1) out highp vec4 o_wcolor_dist;

void main() {
    bool has_third = v_adj_uv3.x > -1.0;

    float this_state  = texture(u_state_weights, v_uv).r;
    float this_weight = texture(u_state_weights, v_uv).g;

    float s1 = texture(u_state_weights, v_adj_uv1).r;
    float s2 = texture(u_state_weights, v_adj_uv2).r;
    float s3 = has_third ? texture(u_state_weights, v_adj_uv3).r : 0.0;

    float nw1 = texture(u_state_weights, v_adj_uv1).g;
    float nw2 = texture(u_state_weights, v_adj_uv2).g;
    float nw3 = has_third ? texture(u_state_weights, v_adj_uv3).g : 0.0;

    float a1 = max(s1 - this_state, 0.0);
    float a2 = max(s2 - this_state, 0.0);
    float a3 = has_third ? max(s3 - this_state, 0.0) : 0.0;
    float total = a1 + a2 + a3;

    float w1, w2, w3;
    if (total > 0.0) {
        w1 = a1 / total; w2 = a2 / total; w3 = a3 / total;
    } else {
        float n = has_third ? 3.0 : 2.0;
        w1 = 1.0 / n; w2 = 1.0 / n; w3 = has_third ? 1.0 / n : 0.0;
    }

    float from_state = max(this_state, max(s1, s2));
    if (has_third) from_state = max(from_state, s3);
    float new_state = from_state - (from_state - this_state) * exp(-u_state_rate * u_delta_time);

    vec4 self_wd = texture(u_wcolor_dist, v_uv);
    vec4 wd1 = texture(u_wcolor_dist, v_adj_uv1);
    vec4 wd2 = texture(u_wcolor_dist, v_adj_uv2);
    vec4 wd3 = has_third ? texture(u_wcolor_dist, v_adj_uv3) : vec4(0.0);

    float decayed_weight = this_weight * exp(-u_weight_decay * u_delta_time);

    vec3 propagated_color;
    float new_weight;
    float new_distance;
    if (total > 0.0) {
        // contribution = state advantage * how much real colour the neighbor holds
        float c1 = a1 * nw1;
        float c2 = a2 * nw2;
        float c3 = a3 * nw3;
        float ct = c1 + c2 + c3;

        if (ct > 1e-9) {
            vec3 incoming_color = (c1 * wd1.rgb + c2 * wd2.rgb + c3 * wd3.rgb) / ct;
            float incoming_weight = total * u_delta_time;
            float blend_total = decayed_weight + incoming_weight;
            propagated_color = (self_wd.rgb * decayed_weight + incoming_color * incoming_weight) / blend_total;
            new_weight = min(blend_total, MAX_WEIGHT);
        } else {
            // ahead neighbors carry no real colour: don't pull anything in
            propagated_color = self_wd.rgb;
            new_weight = decayed_weight;
        }

        // ignore float-noise "advantage"
        const float EPS = 1e-6;
        float d = 1e9;
        if (a1 > EPS) d = min(d, wd1.a);
        if (a2 > EPS) d = min(d, wd2.a);
        if (has_third && a3 > EPS) d = min(d, wd3.a);
        new_distance = (d < 1e8) ? d + 1.0 : self_wd.a;
    } else {
        propagated_color = self_wd.rgb;
        new_distance = self_wd.a;
        new_weight = this_weight;
    }

    // unconditional diffusion pass — always runs, driven by neighbor weight
    // (not state advantage), so it actively mixes at the frontier where
    // advantage is near zero, but doesn't dilute low-weight/fresh neighbors
    float diffuse_total = nw1 + nw2 + nw3;
    vec3 diffuse_target = diffuse_total > 0.0
        ? (nw1 * wd1.rgb + nw2 * wd2.rgb + nw3 * wd3.rgb) / diffuse_total
        : propagated_color;

    //float diffusion_amount = clamp(u_diffusion_rate * u_delta_time, 0.0, 1.0);
    float diffusion_amount = 1.0 - exp(-u_diffusion_rate * u_delta_time);
    vec3 new_wcolor = mix(propagated_color, diffuse_target, diffusion_amount);

    o_wcolor_dist   = vec4(new_wcolor, new_distance);
    o_state_weights = vec4(new_state, new_weight, 0.0, 0.0);
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
        this.state = 0;
        this.next = new Set();
        this.next_ids = new Set();
    }
}
class ColorfulGrid {
    constructor(side_length, gpu, color = new Uint8Array([255, 255, 255, 255]), brush_size = 0) {
        if (!Number.isInteger(side_length) || side_length < 1)
            throw `ColorfulGrid: side_length must be an integer greater than 1`;
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
                    if (s === 0 && p === 0)
                        this.adj_map[t1] =
                            [t1 + 1, t1 + triangle_count - 1, t1 + next_layer_adj];
                    else
                        this.adj_map[t1] = [t1 - 1, t1 + 1, t1 + next_layer_adj];
                    if (last_layer)
                        this.adj_map[t1].splice(2, 1);
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
                if (s === 0) {
                    if (d === 0)
                        this.adj_map[t] = [t + 1, t + triangle_count - 1];
                    else
                        this.adj_map[t] = [t - 1, t + 1];
                }
                else if (s !== 5)
                    this.adj_map[t] = [t - 1, t + 1];
                else
                    this.adj_map[t] = [t - triangle_count + 1, t - 1];
                if (!last_layer)
                    this.adj_map[t][2] = t + next_layer_adj;
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
        this.cell_ids = new Uint32Array(num_triangles);
        this.cell_uvs = new Float32Array(nt2);
        this.hovered = new Uint8Array(nt3);
        this.hovered.fill(0);
        for (let i = 0; i < num_triangles; ++i) {
            const id = i + 1, base_i = i * 3, base_u = i * 6, base_uc = i * 2, col = id % texture_size, row = Math.floor(id / texture_size), u = (col + 0.5) / texture_size, v = (row + 0.5) / texture_size;
            if (gpu) {
                this.cell_ids[i] = id;
                this.cell_uvs[base_uc] = u;
                this.cell_uvs[base_uc + 1] = v;
            }
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
        if (gpu) {
            this.adj_uvs_1 = new Float32Array(nt6);
            this.cell_adj_uvs_1 = new Float32Array(nt2);
            this.adj_uvs_2 = new Float32Array(nt6);
            this.cell_adj_uvs_2 = new Float32Array(nt2);
            this.adj_uvs_3 = new Float32Array(nt6);
            this.cell_adj_uvs_3 = new Float32Array(nt2);
        }
        for (let i = 0; gpu && i < num_triangles; ++i) {
            const id = i + 1, base_i = i * 6, base_ic = i * 2, base_1 = (this.adj_map[id][0] - 1) * 6, base_2 = (this.adj_map[id][1] - 1) * 6, base_3 = this.adj_map[id][2] === undefined ?
                -1 :
                (this.adj_map[id][2] - 1) * 6;
            const u1 = this.uvs[base_1], v1 = this.uvs[base_1 + 1];
            this.cell_adj_uvs_1[base_ic] = u1;
            this.cell_adj_uvs_1[base_ic + 1] = v1;
            this.adj_uvs_1[base_i] = u1;
            this.adj_uvs_1[base_i + 1] = v1;
            this.adj_uvs_1[base_i + 2] = u1;
            this.adj_uvs_1[base_i + 3] = v1;
            this.adj_uvs_1[base_i + 4] = u1;
            this.adj_uvs_1[base_i + 5] = v1;
            const u2 = this.uvs[base_2], v2 = this.uvs[base_2 + 1];
            this.cell_adj_uvs_2[base_ic] = u2;
            this.cell_adj_uvs_2[base_ic + 1] = v2;
            this.adj_uvs_2[base_i] = u2;
            this.adj_uvs_2[base_i + 1] = v2;
            this.adj_uvs_2[base_i + 2] = u2;
            this.adj_uvs_2[base_i + 3] = v2;
            this.adj_uvs_2[base_i + 4] = u2;
            this.adj_uvs_2[base_i + 5] = v2;
            if (base_3 === -1) {
                this.cell_adj_uvs_3[base_ic] = -1;
                this.cell_adj_uvs_3[base_ic + 1] = -1;
                this.adj_uvs_3[base_i] = -1;
                this.adj_uvs_3[base_i + 1] = -1;
                this.adj_uvs_3[base_i + 2] = -1;
                this.adj_uvs_3[base_i + 3] = -1;
                this.adj_uvs_3[base_i + 4] = -1;
                this.adj_uvs_3[base_i + 5] = -1;
            }
            else {
                const u3 = this.uvs[base_3], v3 = this.uvs[base_3 + 1];
                this.cell_adj_uvs_3[base_ic] = u3;
                this.cell_adj_uvs_3[base_ic + 1] = v3;
                this.adj_uvs_3[base_i] = u3;
                this.adj_uvs_3[base_i + 1] = v3;
                this.adj_uvs_3[base_i + 2] = u3;
                this.adj_uvs_3[base_i + 3] = v3;
                this.adj_uvs_3[base_i + 4] = u3;
                this.adj_uvs_3[base_i + 5] = v3;
            }
        }
        const tex_length = texture_size * texture_size * 4;
        this.texture = new Uint8Array(tex_length);
        const t_u32view = new Uint32Array(this.texture.buffer);
        t_u32view.fill(pack_uint8(color));
        this.texture_u32view = t_u32view;
        this.hover_texture = new Uint8Array(tex_length);
        const ht_u32view = new Uint32Array(this.hover_texture.buffer);
        ht_u32view.fill(0);
        this.hover_texture_u32view = ht_u32view;
        if (gpu) {
            this.state_weights = new Float32Array(tex_length);
            this.state_weights.fill(0.0);
            this.wcolor_dist = new Float32Array(tex_length);
            this.wcolor_dist.fill(0.0);
        }
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
                node.next_ids.add(nid);
                next_node.next.add(node);
                next_node.next_ids.add(id);
            }
            if (brush_size === 0) {
                node.brush = new Set([id]);
                node.brushn = new Set([node]);
                continue;
            }
            const brush = new Set(adj_ids), brushn = new Set(node.next);
            let frontier = new Set(brush);
            brush.add(id);
            brushn.add(node);
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
                        brushn.add(this.adj_graph[next_id]);
                    }
                }
                frontier = new_frontier;
            }
            node.brush = brush;
            node.brushn = brushn;
        }
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
/** this value is used to  */
// let wave_id = 0,
//     /** */
//     choosen_palette = [] as color_data[],
//     /** index of the color used from the current choosen palette of colors. */
//     palette_color = 0,
//     /** value used to filter out all the queued waves when filling or clearing
//      * the entire grid. */
//     queued_wave_count = 0,
//     /** each wave_id lower or equal to this value will be discarded. */
//     prevent_waves_last_id = 0;
let wave_start, fill_grid, inward_wave;
if (gpu !== 1) {
    function cpu_wave_start(ids, color_data, _wave_id) {
        --stroke.queued_wave_count;
        stroke.queued_wave_count = Math.max(stroke.queued_wave_count, 0);
        const _state = _wave_id === undefined
            ? ++stroke.wave_id
            : _wave_id;
        if (_state <= stroke.prevent_waves_last_id)
            return;
        let color, fcolor, packed;
        if (color_data === undefined) {
            const data = stroke.choosen_palette[stroke.palette_color];
            color = data.color;
            if (stroke.choosen_palette.length > 1)
                stroke.palette_color = (stroke.palette_color + 1) % stroke.choosen_palette.length;
            fcolor = data.fcolor;
            packed = data.packed;
        }
        else {
            color = color_data.color;
            fcolor = color_data.fcolor;
            packed = color_data.packed;
        }
        let next;
        if (typeof ids === "number") {
            grid.adj_graph[ids].state = _state;
            if (stroke.flat_queue.has(ids)) {
                const offset = ids * 4;
                grid.texture[offset] = Math.floor((color[0] + 255) * 0.5);
                grid.texture[offset + 1] = Math.floor((color[1] + 255) * 0.5);
                grid.texture[offset + 2] = Math.floor((color[2] + 255) * 0.5);
                grid.texture[offset + 3] = 255;
            }
            else
                grid.texture_u32view[ids] = packed;
            next = new Set(grid.adj_graph[ids].next);
        }
        else {
            next = new Set();
            for (const id of ids) {
                const node = grid.adj_graph[id];
                node.state = _state;
                grid.texture_u32view[id] = packed;
                for (const nnext of node.next) {
                    if (next.has(nnext))
                        continue;
                    next.add(nnext);
                }
            }
        }
        renderer.texture_is_dirty = true;
        cpu_wave_propagate(next, _state, { color, fcolor, packed }, 0);
    }
    function cpu_wave_propagate(ids, state, color_data, depth) {
        --stroke.queued_wave_count;
        stroke.queued_wave_count = Math.max(stroke.queued_wave_count, 0);
        if (state <= stroke.prevent_waves_last_id)
            return;
        const collected = new Set(), new_wave = new Set();
        let factor = blend_value;
        if (wave_decay < 1)
            factor *= wave_decay ** Math.max(depth - decay_min_radius - 1, 0);
        const { color, packed } = color_data;
        for (const node of ids) {
            if (node.state === state) {
                ids.delete(node);
                continue;
            }
            if (Math.random() <= new_wave_p)
                new_wave.add(node);
            const node_id = node.id, offset = node_id * 4, is_hovered = stroke.flat_queue.has(node_id);
            node.state = state;
            let avg_r = 0, avg_g = 0, avg_b = 0;
            for (const adj_node of node.next) {
                const adj_id = adj_node.id, adj_offset = adj_id * 4;
                if (stroke.flat_queue.has(adj_id)) {
                    /** remove applied white highlight color from adjacent nodes
                     * before adding the true color to the total sum */
                    avg_r +=
                        Math.max(Math.floor(2 * grid.texture[adj_offset] - 255), 0);
                    avg_g +=
                        Math.max(Math.floor(2 * grid.texture[adj_offset + 1] - 255), 0);
                    avg_b +=
                        Math.max(Math.floor(2 * grid.texture[adj_offset + 2] - 255), 0);
                }
                else {
                    avg_r += grid.texture[adj_offset];
                    avg_g += grid.texture[adj_offset + 1];
                    avg_b += grid.texture[adj_offset + 2];
                }
                if (ids.has(adj_node) || adj_node.state >= state)
                    continue;
                collected.add(adj_node);
            }
            const inv_adj_count = 1 / node.next.size;
            avg_r *= inv_adj_count;
            avg_g *= inv_adj_count;
            avg_b *= inv_adj_count;
            if (factor >= 1) {
                if (is_hovered) {
                    grid.texture[offset] =
                        Math.max(Math.floor((avg_r + 255) * 0.5), 0);
                    grid.texture[offset + 1] =
                        Math.max(Math.floor((avg_g + 255) * 0.5), 0);
                    grid.texture[offset + 2] =
                        Math.max(Math.floor((avg_b + 255) * 0.5), 0);
                    grid.texture[offset + 3] = 255;
                }
                else
                    grid.texture_u32view[node_id] = packed;
            }
            else if (factor > 0) {
                const p_in = 1 - factor, p = factor;
                if (is_hovered) {
                    grid.texture[offset] =
                        Math.max(Math.floor((Math.floor(avg_r * p_in + color[0] * p) + 255) * 0.5), 0);
                    grid.texture[offset + 1] =
                        Math.max(Math.floor((Math.floor(avg_g * p_in + color[1] * p) + 255) * 0.5), 0);
                    grid.texture[offset + 2] =
                        Math.max(Math.floor((Math.floor(avg_b * p_in + color[2] * p) + 255) * 0.5), 0);
                    grid.texture[offset + 3] = 255;
                }
                else {
                    grid.texture[offset] = Math.floor(avg_r * p_in + color[0] * p);
                    grid.texture[offset + 1] = Math.floor(avg_g * p_in + color[1] * p);
                    grid.texture[offset + 2] = Math.floor(avg_b * p_in + color[2] * p);
                    grid.texture[offset + 3] = 255;
                }
            }
            else {
                if (is_hovered) {
                    grid.texture[offset] =
                        Math.max(Math.floor((avg_r + 255) * 0.5), 0);
                    grid.texture[offset + 1] =
                        Math.max(Math.floor((avg_g + 255) * 0.5), 0);
                    grid.texture[offset + 2] =
                        Math.max(Math.floor((avg_b + 255) * 0.5), 0);
                    grid.texture[offset + 3] = 255;
                }
                else {
                    grid.texture[offset] = Math.floor(avg_r);
                    grid.texture[offset + 1] = Math.floor(avg_g);
                    grid.texture[offset + 2] = Math.floor(avg_b);
                    grid.texture[offset + 3] = 255;
                }
            }
        }
        renderer.texture_is_dirty = true;
        for (const new_start of new_wave) {
            const new_id = new_start.id, new_offset = new_id * 4, is_hovered = stroke.flat_queue.has(new_id);
            let new_color; //, new_color_packed: number;
            let new_color_data;
            if (Math.random() <= new_color_p) {
                if (Math.random() <= new_color_compl_p)
                    new_color = new Uint8Array([
                        255 - color[0],
                        255 - color[1],
                        255 - color[2],
                        255
                    ]);
                else
                    new_color = undefined;
            }
            else {
                if (is_hovered) {
                    new_color = new Uint8Array([
                        Math.max(2 * grid.texture[new_offset] - 255, 0),
                        Math.max(2 * grid.texture[new_offset + 1] - 255, 0),
                        Math.max(2 * grid.texture[new_offset + 2] - 255, 0),
                        255
                    ]);
                }
                else {
                    new_color = new Uint8Array([
                        grid.texture[new_offset],
                        grid.texture[new_offset + 1],
                        grid.texture[new_offset + 2],
                        255
                    ]);
                }
            }
            if (new_color !== undefined)
                new_color_data = get_color_data(new_color);
            ++stroke.queued_wave_count;
            setTimeout(cpu_wave_start, new_wave_delay, new_id, new_color_data, ++stroke.wave_id);
        }
        if (collected.size === 0)
            return;
        ++stroke.queued_wave_count;
        setTimeout(cpu_wave_propagate, wave_delay, collected, state, color_data, depth + 1);
    }
    function cpu_inward_wave() {
        const from = 6 * (side_length - 2) ** 2 + 1, to = 6 * side_length ** 2, mod = 5, m = from % mod;
        const s = new Set();
        for (let i = from; i < to; ++i) {
            if (i % mod === m) {
                s.add(i);
                cpu_wave_start(s);
                s.clear();
            }
        }
        cpu_wave_start(s);
    }
    function cpu_fill_grid(color) {
        const clear_color = color === undefined ?
            pack_uint8(grid_bg) :
            color.packed;
        grid.texture_u32view.fill(clear_color);
        grid.texture_u32view[0] = 0;
        if (stroke.queued_wave_count > 0) {
            stroke.prevent_waves_last_id = stroke.wave_id + stroke.queued_wave_count;
            stroke.wave_id = stroke.prevent_waves_last_id + 1;
        }
        renderer.texture_is_dirty = true;
    }
    wave_start = cpu_wave_start;
    inward_wave = cpu_inward_wave;
    fill_grid = cpu_fill_grid;
}
// let wave_queue = new Set() as Set<number>,
//     queued_strokes = [] as {stroke:Set<number>, color_data:color_data}[],
//     stroke_count = -1;
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
    /** this value is used to  */
    wave_id: 0,
    choosen_palette: [],
    /** index of the color used from the current choosen palette of colors. */
    palette_color: 0,
    /** gpu = 0: value used to filter out all the queued waves when filling or
     * clearing the entire grid. */
    queued_wave_count: 0,
    /** gpu = 0: each wave_id lower or equal to this value will be discarded. */
    prevent_waves_last_id: 0
};
let process_stroke, remove_highlights, process_queued_strokes;
if (gpu !== 1) {
    function cpu_process_stroke(hovered) {
        if (hovered !== 0 && hovered !== mouse.last_hovered_id) {
            if (keyboard.shift_down) {
                const brush = grid.adj_graph[hovered].brush;
                const newly_hovered = brush.difference(stroke.flat_queue);
                if (newly_hovered.size === 0)
                    return;
                for (const id of newly_hovered) {
                    stroke.queue[stroke.count].stroke.add(id);
                    stroke.flat_queue.add(id);
                    const offset = id * 4;
                    grid.texture[offset] =
                        Math.min(Math.floor(grid.texture[offset] + 255) * 0.5, 255);
                    grid.texture[offset + 1] =
                        Math.min(Math.floor(grid.texture[offset + 1] + 255) * 0.5, 255);
                    grid.texture[offset + 2] =
                        Math.min(Math.floor(grid.texture[offset + 2] + 255) * 0.5, 255);
                }
                renderer.texture_is_dirty = true;
            }
            else if (keyboard.ctrl_down) {
                fill_grid(stroke.choosen_palette[stroke.palette_color]);
            }
            else {
                const brush = new Set(grid.adj_graph[hovered].brush);
                wave_start(brush);
            }
            mouse.last_hovered_id = hovered;
        }
    }
    function cpu_remove_highlights() {
        for (const id of stroke.flat_queue) {
            const offset = id * 4;
            grid.texture[offset] = Math.max(2 * grid.texture[offset] - 255, 0);
            grid.texture[offset + 1] = Math.max(2 * grid.texture[offset + 1] - 255, 0);
            grid.texture[offset + 2] = Math.max(2 * grid.texture[offset + 2] - 255, 0);
            grid.texture[offset + 3] = Math.max(2 * grid.texture[offset + 3] - 255, 0);
        }
        renderer.texture_is_dirty = true;
        stroke.flat_queue.clear();
    }
    function cpu_process_queued_strokes() {
        if (stroke.flat_queue.size === 0)
            return;
        cpu_remove_highlights();
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
    process_stroke = cpu_process_stroke;
    remove_highlights = cpu_remove_highlights;
    process_queued_strokes = cpu_process_queued_strokes;
}
if (gpu === 1) {
    function gpu_wave_start(ids, color_data, _wave_id) {
        const _state = _wave_id === undefined
            ? ++stroke.wave_id
            : _wave_id;
        const brush = typeof ids === "number" ?
            new Set(grid.adj_graph[ids].brush) :
            new Set(ids);
        const fcolor = color_data !== undefined
            ? color_data.fcolor
            : stroke.choosen_palette[stroke.palette_color].fcolor;
        if (color_data === undefined && stroke.choosen_palette.length > 1) {
            stroke.palette_color = (stroke.palette_color + 1) % stroke.choosen_palette.length;
        }
        const [r, g, b] = fcolor;
        const wcolor_dist = new Float32Array([r, g, b, 0.0]);
        const state_weights = new Float32Array([++stroke.wave_id, max_weight, 0.0, 0.0]);
        const target_tex0 = state_read_index === 0 ? state_weights_0 : state_weights_1;
        const target_tex1 = state_read_index === 0 ? wcolor_dist_0 : wcolor_dist_1;
        for (const id of brush) {
            const col = id % grid.texture_size, row = Math.floor(id / grid.texture_size);
            gl.bindTexture(gl.TEXTURE_2D, target_tex0);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, col, row, 1, 1, gl.RGBA, gl.FLOAT, state_weights);
            gl.bindTexture(gl.TEXTURE_2D, target_tex1);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, col, row, 1, 1, gl.RGBA, gl.FLOAT, wcolor_dist);
        }
    }
    function gpu_inward_wave() {
        const from = 6 * (side_length - 2) ** 2 + 1, to = 6 * side_length ** 2, mod = 5, m = from % mod;
        const s = new Set();
        for (let i = from; i < to; ++i) {
            if (i % mod === m) {
                s.add(i);
                gpu_wave_start(s);
                s.clear();
            }
        }
        gpu_wave_start(s);
    }
    function gpu_fill_grid(color) {
        const clear_color = color === undefined ?
            get_color_data(grid_bg) :
            color;
        grid.texture_u32view.fill(clear_color.packed);
        grid.state_weights.fill(0.0);
        // start from 1, because there is no vertex id equal to zero
        for (let i = 1; i < grid.adj_graph.length; ++i) {
            const offset = i * 4;
            grid.wcolor_dist[offset] = 0;
            grid.wcolor_dist[offset + 1] = 0;
            grid.wcolor_dist[offset + 2] = 0;
            grid.wcolor_dist[offset + 3] = 0;
        }
        stroke.wave_id = 0;
        renderer.texture_is_dirty = true;
        renderer.state_is_dirty = true;
    }
    wave_start = gpu_wave_start;
    inward_wave = gpu_inward_wave;
    fill_grid = gpu_fill_grid;
}
if (gpu === 1) {
    function gpu_process_stroke(hovered) {
        if (hovered === 0 || hovered === mouse.last_hovered_id)
            return;
        if (keyboard.shift_down) {
            const brush = grid.adj_graph[hovered].brush;
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
            const brush = new Set(grid.adj_graph[hovered].brush);
            wave_start(brush);
        }
        mouse.last_hovered_id = hovered;
    }
    function gpu_remove_highlights() {
        const v = new Uint8Array([0, 0, 0]);
        gl.bindBuffer(gl.ARRAY_BUFFER, hovered_buffer);
        for (const id of stroke.flat_queue) {
            const byte_offset = id * 3 - 1;
            gl.bufferSubData(gl.ARRAY_BUFFER, byte_offset, v);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        stroke.flat_queue.clear();
    }
    function gpu_process_queued_strokes() {
        if (stroke.flat_queue.size === 0)
            return;
        gpu_remove_highlights();
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
    process_stroke = gpu_process_stroke;
    remove_highlights = gpu_remove_highlights;
    process_queued_strokes = gpu_process_queued_strokes;
}
const renderer = {
    /** buffer used to read from the vertex mask texture. */
    id_mask_data: new Uint32Array(1),
    update_view_proj_mat: false,
    /** this is set to true on window.onresize; forces to recalculate the vertex
     * mask texture during the draw pass. */
    force_render_mask: true,
    /** this is set to true any time that grid.texture or grid.texture_u32view
     * get modified; forces to update the shader data. */
    texture_is_dirty: false,
    hover_texture_is_dirty: false,
    state_is_dirty: false,
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
    window_hidden: false
};
function draw(timestamp) {
    renderer.delta_time = (timestamp - renderer.prev_timestamp) * 0.001;
    renderer.prev_timestamp = timestamp;
    if (renderer.window_hidden) {
        requestAnimationFrame(draw);
        return;
    }
    ++renderer.frame;
    mouse.wheel_already_processed = false;
    if (renderer.update_view_proj_mat)
        view_proj_mat =
            create_view_projection_matrix(camera.x, camera.y, camera.scale, camera.ar);
    if (renderer.request_color_clear) {
        fill_grid();
        renderer.request_color_clear = false;
    }
    let source_state_weights, source_wcolor_dist, target_state_weights, target_wcolor_dist, target_fbo;
    if (gpu) {
        if (state_read_index === 0) {
            source_state_weights = state_weights_0;
            source_wcolor_dist = wcolor_dist_0;
            target_fbo = state_fbo1;
            target_state_weights = state_weights_1;
            target_wcolor_dist = wcolor_dist_1;
        }
        else {
            source_state_weights = state_weights_1;
            source_wcolor_dist = wcolor_dist_1;
            target_fbo = state_fbo0;
            target_state_weights = state_weights_0;
            target_wcolor_dist = wcolor_dist_0;
        }
        if (renderer.state_is_dirty) {
            gl.bindTexture(gl.TEXTURE_2D, source_state_weights);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, grid.texture_size, grid.texture_size, gl.RGBA, gl.FLOAT, grid.state_weights);
            gl.bindTexture(gl.TEXTURE_2D, source_wcolor_dist);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, grid.texture_size, grid.texture_size, gl.RGBA, gl.FLOAT, grid.wcolor_dist);
            renderer.state_is_dirty = false;
        }
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
        if (renderer.request_mouse_sample &&
            gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
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
    if (gpu) {
        state_p.use_program();
        gl.bindFramebuffer(gl.FRAMEBUFFER, target_fbo);
        gl.viewport(0, 0, grid.texture_size, grid.texture_size);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, color_texture);
        if (renderer.texture_is_dirty) {
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, grid.texture_size, grid.texture_size, gl.RGBA, gl.UNSIGNED_BYTE, grid.texture);
            renderer.texture_is_dirty = false;
        }
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, source_state_weights);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, source_wcolor_dist);
        gl.bindVertexArray(state_vao);
        gl.disable(gl.BLEND);
        gl.drawArrays(gl.POINTS, 0, grid.triangle_count);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    //////////////////////////////////
    //         MAIN SHADER          //
    //////////////////////////////////
    p.use_program();
    if (renderer.update_view_proj_mat) {
        p.uniforms["u_view_proj"].update_value();
        renderer.update_view_proj_mat = false;
    }
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, color_texture);
    if (renderer.texture_is_dirty) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, grid.texture_size, grid.texture_size, gl.RGBA, gl.UNSIGNED_BYTE, grid.texture);
        renderer.texture_is_dirty = false;
    }
    if (gpu) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, target_state_weights);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, target_wcolor_dist);
        gl.activeTexture(gl.TEXTURE3);
        if (renderer.hover_texture_is_dirty) {
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, grid.texture_size, grid.texture_size, gl.RGBA, gl.UNSIGNED_BYTE, grid.hover_texture);
            renderer.hover_texture_is_dirty = false;
        }
        gl.bindTexture(gl.TEXTURE_2D, hover_texture);
        gl.enable(gl.BLEND);
    }
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, vertex_count);
    if (gpu)
        state_read_index = 1 - state_read_index;
    requestAnimationFrame(draw);
}
let gl, 
/** grid shader program. */
p, 
/** grid vertex mask shader program. */
mask_p, state_p, grid, mask_texture, mask_fbo, state_fbo0, state_fbo1, 
/** inner window aspect ratio. */
//ar:number,
/** camera (orthographic) projection matrix. */
view_proj_mat, 
/** window.innerWidth */
width, 
/** window.innerHeight */
height, 
/** grid vertex array object. */
vao, color_texture, hover_texture, 
/** mask grid vertex array object. */
mask_vao, 
/** state grid vertex array object. */
state_vao, state_weights_0, wcolor_dist_0, state_weights_1, wcolor_dist_1, state_read_index, hovered_buffer, 
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
/** used for mouse movement scaling to properly move the camera,
 * recalculated both in update_viewport and in w_wheel */
//units_per_pixel_x: number,
//units_per_pixel_y: number;
// let camera_x = 0,
//     camera_y = 0,
//     camera_coord_min = -0.5,
//     camera_coord_max = 0.5,
//     camera_scale_min = 0.0005,
//     camera_scale = 1,
//     camera_scale_max = 2;
const camera = {
    x: 0,
    y: 0,
    scale: 1,
    ar: 0,
    min_coord: -0.5,
    max_coord: 0.5,
    min_scale: 0.0005,
    max_scale: 2,
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
    const ext = gl.getExtension("EXT_color_buffer_float");
    if (!ext)
        throw "EXT_color_buffer_float is not supported on this hardware";
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
    if (gpu) {
        p = new shader_program("main", gpu_vert, gpu_frag, [
            new uniform("!u_view_proj", GL_MAT4x4, U_INIT, () => view_proj_mat),
            new uniform("u_texture", GL_TEXTURE, U_INIT, 0),
            new uniform("u_state_weights", GL_TEXTURE, U_INIT, 1),
            new uniform("u_wcolor_dist", GL_TEXTURE, U_INIT, 2),
            new uniform("u_hcolor", GL_TEXTURE, U_INIT, 3),
            // new uniform("u_blend_value", GL_FLOAT, U_INIT, blend_value),
            // new uniform("u_wave_decay", GL_FLOAT, U_INIT, wave_decay),
            // new uniform("u_decayt_min_radius", GL_FLOAT, U_INIT, decay_min_radius),
        ]);
    }
    else {
        p = new shader_program("main", cpu_vert, cpu_frag, [
            new uniform("!u_view_proj", GL_MAT4x4, U_INIT, () => view_proj_mat),
            new uniform("!u_texture", GL_TEXTURE, U_INIT, 0),
        ]);
    }
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    grid = new ColorfulGrid(side_length, gpu, grid_bg, brush_size);
    vertex_count = grid.vertex_count;
    //////////////////////////////////
    //       MAIN SHADER            //
    //////////////////////////////////
    vao = create_vertex_array();
    const pos_buffer = create_buffer_vec2(grid.mesh, 0), id_buffer = create_buffer_uint32(grid.ids, 1);
    create_buffer_vec2(grid.uvs, 2); // uv_buffer
    if (gpu) {
        create_buffer_vec2(grid.adj_uvs_1, 3); // adj1_buffer
        create_buffer_vec2(grid.adj_uvs_2, 4); // adj2_buffer
        create_buffer_vec2(grid.adj_uvs_3, 5); // adj3_buffer
        hovered_buffer = create_dyn_buffer_uint8(grid.hovered, 6);
    }
    color_texture = create_RGBA_texture(grid.texture_size, grid.texture);
    hover_texture = create_RGBA_texture(grid.texture_size, grid.hover_texture);
    //////////////////////////////////
    //       MASK SHADER            //
    //////////////////////////////////
    mask_p = new shader_program("mask", mask_vert, mask_frag, [
        new uniform("!u_view_proj", GL_MAT4x4, 0, () => view_proj_mat),
    ]);
    mask_vao = create_vertex_array();
    bind_vec2_attr(pos_buffer, 0);
    bind_uint32_attr(id_buffer, 1);
    mask_texture = create_R32UI_texture(width, height);
    mask_fbo = create_frame_buffer(mask_texture);
    //////////////////////////////////
    //       STATE SHADER           //
    //////////////////////////////////
    if (gpu) {
        state_p = new shader_program("state", state_vert, state_frag, [
            new uniform("u_state_weights", GL_TEXTURE, U_INIT, 0),
            new uniform("u_wcolor_dist", GL_TEXTURE, U_INIT, 1),
            new uniform("u_delta_time", GL_FLOAT, U_UPDATE | U_INIT, () => renderer.delta_time),
            // new uniform("u_wave_decay", GL_FLOAT, U_INIT, wave_decay),
            // new uniform("u_decay_min_radius", GL_FLOAT, U_INIT, decay_min_radius),
            new uniform("u_state_rate", GL_FLOAT, U_UPDATE | U_INIT, () => rate_from_ms(state_rate), (v) => not_saturated(ms_from_rate(v))),
            new uniform("u_weight_decay", GL_FLOAT, U_UPDATE | U_INIT, () => rate_from_ms(weight_decay), (v) => not_saturated(ms_from_rate(v))),
            new uniform("u_diffusion_rate", GL_FLOAT, U_UPDATE | U_INIT, () => rate_from_ms(diffusion_rate), (v) => not_saturated(ms_from_rate(v))),
        ]);
        state_vao = create_vertex_array();
        create_buffer_uint32(grid.cell_ids, 0);
        create_buffer_vec2(grid.cell_uvs, 1);
        create_buffer_vec2(grid.cell_adj_uvs_1, 2);
        create_buffer_vec2(grid.cell_adj_uvs_2, 3);
        create_buffer_vec2(grid.cell_adj_uvs_3, 4);
        state_weights_0 = create_RGBA32F_texture(grid.texture_size, grid.state_weights);
        wcolor_dist_0 = create_RGBA32F_texture(grid.texture_size, grid.wcolor_dist);
        state_fbo0 = create_frame_buffer2(state_weights_0, wcolor_dist_0);
        state_weights_1 = create_RGBA32F_texture(grid.texture_size, grid.state_weights);
        wcolor_dist_1 = create_RGBA32F_texture(grid.texture_size, grid.wcolor_dist);
        state_fbo1 = create_frame_buffer2(state_weights_1, wcolor_dist_1);
        state_read_index = 0;
    }
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
