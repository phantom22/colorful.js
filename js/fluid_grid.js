"use strict";
class FluidGrid {
    constructor(sim_res, dye_res) {
        if (sim_res[0] < 0 || sim_res[1] < 0 || dye_res[0] < 0 || dye_res[1] < 0)
            throw "FluidGrid: sim_res and dye_res must be non negative.";
        this.sim_res = sim_res;
        this.dye_res = dye_res;
        // this.mesh = new Float32Array([
        //     -1.0,  1.0,
        //     1.0, -1.0,
        //     -1.0, -1.0,
        //     -1.0,  1.0,
        //     1.0,  1.0,
        //     1.0, -1.0
        // ]);
        // Corrected UVs covering the full texture (0 to 1)
        this.uvs = new Float32Array([
            0.0, 1.0,
            1.0, 0.0,
            0.0, 0.0,
            0.0, 1.0,
            1.0, 1.0,
            1.0, 0.0
        ]);
        this.mesh = new Float32Array([-0.5, 0.5, 0.5, -0.5, -0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5]);
        //this.uvs = new Float32Array([0.5,0.1666666716337204,0.5,0.1666666716337204,0.5,0.1666666716337204,0.8333333134651184,0.1666666716337204,0.8333333134651184,0.1666666716337204,0.8333333134651184,0.1666666716337204]);
    }
}
