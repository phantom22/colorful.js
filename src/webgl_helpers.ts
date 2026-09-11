function compile_shader_program(
        gl:WebGL2RenderingContext, vertex_id:string, fragment_id:string,
        attributes=[] as string[], uniforms=[] as string[]
    ) {
    if (gl === null || gl === undefined)
        throw "Colorful.js: compile_shader_program(): the passed WebGL " +
              "context is null or undefined";
    
    if (!Array.isArray(uniforms))
        throw "Colorful.js: compile_shader_program(): uniforms must be an " +
              "array of string";

    if (!Array.isArray(attributes))
        throw "Colorful.js: compile_shader_program(): attributes must be an " +
              "array of string";

    const v_el = document.getElementById(vertex_id),
          f_el = document.getElementById(fragment_id);

    if (!(v_el instanceof HTMLScriptElement) || v_el.type !== "x-shader/vs")
        throw "Colorful.js: compile_shader_program(): vertex source element " +
              // @ts-ignore
              "is expected to be of a <script> element of type 'x-shader/vs' (got " + v_el.type + ")";

    if (!(f_el instanceof HTMLScriptElement) || f_el.type !== "x-shader/fs")
        throw "Colorful.js: compile_shader_program(): fragment source element " +
              "is expected to be of a <script> element of type 'x-shader/vs'";
    
    const v_src = v_el.textContent.trimStart(),
          f_src = f_el.textContent.trimStart();

    const v = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(v, v_src);
    gl.compileShader(v);

    if (!gl.getShaderParameter(v, gl.COMPILE_STATUS))
        throw "Colorful.js: compile_shader(): failed to compile vertex " +
              "shader, reason: " + gl.getShaderInfoLog(v);

    const f = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(f, f_src);
    gl.compileShader(f);

    if (!gl.getShaderParameter(f, gl.COMPILE_STATUS))
        throw "Colorful.js: compile_shader(): failed to compile fragment " +
              "shader, reason: " + gl.getShaderInfoLog(f);

    const p = gl.createProgram();
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);

    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
        throw "Colorful.js: compile_shader(): failed to link shader program, " +
              "reason: " + gl.getProgramInfoLog(p);

    const o = {
        vertex: v,
        fragment: f,
        program: p,
        attributes: {} as Record<string, number>,
        uniforms: {} as Record<string, WebGLUniformLocation>,
        useProgram() { gl.useProgram(p) }
    }

    for (const key of uniforms) {
        o.uniforms[key] = gl.getUniformLocation(p, key);
    }

    for (const key of attributes) {
        o.attributes[key] = gl.getAttribLocation(p, key);
    }

    return o;
}

function create_orthographic_matrix(
    l:number, r:number, b:number, t:number, n:number, f:number
) {
    return new Float32Array([
        2/(r-l), 0, 0, 0,
        0, 2/(t-b), 0, 0,
        0, 0, -2/(f-n), 0,
        -(r+l)/(r-l), -(t+b)/(t-b), -(f+n)/(f-n), 1
    ])
}


const pack_buffer = new ArrayBuffer(4);
const pack8 = new Uint8Array(pack_buffer);
const pack32 = new Uint32Array(pack_buffer);

/** This approach was used to guarantee endian compatibility. */
function packUint8(color:Uint8Array): number {
    pack8[0] = color[0];
    pack8[1] = color[1];
    pack8[2] = color[2];
    pack8[3] = 255;
    return pack32[0]; // Guaranteed exact memory layout for current CPU
}