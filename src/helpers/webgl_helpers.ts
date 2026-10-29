// function mat4x4_mul(to:Float32Array, A:Float32Array, B:Float32Array) {
//     const [a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p]=A,
//           [$,_,C,D,E,F,G,H,I,J,K,L,M,N,O,P]=B;

//     to[0]  = a*$+e*_+i*C+m*D;
//     to[1]  = b*$+f*_+j*C+n*D;
//     to[2]  = c*$+g*_+k*C+o*D;
//     to[3]  = d*$+h*_+l*C+p*D;
//     to[4]  = a*E+e*F+i*G+m*H;
//     to[5]  = b*E+f*F+j*G+n*H;
//     to[6]  = c*E+g*F+k*G+o*H;
//     to[7]  = d*E+h*F+l*G+p*H;
//     to[8]  = a*I+e*J+i*K+m*L;
//     to[9]  = b*I+f*J+j*K+n*L;
//     to[10] = c*I+g*J+k*K+o*L;
//     to[11] = d*I+h*J+l*K+p*L;
//     to[12] = a*M+e*N+i*O+m*P;
//     to[13] = b*M+f*N+j*O+n*P;
//     to[14] = c*M+g*N+k*O+o*P;
//     to[15] = d*M+h*N+l*O+p*P;
// }

// function mat4x4_mul_vec2(to:Float32Array|number[], M:Float32Array, v:ArrayLike<number>) {
//     to[0] = M[0]*v[0] + M[4]*v[1] + M[12];
//     to[1] = M[1]*v[0] + M[5]*v[1] + M[13];
// }

// function mat4x4_det(M:Float32Array) {
//     return -M[12]*(M[9]*(M[2]*M[7]-M[3]*M[6])-M[10]*(M[1]*M[7]-M[3]*M[5])+M[11]*(M[1]*M[6]-M[2]*M[5]))+M[13]*(M[8]*(M[2]*M[7]-M[3]*M[6])-M[10]*(M[0]*M[7]-M[3]*M[4])+M[11]*(M[0]*M[6]-M[2]*M[4]))-M[14]*(M[8]*(M[1]*M[7]-M[3]*M[5])-M[9]*(M[0]*M[7]-M[3]*M[4])+M[11]*(M[0]*M[5]-M[1]*M[4]))+M[15]*(M[8]*(M[1]*M[6]-M[2]*M[5])-M[9]*(M[0]*M[6]-M[2]*M[4])+M[10]*(M[0]*M[5]-M[1]*M[4]))
// }

// function mat4x4_inv(to:Float32Array, from:Float32Array) {
//     let det = mat4x4_det(from);
//     if (det===0) {
//         to[0] = to[1] = to[2] = to[3] = to[4] = to[5] = to[6] = to[7] = to[8] =
//             to[9] = to[10] = to[11] = to[12] = to[13] = to[14] = to[15] = 0.0;
//         return;
//     }
//     det = 1/det;
//     const [a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p] = from,
//         d1=k*p-l*o, d2=j*p-l*n, d3=j*o-k*n, d4=g*p-h*o, d5=f*p-h*n, d6=f*o-g*n,d7=g*l-h*k, d8=f*l-h*j, d9=f*k-g*j, d10=i*p-l*m, d11=i*o-k*m, d12 =e*p-h*m,d13=e*o-g*m, d14=e*l-h*i, d15=e*k-g*i, d16=i*n-j*m, d17=e*n-f*m, d18=e*j-f*i;
    
    
//     to[0] = (f *d1-g*d2+h*d3)*det;
//     to[1] = (-b*d1+c*d2-d*d3)*det;
//     to[2] = (b*d4-c*d5+d*d6)*det;
//     to[3] = (-b*d7+c*d8-d*d9)*det;
//     to[4] = (-e*d1+g*d10-h*d11)*det;
//     to[5] = (a *d1-c*d10+d*d11)*det;
//     to[6] = (-a*d4+c*d12-d*d13)*det;
//     to[7] = (a *d7-c*d14+d*d15)*det;
//     to[8] = (e *d2-f*d10+h*d16)*det;
//     to[9] = (-a*d2+b*d10-d*d16)*det;
//     to[10] = (a *d5-b*d12+d*d17)*det;
//     to[11] = (-a*d8+b*d14-d*d18)*det;
//     to[12] = (-e*d3+f*d11-g*d16)*det;
//     to[13] = (a *d3-b*d11+c*d16)*det;
//     to[14] = (-a*d6+b*d13-c*d17)*det;
//     to[15] = (a *d9-b*d15+c*d18)*det;
// };

