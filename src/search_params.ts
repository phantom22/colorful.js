const searchParams = new (class {
    url:URL;
    constructor() {
        this.url = new URL(window.location.href);
    }
    getNumber(p:string,fallback=0,lower=-Infinity,upper=Infinity) {
        const v = this.url.searchParams.get(p),
              nv = Number(v);
        // @ts-ignore
        return v === null || isNaN(v) ? fallback : Math.min(Math.max(nv, lower), upper);
    }
    getUint8Color(p:string,fallback=new Uint8Array([0, 0, 0])) {
        const v = this.url.searchParams.get(p);
        if (v === null) return fallback;
        try {
            const av = JSON.parse(v),
                  o = new Uint8Array(4);
            if (!Array.isArray(av))
                return fallback;


            const l = av.length;
            if (l < 3 || l > 4)
                return fallback;

            for (let i=0; i<3; ++i) {
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

            return Uint8Array.from(av)
        }
        catch (e) {
            return fallback;
        }
    }
    getBoolean(p:string) {
        return this.url.searchParams.get(p) === "true";
    }
    getString(p:string,fallback="") {
        return this.url.searchParams.get(p) || fallback;
    }
});

const gpu = Math.floor(searchParams.getNumber("gpu", 1, 0,1)),
      side_length = searchParams.getNumber("side_length", gpu ? 64:32, 1),
      brush_size = Math.floor(searchParams.getNumber("brush_size", gpu ? 5:1, 0)),
      blend_value = searchParams.getNumber("blend_value", gpu ? 0.6:0.008, 0,1),
      wave_delay = searchParams.getNumber("wave_delay", 30, 1),
      wave_decay = searchParams.getNumber("wave_decay", gpu ? 0.999:0.9, 0,1),
      decay_min_radius = searchParams.getNumber("decay_min_radius", -2),
      new_wave_delay = searchParams.getNumber("new_wave_delay", 500, 1),
      new_wave_p = searchParams.getNumber("new_wave_p", 0.0002, 0,1),
      new_color_p = searchParams.getNumber("new_color_p", 0.1, 0,1),
      new_color_compl_p = searchParams.getNumber("new_color_compl_p", 0.5, 0,1),
      grid_bg = searchParams.getUint8Color("grid_bg"),
      max_weight = 3.0;

const params = new URLSearchParams([
    ["gpu", `${gpu}`],
    ["side_length", `${side_length}`],
    ["brush_size", `${brush_size}`],
    ["blend_value",`${blend_value}`],
    ["wave_delay", `${wave_delay}`],
    ["wave_decay", `${wave_decay}`],
    ["decay_min_radius", `${decay_min_radius}`],
    ["new_wave_delay", `${new_wave_delay}`],
    ["new_wave_p", `${new_wave_p}`],
    ["new_color_p", `${new_color_p}`],
    ["new_color_compl_p", `${new_color_compl_p}`]
]);

{
    const updated_search_params = `?${params.toString()}&grid_bg=[${grid_bg}]`;

    if (window.location.search !== updated_search_params)
        window.history.replaceState({}, '', updated_search_params);
}