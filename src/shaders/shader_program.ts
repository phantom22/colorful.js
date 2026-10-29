const _warn_uniform_not_defined = {} as {[k:string]:Record<string, boolean>};
function warn_uniform_not_defined(from:string,uniform_name:string) {
    if (_warn_uniform_not_defined[from] === undefined) {
        _warn_uniform_not_defined[from] = {};
    }
    if (_warn_uniform_not_defined[from][uniform_name])
        return;

    _warn_uniform_not_defined[from][uniform_name] = true;
    console.warn(`uniform '${uniform_name}' is not defined in the shader.`);
}

const _warn_uniform_no_getter = {} as {[k:string]:Record<string, boolean>};
function warn_uniform_no_getter(from:string, uniform_name:string) {
    if (_warn_uniform_no_getter[from] === undefined) {
        _warn_uniform_no_getter[from] = {};
    }
    if (_warn_uniform_no_getter[from][uniform_name])
        return;

    _warn_uniform_no_getter[from][uniform_name] = true;
    console.warn(
        `uniform '${uniform_name}' has both no getter function and no default` +
        ` value for automatic gpu uniform update.`
    );
}


const U_UPDATE = 1, U_INIT = 2;
const GL_UINT = 3, GL_INT = 4, GL_FLOAT = 5, GL_MAT4x4 = 6, GL_TEXTURE = 7,
      GL_VEC2 = 8, GL_VEC3 = 9, GL_VEC4 = 10;

/** maps each GL_* constant to the JS value type it accepts. */
interface uniform_value_map {
    [GL_UINT]: number;
    [GL_INT]: number;
    [GL_FLOAT]: number;
    [GL_TEXTURE]: number;
    [GL_MAT4x4]: Float32Array;
    [GL_VEC2]: ArrayLike<number>;
    [GL_VEC3]: ArrayLike<number>;
    [GL_VEC4]: ArrayLike<number>;
}
type uniform_type = keyof uniform_value_map;
type uniform_value<T extends uniform_type> = uniform_value_map[T];

const uploaders: { [K in uniform_type]: (loc: WebGLUniformLocation, v: uniform_value<K>) => void } = {
    [GL_UINT]:    (l, v) => gl.uniform1ui(l, v),
    [GL_INT]:     (l, v) => gl.uniform1i(l, v),
    [GL_TEXTURE]: (l, v) => gl.uniform1i(l, v),
    [GL_FLOAT]:   (l, v) => gl.uniform1f(l, v),
    [GL_MAT4x4]:  (l, v) => gl.uniformMatrix4fv(l, false, v),
    [GL_VEC2]:    (l, v) => gl.uniform2f(l, v[0], v[1]),
    [GL_VEC3]:    (l, v) => gl.uniform3f(l, v[0], v[1], v[2]),
    [GL_VEC4]:    (l, v) => gl.uniform4f(l, v[0], v[1], v[2], v[3]),
};

function upload<T extends uniform_type>(loc: WebGLUniformLocation, type: T, v: uniform_value<T>) {
    // TS can't correlate `type` with the table entry, so this is the one cast
    (uploaders[type] as (l: WebGLUniformLocation, v: uniform_value<T>) => void)(loc, v);
}

class uniform<N extends string = string, T extends uniform_type = uniform_type> {
    readonly name: N;
    readonly type: T;
    readonly update: boolean;
    readonly init: boolean;
    loc: WebGLUniformLocation | null = null;
    owner = "";
    private readonly source: (() => uniform_value<T>) | uniform_value<T> | undefined;
    /** last uploaded value (a copy). null = unknown, so the next upload always happens. */
    private cached: number | number[] | null = null;

    constructor(name: N, type: T, flags = 0, v?: (() => uniform_value<T>) | uniform_value<T>) {
        this.name = name;
        this.type = type;
        this.update = (flags & U_UPDATE) !== 0;
        this.init = (flags & U_INIT) !== 0;
        this.source = v;
    }

