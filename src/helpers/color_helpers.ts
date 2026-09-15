const _pack_buffer = new ArrayBuffer(4),
      _pack8 = new Uint8Array(_pack_buffer),
      _pack32 = new Uint32Array(_pack_buffer);

/** This approach was used to guarantee endian compatibility. */
function pack_uint8(color:Uint8Array) {
    _pack8[0] = color[0];
    _pack8[1] = color[1];
    _pack8[2] = color[2];
    _pack8[3] = 255;
    return _pack32[0]; // Guaranteed exact memory layout for current CPU
}

function complementary_color(color:Uint8Array) {
    return new Uint8Array([
        255 - color[0], 255 - color[1], 255 - color[2], 255
    ]);
}

function uint8_to_float32(color:Uint8Array) {
    return new Float32Array([
        color[0] / 255, color[1] / 255, color[2] / 255, 1
    ]);
}

type color_data = {
    color: Uint8Array,
    fcolor: Float32Array,
    color_packed: number
};
function get_color_data(color:Uint8Array) {
    return {
        color,
        fcolor: uint8_to_float32(color),
        color_packed: pack_uint8(color)
    } as color_data;
}