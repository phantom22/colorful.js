const searchParams = new (class {
    url:URL;
    constructor() {
        this.url = new URL(window.location.href);
    }
    getNumber(p:string,fallback=0) {
        const v = this.url.searchParams.get(p);
        // @ts-ignore
        return v === null || isNaN(v) ? fallback : Number(v);
    }
    getBoolean(p:string) {
        return this.url.searchParams.get(p) === "true";
    }
    getString(p:string) {
        return this.url.searchParams.get(p) || "";
    }
});