// function view_projection_matrix(to:Float32Array, proj:Float32Array, view:Float32Array, x:number, y:number, s:number, ar:number) {
//     const l = -ar, r = ar, b = -1, t = 1, n = -1, f = 1;

//     proj[0] = 2/(r-l);
//     proj[1] = proj[2] = proj[3] = proj[4] = proj[6] = proj[7] = proj[8] =
//         proj[9] = proj[11] = 0;
//     proj[5] = 2/(t-b);
//     proj[10] = -2/(f-n);
//     proj[12] = -(r+l)/(r-l);
//     proj[13] = -(t+b)/(t-b);
//     proj[14] = -(f+n)/(f-n);
//     proj[15] = 1;
    
//     const inv_s = 1/s;
//     view[0] = view[5] = inv_s;
//     view[1] = view[2] = view[3] = view[4] = view[6] = view[7] = view[8] =
//         view[9] = view[11] = view[14] = 0;
//     view[10] = view[15] = 1;
//     view[12] = -x*inv_s;
//     view[13] = -y*inv_s;

//     return mat4x4_mul(to, proj, view);
// }

function create_buffer_vec2(data:Float32Array, at:number) {
    const out = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, out);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(at);
    return out;
}

function create_vertex_array() {
    const o = gl.createVertexArray();
    gl.bindVertexArray(o);
    return o;
}

function frame_buffer(tex:WebGLTexture) {
    const o = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, o);
    gl.framebufferTexture2D(
        gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D, tex, 0
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return o;
}

function create_texture(m:number, n:number, int_fmt:number, fmt:number, type:number, data=null as ArrayBufferView<ArrayBufferLike>|null, filt=gl.NEAREST as number, wrap=gl.CLAMP_TO_EDGE as number) {
    const o = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, o);
    gl.texImage2D(gl.TEXTURE_2D, 0, int_fmt, m, n, 0, fmt, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return o;
}

function RGBA16F_texture(m:number, n:number,) {
    return create_texture(m, n, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, null, gl.LINEAR, gl.CLAMP_TO_EDGE);
}

function R16F_texture(m:number, n:number,) {
    return create_texture(m, n, gl.R16F, gl.RED, gl.HALF_FLOAT, null, gl.NEAREST, gl.CLAMP_TO_EDGE);
}

function texture_fill(tex_fbo:WebGLFramebuffer, _with:number[]|Float32Array) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, tex_fbo);
    gl.clearBufferfv(gl.COLOR, 0, _with);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function reduction_textures(out_tex:WebGLTexture[], out_fbo:WebGLFramebuffer[], m:number, n:number, block_size:number) {
    while (n > 1 || m > 1) {
        m = Math.ceil(m / block_size);
        n = Math.ceil(n / block_size);

        // Stop once we've reached a 1x1 final output
        if (n === 1 && m === 1) {
            break;
        }

        const tex = create_texture(m,n,gl.RG16F,gl.RG,gl.HALF_FLOAT,null,gl.NEAREST,gl.CLAMP_TO_EDGE);
        out_tex.push(tex);
        out_fbo.push(frame_buffer(tex));
    }
}

// function half_to_float(h: number) {
//     const s = (h & 0x8000) ? -1 : 1;
//     const e = (h >> 10) & 0x1f;
//     const m = h & 0x3ff;
//     if (e === 0)  return s * 5.960464477539063e-8 * m;      // subnormal
//     if (e === 31) return m ? NaN : s * Infinity;
//     return s * Math.pow(2, e - 15) * (1 + m / 1024);
// }

// function print_max_curl() {
//     const buf = new Uint16Array(N1 * N2);
//     gl.bindFramebuffer(gl.FRAMEBUFFER, curl_fbo);
//     gl.readPixels(0, 0, N1, N1, gl.RED, gl.HALF_FLOAT, buf);
//     gl.bindFramebuffer(gl.FRAMEBUFFER, null);

