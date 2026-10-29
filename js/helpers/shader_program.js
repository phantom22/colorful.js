"use strict";
const NO_DEFAULT = undefined;
const U_UPDATE = 1, U_INIT = 2;
const GL_INT = 4, GL_FLOAT = 5, GL_MAT4x4 = 6, GL_TEXTURE = 7, GL_VEC2 = 8, GL_VEC3 = 9;
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
                case GL_VEC2:
                    pass_to_GPU = vec2_to_gpu;
                    break;
                case GL_VEC3:
                    pass_to_GPU = vec3_to_gpu;
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
