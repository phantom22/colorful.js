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
    if (v === null)
        throw "Colorful.js: couldn't create vertex shader";

    gl.shaderSource(v, v_src);
    gl.compileShader(v);

    if (!gl.getShaderParameter(v, gl.COMPILE_STATUS))
        throw "Colorful.js: compile_shader(): failed to compile vertex " +
              "shader, reason: " + gl.getShaderInfoLog(v);

    const f = gl.createShader(gl.FRAGMENT_SHADER);
    if (f === null)
        throw "Colorful.js: couldn't create fragment shader";
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
        const loc = gl.getUniformLocation(p, key);
        if (loc === null)
            throw `Colorful.js: the specified uniform named '${key}' is not`
                    + " defined within the shader.";
        o.uniforms[key] = loc;
    }

    for (const key of attributes) {
        o.attributes[key] = gl.getAttribLocation(p, key);
    }

    return o;
}

function mat4x4_mul(A:Float32Array, B:Float32Array) {
    const [a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p]=A,
          [$,_,C,D,E,F,G,H,I,J,K,L,M,N,O,P]=B;
    return new Float32Array([
        a*$+b*E+c*I+d*M, a*_+b*F+c*J+d*N, a*C+b*G+c*K+d*O, a*D+b*H+c*L+d*P,
        e*$+f*E+g*I+h*M, e*_+f*F+g*J+h*N, e*C+f*G+g*K+h*O, e*D+f*H+g*L+h*P,
        i*$+j*E+k*I+l*M, i*_+j*F+k*J+l*N, i*C+j*G+k*K+l*O, i*D+j*H+k*L+l*P,
        m*$+n*E+o*I+p*M, m*_+n*F+o*J+p*N, m*C+n*G+o*K+p*O, m*D+n*H+o*L+p*P,
    ])
}

function create_orthographic_matrix(
    l:number, r:number, b:number, t:number, n:number, f:number
) {
    return new Float32Array([
        2/(r-l), 0, 0, 0,
        0, 2/(t-b), 0, 0,
        0, 0, -2/(f-n), 0,
        -(r+l)/(r-l), -(t+b)/(t-b), -(f+n)/(f-n), 1
    ]);
}

function create_view_matrix(x:number, y:number, s:number) {
    return new Float32Array([
        1/s, 0, 0, 0,
        0, 1/s, 0, 0,
        0, 0, 1, 0,
        -x, -y, 0, 1
    ]);
}

function create_view_projection_matrix(
    x:number, y:number, s:number,
    l:number, r:number, b:number, t:number, n:number, f:number
) {
    const projection_matrix = new Float32Array([
        2/(r-l), 0, 0, 0,
        0, 2/(t-b), 0, 0,
        0, 0, -2/(f-n), 0,
        -(r+l)/(r-l), -(t+b)/(t-b), -(f+n)/(f-n), 1
    ]);

    const view_matrix = new Float32Array([
        1/s, 0, 0, 0,
        0, 1/s, 0, 0,
        0, 0, 1, 0,
        -x/s, -y/s, 0, 1
    ]);

    return mat4x4_mul(projection_matrix, view_matrix);
}