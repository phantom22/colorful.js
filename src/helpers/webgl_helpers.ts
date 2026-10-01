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

function create_view_projection_matrix(x:number, y:number, s:number, ar:number) {
    const l = -ar, r = ar, b = -1, t = 1, n = -1, f = 1;

    const projection_matrix = new Float32Array([
        2/(r-l), 0, 0, 0,
        0, 2/(t-b), 0, 0,
        0, 0, -2/(f-n), 0,
        -(r+l)/(r-l), -(t+b)/(t-b), -(f+n)/(f-n), 1
    ]);

    const inv_s = 1./s;
    const view_matrix = new Float32Array([
        inv_s, 0, 0, 0,
        0, inv_s, 0, 0,
        0, 0, 1, 0,
        -x*inv_s, -y*inv_s, 0, 1
    ]);

    return mat4x4_mul(projection_matrix, view_matrix);
}

function create_buffer_vec2(data:Float32Array, at:number) {
    const out = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, out);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(at);
    return out;
}

function bind_vec2_attr(buffer:WebGLBuffer, at:number) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(at);
}

function create_buffer_uint32(data:Uint32Array, at:number) {
    const out = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, out);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.vertexAttribIPointer(at, 1, gl.UNSIGNED_INT, 0, 0);
    gl.enableVertexAttribArray(at);
    return out;
}

function bind_uint32_attr(buffer:WebGLBuffer, at:number) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribIPointer(at, 1, gl.UNSIGNED_INT, 0, 0);
    gl.enableVertexAttribArray(at);
}

function create_dyn_buffer_uint8(data:Uint8Array, at:number) {
    const out = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, out);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.vertexAttribIPointer(at, 1, gl.UNSIGNED_BYTE, 0, 0);
    gl.enableVertexAttribArray(at);
    return out;
}

function bind_uint8_attr(buffer:WebGLBuffer, at:number) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribIPointer(at, 1, gl.UNSIGNED_BYTE, 0, 0);
    gl.enableVertexAttribArray(at);
}

function create_R32UI_texture(width:number, height:number) {
    const o = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, o);

    gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.R32UI,
        width, height, 0,
        gl.RED_INTEGER, gl.UNSIGNED_INT, null
    );

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    return o;
}

function create_RGBA32F_texture(size:number, data:Float32Array|null) {
    const o = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, o);

    gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA32F,
        size, size, 0,
        gl.RGBA, gl.FLOAT, data
    );

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return o;
}

function create_RGBA_texture(size:number, data:Uint8Array) {
    const o = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, o);

    gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA8,
        size, size, 0,
        gl.RGBA, gl.UNSIGNED_BYTE, data
    );

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return o;
}

function create_vertex_array() {
    const o = gl.createVertexArray();
    gl.bindVertexArray(o);
    return o;
}

function create_frame_buffer(tex:WebGLTexture) {
    const o = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, o);
    gl.framebufferTexture2D(
        gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D, tex, 0
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return o;
}

function create_frame_buffer2(tex0:WebGLTexture, tex1:WebGLTexture) {
    const o = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, o);
    gl.framebufferTexture2D(
        gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D, tex0, 0
    );
    gl.framebufferTexture2D(
        gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1,
        gl.TEXTURE_2D, tex1, 0
    );
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return o;
}

function resize_R32UI_texture(tex:WebGLTexture, width:number, height:number) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.R32UI,
        width, height, 0,
        gl.RED_INTEGER, gl.UNSIGNED_INT, null
    );

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
}

function int_to_gpu(loc:WebGLUniformLocation, x:number) {
    gl.uniform1i(loc, x);
}

function float_to_gpu(loc:WebGLUniformLocation, x:number) {
    gl.uniform1f(loc, x);
}

function mat4x4_to_gpu(loc:WebGLUniformLocation, x:Float32Array) {
    gl.uniformMatrix4fv(loc, false, x);
}