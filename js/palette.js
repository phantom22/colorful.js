"use strict";
const palette = [
    new Uint8Array([235, 50, 65]),
    new Uint8Array([248, 110, 20]),
    new Uint8Array([235, 195, 10]),
    new Uint8Array([60, 210, 65]),
    new Uint8Array([10, 195, 195]),
    new Uint8Array([45, 135, 255]),
    new Uint8Array([140, 80, 255]),
    new Uint8Array([235, 45, 205]),
    new Uint8Array([255, 255, 255]),
    new Uint8Array([0, 0, 0]),
];
let palette_color_data = palette.map(v => get_color_data(v));