//     let max = 0, sum = 0, nan = 0, inf = 0;
//     for (let i = 0; i < buf.length; ++i) {
//         const v = half_to_float(buf[i]);
//         if (Number.isNaN(v)) { ++nan; continue; }
//         if (!Number.isFinite(v)) { ++inf; continue; }
//         const a = Math.abs(v);
//         if (a > max) max = a;
//         sum += a;
//     }
//     console.log("max |curl|:", max, "mean:", sum / buf.length, "NaN:", nan, "Inf:", inf);
// }

// function print_dye_stats(bg?: number[]) {
//     const L = M1*M2;
//     const buf = new Uint16Array(L * 4);

//     gl.bindFramebuffer(gl.FRAMEBUFFER, dye_fbo[dye_read]);
//     gl.readPixels(0, 0, M1, M2, gl.RGBA, gl.HALF_FLOAT, buf);
//     gl.bindFramebuffer(gl.FRAMEBUFFER, null);

//     const min = [Infinity, Infinity, Infinity, Infinity];
//     const max = [-Infinity, -Infinity, -Infinity, -Infinity];
//     const sum = [0, 0, 0, 0];
//     let nan = 0, inf = 0, changed = 0;

//     for (let i = 0; i < L; ++i) {
//         let diff = false;
//         for (let c = 0; c < 4; ++c) {
//             const v = half_to_float(buf[i * 4 + c]);
//             if (Number.isNaN(v)) { ++nan; continue; }
//             if (!Number.isFinite(v)) { ++inf; continue; }
//             if (v < min[c]) min[c] = v;
//             if (v > max[c]) max[c] = v;
//             sum[c] += v;
//             if (bg && c < 3 && Math.abs(v - bg[c]) > 0.01) diff = true;
//         }
//         if (diff) ++changed;
//     }

//     console.log(
//         "dye min:", min.map(v => v.toFixed(3)),
//         "max:", max.map(v => v.toFixed(3)),
//         "mean:", sum.map(v => (v / L).toFixed(3)),
//         "NaN:", nan, "Inf:", inf,
//         bg ? `non-bg texels: ${changed} (${(100 * changed / L).toFixed(2)}%)` : ""
//     );
// }

// function print_dye_mass() {
//     const L = M1*M2;
//     const buf = new Uint16Array(L * 4);
//     gl.bindFramebuffer(gl.FRAMEBUFFER, dye_fbo[dye_read]);
//     gl.readPixels(0, 0, M1, M2, gl.RGBA, gl.HALF_FLOAT, buf);
//     gl.bindFramebuffer(gl.FRAMEBUFFER, null);

//     let mass = 0, peak = 0, covered = 0;
//     for (let i = 0; i < L; ++i) {
//         const a = half_to_float(buf[i * 4 + 3]);
//         mass += a;
//         if (a > peak) peak = a;
//         if (a > 0.01) ++covered;
//     }
//     console.log("dye mass:", mass.toFixed(1), "peak a:", peak.toFixed(3), "texels > 0.01:", covered);
// }

// function print_speed_profile(pos:Float32Array) {   // cx, cy = splat uv
//     const [cx,cy] = pos;
//     const buf = new Uint16Array(N1 * N2 * 4);
//     gl.bindFramebuffer(gl.FRAMEBUFFER, velocity_fbo[velocity_read]);
//     gl.readPixels(0, 0, N1, N2, gl.RGBA, gl.HALF_FLOAT, buf);
//     gl.bindFramebuffer(gl.FRAMEBUFFER, null);

//     const bins = new Float32Array(8), cnt = new Float32Array(8);
//     for (let y = 0; y < N1; ++y) for (let x = 0; x < N2; ++x) {
//         const i = (y * N1 + x) * 4;
//         const sp = Math.hypot(half_to_float(buf[i]), half_to_float(buf[i + 1]));
//         const r = Math.hypot(x / N2 - cx, y / N1 - cy);       // distance in uv
//         const b = Math.min(7, Math.floor(r / 0.05));
//         bins[b] += sp; ++cnt[b];
//     }
//     console.log("mean speed by distance (0.05 uv rings):",
//         Array.from(bins, (s, i) => (s / Math.max(cnt[i], 1)).toFixed(2)));
// }