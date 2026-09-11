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
    getUint8Color(p:string,fallback=new Uint8Array([0, 0, 0, 255])) {
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