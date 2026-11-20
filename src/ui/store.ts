const store = (() => {
    const KEY = "fluid_ui_v1";
    let data: Record<string, any> = {};
    try { data = JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {}; } catch {}
    let timer = 0;
    const flush = () => { clearTimeout(timer); try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {} };
    const queue = () => { clearTimeout(timer); timer = window.setTimeout(flush, 250); };
    addEventListener("pagehide", flush);
    return {
        get: (id: string) => data[id],
        set: (id: string, v: any) => { data[id] = v; queue(); },
        del: (id: string) => { delete data[id]; queue(); },
    }
})();