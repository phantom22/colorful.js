const NO_DEFAULT = undefined;
const U_UPDATE = 1,
      U_INIT = 2;
const GL_INT = 4,
      GL_FLOAT = 5,
      GL_MAT4x4 = 6,
      GL_TEXTURE = 7;
const MAX_VALIDITY_WARN_COUNT = 30;
type uniform_type = 
    typeof GL_INT | typeof GL_FLOAT | typeof GL_MAT4x4 | typeof GL_TEXTURE;
interface uniform {
    name: string;
    type: uniform_type;
    update: number;
    init: number;
    loc: WebGLUniformLocation|null;
    important: boolean;
    get: () => any;
    default: ArrayLike<any>|number;
    update_value:() => void;
    validity_check?:(v:any) => boolean;
    validity_warn_count: number;
}

class uniform {
    constructor(name:string, type:uniform_type, flags:number, v:(()=>any)|ArrayLike<any>|number, validity_check?:(v:any) => boolean) {
        const important = name.startsWith("!"),
              val = important ? name.slice(1) : name;
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
    get v(): ArrayLike<any>|number {
        if (this.get !== undefined)
            return this.get();
        return this.default;
    }
}

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

interface shader_program {
    vertex:WebGLShader;
    fragment:WebGLShader;
    program:WebGLProgram;
    /** list of the U_UPDATE uniforms. */
    uniforms_to_update:string[];
    uniforms:Record<string,uniform>;
    /** this method both uses this shader_program and passes to the GPU all the
     * uniforms that have been marked as U_UPDATE. */
    use_program(): void;
}

const shaders = {} as Record<string,shader_program>;
class shader_program {
    constructor(id:string, vert_src:string, frag_src:string, uniforms:uniform[]) {
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

        const uniforms_to_update = [] as string[];
        this.uniforms_to_update = uniforms_to_update;

        this.uniforms = {};

        for (const u of uniforms) {
            const name = u.name,
                loc = gl.getUniformLocation(p, name);
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
            let pass_to_GPU: (loc:WebGLUniformLocation,x:any)=>void;
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
                default:
                    throw `Shader{${id},${name}}: invalid uniform type.`;
            }

            const no_loc = loc === null,
                  no_getter = u.default === undefined && u.get === undefined;

            if (no_loc)
                u.update_value = () => warn_uniform_not_defined(id,name);
            else if (no_getter)
                u.update_value = () => warn_uniform_no_getter(id,name);
            else if (u.validity_check instanceof Function) {
                if (u.v instanceof Function) {
                    u.update_value = () => { // @ts-ignore
                        const v = u.v;
                        // @ts-ignore
                        if (!u.validity_check(v)) {
                            console.warn(
                                `Shader{${id},${name}}: value ${v}: failed` +
                                " validity check."
                            );

                            if (++u.validity_warn_count === MAX_VALIDITY_WARN_COUNT)
                                u.update_value = () => pass_to_GPU(loc, u.v)
                        }
                        pass_to_GPU(loc, v);
                    }
                }
                else {
                    u.update_value = () => { // @ts-ignore
                        const v = u.v;
                        // @ts-ignore
                        if (!u.validity_check(v)) {
                            console.warn(
                                `Shader{${id},${name}}: value` +
                                // @ts-ignore
                                typeof v === "number" ? v.toFixed(3) : v.toString() +
                                `: failed validity check.`
                            );
                            u.update_value = () => pass_to_GPU(loc, u.v)                  
                        }
                        pass_to_GPU(loc, v);
                    }
                }
            }
            else // @ts-ignore
                u.update_value = () => pass_to_GPU(u.loc, u.v);

            if (u.update)
                if (no_loc || no_getter)
                    console.error(
                        `Shader{${id},${name}}: couldn't be added to` +
                        " uniforms_to_update."
                    );
                else uniforms_to_update.push(name);


            if (u.init)
                if (no_getter)
                    console.error(
                        `Shader{${id},${name}}: couldn't be` +
                        "initialized."
                    );
                else
                    pass_to_GPU(loc, u.v)
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