"use strict";
const GLSL_KW = new Set("if else for while do break continue return discard const uniform in out inout void struct precision highp mediump lowp true false".split(" "));
const GLSL_TYPE = new Set("float int uint bool vec2 vec3 vec4 ivec2 ivec3 ivec4 uvec2 uvec3 uvec4 bvec2 bvec3 bvec4 mat2 mat3 mat4 sampler2D".split(" "));
const GLSL_FN = new Set("sin cos tan asin acos atan sinh cosh tanh pow exp log exp2 log2 sqrt inversesqrt abs sign floor ceil fract mod min max clamp mix step smoothstep length distance dot cross normalize reflect refract texture round trunc".split(" "));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function highlight_glsl(src) {
    const re = /(\/\/.*|\/\*[\s\S]*?\*\/)|(^[ \t]*#.*)|(\b\d+\.?\d*(?:[eE][+-]?\d+)?\b|\.\d+\b)|([A-Za-z_]\w*)/gm;
    let out = "", last = 0, m;
    while ((m = re.exec(src))) {
        out += esc(src.slice(last, m.index));
        const t = m[0];
        let cls = "";
        if (m[1])
            cls = "c";
        else if (m[2])
            cls = "p";
        else if (m[3])
            cls = "n";
        else if (GLSL_KW.has(t))
            cls = "k";
        else if (GLSL_TYPE.has(t))
            cls = "t";
        else if (GLSL_FN.has(t))
            cls = "f";
        out += cls ? `<span class="${cls}">${esc(t)}</span>` : esc(t);
        last = m.index + t.length;
    }
    return out + esc(src.slice(last)) + "\n"; // trailing newline keeps the last line's height
}
/** basic structural lint, 1-based lines. */
function lint_glsl(src, required_fn) {
    const out = [];
    const lines = src.split("\n");
    const stack = [];
    const pair = { ")": "(", "]": "[", "}": "{" };
    let in_block = false;
    lines.forEach((raw, i) => {
        let l = raw;
        if (in_block) { // inside /* ... */
            const e = l.indexOf("*/");
            if (e < 0)
                return;
            l = l.slice(e + 2);
            in_block = false;
        }
        l = l.replace(/\/\*.*?\*\//g, "").replace(/\/\/.*/, "");
        if (l.includes("/*")) {
            in_block = true;
            l = l.slice(0, l.indexOf("/*"));
        }
        for (const c of l) {
            if ("([{".includes(c))
                stack.push({ c, line: i + 1 });
            else if (")]}".includes(c)) {
                const top = stack.pop();
                if (!top || top.c !== pair[c])
                    out.push({ line: i + 1, msg: `unmatched '${c}'` });
            }
        }
        if (/\b(while|do)\b/.test(l))
            out.push({ line: i + 1, msg: "while/do loops are not allowed" });
        if (/\bfor\s*\(/.test(l) && !/\bfor\s*\(\s*int\s+\w+\s*=\s*\d+\s*;\s*\w+\s*<=?\s*\d+\s*;/.test(l))
            out.push({ line: i + 1, msg: "for loops need constant bounds: for (int i = 0; i < N; ++i)" });
    });
    for (const s of stack)
        out.push({ line: s.line, msg: `unclosed '${s.c}'` });
    if (required_fn && !new RegExp(`\\b${required_fn}\\s*\\(`).test(src))
        out.push({ line: 1, msg: `missing function '${required_fn}'` });
    return out;
}
