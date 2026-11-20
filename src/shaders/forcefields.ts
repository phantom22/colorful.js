let DEFAULT_FORCE_FIELDS: {label:string, src:string}[];

{
const __FORCE_FIELDS_COMMON =
`float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3. - 2. * f);
    return mix(mix(hash21(i),               hash21(i + vec2(1, 0)), f.x),
               mix(hash21(i + vec2(0, 1)),  hash21(i + vec2(1, 1)), f.x), f.y);
}`;

const sh_double_gyre = 
`${__FORCE_FIELDS_COMMON}

vec2 get_velocity(vec2 p) {
    const float A = 0.1, eps = 0.25, w = 2. * 3.14159265 / 10.;
    float s = eps * sin(w * time);
    float a = s, b = 1. - 2. * s;
    float f  = a * p.x * p.x + b * p.x;
    float df = 2. * a * p.x + b;
    float PI = 3.14159265;
    return vec2(-PI * A * sin(PI * f) * cos(PI * p.y),
                 PI * A * cos(PI * f) * sin(PI * p.y) * df);
}`;

const sh_karman_vortex_sheet =
`vec2 vortex_row(vec2 p, float a, float gamma) {
    float k = 6.28318530718 / a;
    float d = cosh(k * p.y) - cos(k * p.x) + 0.02;   // softened denominator
    return gamma / (2. * a) * vec2(sinh(k * p.y), -sin(k * p.x)) / d;
}

vec2 get_velocity(vec2 p) {
    const float a = 1.0, h = 0.25, G = 1.0;
    p.x -= time * 0.1;                               // slow drift of the street
    vec2 v  = vortex_row(p - vec2(0., h),          a, -G);
    v      += vortex_row(p - vec2(0.5 * a, -h),    a,  G);
    return v;
}`;

const sh_electric_dipole =
`vec2 charge(vec2 p, vec2 c, float q) {
    vec2 d = p - c;
    return q * d / (dot(d, d) + 0.01);
}

vec2 get_velocity(vec2 p) {
    float t = time * 0.5;
    vec2 off = 0.6 * vec2(cos(t), sin(t));
    return charge(p,  off,  1.) + charge(p, -off, -1.);
}`;

const sh_curl_noise =
`${__FORCE_FIELDS_COMMON}

float potential(vec2 p) {
    float s = 0., a = 0.5;
    for (int i = 0; i < 4; i++) {
        s += a * vnoise(p + time * 0.15 * float(i + 1));
        p = p * 2.03 + 17.1;
        a *= 0.5;
    }
    return s;
}

vec2 get_velocity(vec2 p) {
    const float e = 1e-2;
    float dpdx = potential(p + vec2(e, 0.)) - potential(p - vec2(e, 0.));
    float dpdy = potential(p + vec2(0., e)) - potential(p - vec2(0., e));
    return vec2(dpdy, -dpdx) / (2. * e) * 1.5;
}`;

const sh_orbiting_gravity_wells =
`vec2 get_velocity(vec2 p) {
    vec2 v = vec2(0.);
    for (int i = 0; i < 3; i++) {
        float ang = time * 0.4 + float(i) * 2.0943951;     // 120° apart
        vec2 c = 0.7 * vec2(cos(ang), sin(ang));
        vec2 d = c - p;
        float r2 = dot(d, d) + 0.03;                         // softening
        vec2 dir = d * inversesqrt(r2);
        vec2 tang = vec2(-dir.y, dir.x);
        float g = 0.5 / r2;
        v += g * (dir + 0.8 * tang);                         // pull + swirl
    }
    return v;
}`;

const sh_drifting_taylor_green =
`vec2 get_velocity(vec2 p) {
    p = p * 3. + 0.5 * vec2(sin(time * 0.3), cos(time * 0.4));
    return vec2( sin(p.x) * cos(p.y),
                -cos(p.x) * sin(p.y));
}`;

const sh_cilinder_potential_flow =
`vec2 get_velocity(vec2 p) {
    const float U = 1.0, R = 0.5;
    float a = time * 0.3;
    float c = cos(a), s = sin(a);

    vec2 q = vec2(c * p.x + s * p.y, -s * p.x + c * p.y);   // rotate into flow frame
    float r2 = dot(q, q);
    if (r2 < R * R) return vec2(0.);

    float r4 = r2 * r2;
    vec2 v = U * vec2(1. - R * R * (q.x * q.x - q.y * q.y) / r4,
                         -2. * R * R * q.x * q.y / r4);

    float G = 1.5 * sin(time * 0.7);                         // circulation
    v += G / (6.28318530718 * r2) * vec2(-q.y, q.x);

    return vec2(c * v.x - s * v.y, s * v.x + c * v.y);       // rotate back
}`;

const sh_pendulum_phase =
`vec2 get_velocity(vec2 p) {
    p *= 3.;
    float drive = 0.5 * sin(time);
    return vec2(p.y,
                -sin(p.x) - 0.15 * p.y + drive);
}`;

const sh_vortex_pair = 
`vec2 lamb_oseen(vec2 p, vec2 c, float gamma, float core2) {
    vec2 d = p - c;
    float r2 = dot(d, d) + 1e-6;
    return gamma * (1. - exp(-r2 / core2)) / (6.28318530718 * r2) * vec2(-d.y, d.x);
}

vec2 get_velocity(vec2 p) {
    const float G = 1.0, sep = 0.8;
    float omega = G / (3.14159265 * sep * sep);
    float a = time * omega;
    vec2 c = 0.5 * sep * vec2(cos(a), sin(a));
    return lamb_oseen(p,  c, G, 0.04)
         + lamb_oseen(p, -c, G, 0.04);
}`;

const sh_spiral_sink =
`vec2 get_velocity(vec2 p) {
    float r2 = dot(p, p) + 0.02;
    vec2 radial = -p / r2;                        // inward
    vec2 tang   = vec2(-p.y, p.x) / r2;           // swirl

    float sink  = 0.6 + 0.4 * sin(time * 0.8);
    float swirl = 0.9 * cos(time * 0.5);
    return sink * radial + swirl * tang;
}`;

DEFAULT_FORCE_FIELDS = [
    {
        label:"Double gyre",
        src:sh_double_gyre
    },
    {
        label:"Kármán vortex street",
        src:sh_karman_vortex_sheet
    },
    {
        label:"Electric dipole field",
        src:sh_electric_dipole
    },
    {
        label:"Curl noise (divergence-free turbulence)",
        src:sh_curl_noise
    },
    {
        label:"Orbiting gravity wells with swirl",
        src:sh_orbiting_gravity_wells
    },
    {
        label:"Drifting Taylor-Green cells",
        src:sh_drifting_taylor_green
    },
    {
        label:"Potential flow past a cylinder",
        src:sh_cilinder_potential_flow
    },
    {
        label:"Driven damped pendulum phase portrait",
        src:sh_pendulum_phase
    },
    {
        label:"Co-rotating vortex pair (orbiting)",
        src:sh_vortex_pair
    },
    {
        label:"Pulsing spiral sink",
        src:sh_spiral_sink
    },
];

DEFAULT_FORCE_FIELDS.forEach(Object.freeze);
Object.freeze(DEFAULT_FORCE_FIELDS);

}

const FORCE_FIELD_DEFAULT = DEFAULT_FORCE_FIELDS[Math.floor(Math.random() * DEFAULT_FORCE_FIELDS.length)];
