"use strict";
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
const U_UPDATE = 1, U_INIT = 2;
const GL_UINT = 3, GL_INT = 4, GL_FLOAT = 5, GL_MAT4x4 = 6, GL_TEXTURE = 7, GL_VEC2 = 8, GL_VEC3 = 9, GL_VEC4 = 10;
const uploaders = {
    [GL_UINT]: (l, v) => gl.uniform1ui(l, v),
    [GL_INT]: (l, v) => gl.uniform1i(l, v),
    [GL_TEXTURE]: (l, v) => gl.uniform1i(l, v),
    [GL_FLOAT]: (l, v) => gl.uniform1f(l, v),
    [GL_MAT4x4]: (l, v) => gl.uniformMatrix4fv(l, false, v),
    [GL_VEC2]: (l, v) => gl.uniform2f(l, v[0], v[1]),
    [GL_VEC3]: (l, v) => gl.uniform3f(l, v[0], v[1], v[2]),
    [GL_VEC4]: (l, v) => gl.uniform4f(l, v[0], v[1], v[2], v[3]),
};
function upload(loc, type, v) {
    // TS can't correlate `type` with the table entry, so this is the one cast
    uploaders[type](loc, v);
}
class uniform {
    name;
    type;
    update;
    init;
    loc = null;
    owner = "";
    source;
    /** last uploaded value (a copy). null = unknown, so the next upload always happens. */
    cached = null;
    constructor(name, type, flags = 0, v) {
        this.name = name;
        this.type = type;
        this.update = (flags & U_UPDATE) !== 0;
        this.init = (flags & U_INIT) !== 0;
        this.source = v;
    }
    get v() {
        return typeof this.source === "function" ? this.source() : this.source;
    }
    /** forget the cache, e.g. after a context restore. */
    invalidate() { this.cached = null; }
    differs(v) {
        if (this.type === GL_MAT4x4)
            return true;
        const c = this.cached;
        if (c === null)
            return true;
        if (typeof v === "number")
            return c !== v;
        const a = v, b = c;
        if (a.length !== b.length)
            return true;
        for (let i = 0; i < a.length; ++i)
            if (a[i] !== b[i])
                return true;
        return false;
    }
    store(v) {
        if (this.type === GL_MAT4x4)
            return;
        if (typeof v === "number") {
            this.cached = v;
            return;
        }
        const a = v;
        let b = this.cached;
        if (!Array.isArray(b) || b.length !== a.length)
            b = this.cached = new Array(a.length);
        for (let i = 0; i < a.length; ++i)
            b[i] = a[i]; // copy, never keep the reference
    }
    push(v) {
        if (!this.differs(v))
            return;
        upload(this.loc, this.type, v);
        this.store(v);
    }
    update_value() {
        if (this.loc === null) {
            warn_uniform_not_defined(this.owner, this.name);
            return;
        }
        const v = this.v;
        if (v === undefined) {
            warn_uniform_no_getter(this.owner, this.name);
            return;
        }
        this.push(v);
    }
    set(v) {
        if (this.loc === null) {
            warn_uniform_not_defined(this.owner, this.name);
            return;
        }
        if (v === undefined)
            return;
        this.push(v);
    }
}
class shader_program {
    vertex;
    fragment;
    program;
    uniforms;
    to_update = [];
    constructor(id, vert_src, frag_src, uniforms) {
        if (shaders[id] !== undefined)
            throw `shader_program: a program with id '${id}' already exists.`;
        const compile = (type, src, label) => {
            const s = gl.createShader(type);
            if (s === null)
                throw `shader_program: failed to create ${label} shader`;
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
        const map = {};
        for (const u of uniforms) {
            u.owner = id;
            u.loc = gl.getUniformLocation(p, u.name);
            if (u.loc === null)
                console.warn(`Shader{${id},${u.name}}: not defined (optimized out?).`);
            map[u.name] = u;
            if (u.loc !== null) {
                if (u.update)
                    this.to_update.push(u);
                if (u.init)
                    u.update_value();
            }
        }
        this.uniforms = map;
        shaders[id] = this;
    }
    use_program() {
        gl.useProgram(this.program);
        for (const u of this.to_update)
            u.update_value();
    }
}
const shaders = {};