    get v(): uniform_value<T> | undefined {
        return typeof this.source === "function" ? this.source() : this.source;
    }

    /** forget the cache, e.g. after a context restore. */
    invalidate() { this.cached = null; }

    private differs(v: uniform_value<T>): boolean {
        if (this.type === GL_MAT4x4) return true;
        const c = this.cached;
        if (c === null) return true;
        if (typeof v === "number") return c !== v;
        const a = v as ArrayLike<number>, b = c as number[];
        if (a.length !== b.length) return true;
        for (let i = 0; i < a.length; ++i) if (a[i] !== b[i]) return true;
        return false;
    }

    private store(v: uniform_value<T>) {
        if (this.type === GL_MAT4x4) return;
        if (typeof v === "number") { this.cached = v; return; }
        const a = v as ArrayLike<number>;
        let b = this.cached;
        if (!Array.isArray(b) || b.length !== a.length) b = this.cached = new Array(a.length);
        for (let i = 0; i < a.length; ++i) (b as number[])[i] = a[i];     // copy, never keep the reference
    }

    private push(v: uniform_value<T>) {
        if (!this.differs(v)) return;
        upload(this.loc!, this.type, v);
        this.store(v);
    }

    update_value(): void {
        if (this.loc === null) { warn_uniform_not_defined(this.owner, this.name); return; }
        const v = this.v;
        if (v === undefined) { warn_uniform_no_getter(this.owner, this.name); return; }
        this.push(v);
    }

    set(v: uniform_value<T> | undefined): void {
        if (this.loc === null) { warn_uniform_not_defined(this.owner, this.name); return; }
        if (v === undefined) return;
        this.push(v);
    }
}

/** { point: uniform<"point", 8>, ... } built from the tuple of uniforms. */
type uniform_map<Us extends readonly uniform[]> = {
    [U in Us[number] as U["name"]]: U;
};

class shader_program<Us extends readonly uniform[] = readonly uniform[]> {
    readonly vertex: WebGLShader;
    readonly fragment: WebGLShader;
    readonly program: WebGLProgram;
    readonly uniforms: uniform_map<Us>;
    private readonly to_update: uniform[] = [];

    constructor(id: string, vert_src: string, frag_src: string, uniforms: [...Us]) {
        if (shaders[id] !== undefined)
            throw `shader_program: a program with id '${id}' already exists.`;

        const compile = (type: number, src: string, label: string) => {
            const s = gl.createShader(type);
            if (s === null) throw `shader_program: failed to create ${label} shader`;
            gl.shaderSource(s, src.trim());
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
                throw `Shader{${id}}: failed to compile ${label} shader, reason:` + gl.getShaderInfoLog(s);
            return s;
        };

        this.vertex = compile(gl.VERTEX_SHADER, vert_src, "vertex");
        this.fragment = compile(gl.FRAGMENT_SHADER, frag_src, "fragment");

        const p = gl.createProgram();
        gl.attachShader(p, this.vertex);
        gl.attachShader(p, this.fragment);
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS))
            throw `Shader{${id}}: failed to link, reason: ${gl.getProgramInfoLog(p)}`;
        this.program = p;
        gl.useProgram(p);

        const map: Record<string, uniform> = {};
        for (const u of uniforms) {
            u.owner = id;
            u.loc = gl.getUniformLocation(p, u.name);
            if (u.loc === null)
                console.warn(`Shader{${id},${u.name}}: not defined (optimized out?).`);
            map[u.name] = u;
            if (u.loc !== null) {
                if (u.update) this.to_update.push(u);
                if (u.init) u.update_value();
            }
        }
        this.uniforms = map as unknown as uniform_map<Us>;
        shaders[id] = this;
    }

    use_program(): void {
        gl.useProgram(this.program);
        for (const u of this.to_update) u.update_value();
    }
}

const shaders: Record<string, shader_program> = {};