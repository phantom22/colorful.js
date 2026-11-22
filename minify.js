// Minifies bundle/index.js into bundle/index.min.js with property mangling.
//
// keep_quoted "strict": obj.foo is mangled, obj["foo"] never is. Quoted
// access is only used where the key is a real runtime string: the uniform
// maps (uniforms["tex_source"], keyed by GLSL names) and shaders["name"].
//
// The inspector binds fields through strings, { obj: fluid, key: "dye_radius" }
// then obj[d.key]. Those key strings get a /*@__KEY__*/ annotation so terser
// renames them together with the property they name. Objects with a `key` but
// no `obj` are toolbar shortcuts ("q", "w", ...) and are left alone.
//
// Names that must survive, besides terser's DOM/WebGL/JS list (domprops):
//   - dataset.* names, which are data-* attributes read by CSS/HTML
//   - fields of JSON stored in localStorage, which outlives a single build
//     (mangled names change whenever the code does)
//   - keys of object literals handed to browser methods ({ block: ... })
//   - properties the code reads but never defines anywhere, i.e. ones the
//     browser provides, in case domprops misses them
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");
const walk = require("acorn-walk");
const { minify } = require("terser");

/** shapes persisted in localStorage (GlslEntry). */
const PERSISTED = ["label", "src"];

const src_path = path.join(__dirname, "bundle", "index.js"),
      out_path = path.join(__dirname, "bundle", "index.min.js");
let src = fs.readFileSync(src_path, "utf8");

const ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "script" });
const name_of = k => k.type === "Identifier" ? k.name : typeof k.value === "string" ? k.value : undefined;

const defined = new Set(),     // property names the code itself creates
      read = new Set(),        // property names read with obj.name
      reserved = new Set(PERSISTED),
      key_strings = [];        // inspector key literals to annotate
const call_args = [];          // [method name, object literal] pairs

walk.full(ast, n => {
    switch (n.type) {
        case "Property":
            if (!n.computed && name_of(n.key)) defined.add(name_of(n.key));
            break;
        case "MethodDefinition":
        case "PropertyDefinition":
            if (!n.computed && n.key.type === "Identifier") defined.add(n.key.name);
            break;
        case "AssignmentExpression":
            if (n.left.type === "MemberExpression" && !n.left.computed) defined.add(n.left.property.name);
            break;
        case "MemberExpression":
            if (!n.computed) {
                read.add(n.property.name);
                if (n.object.type === "MemberExpression" && !n.object.computed && n.object.property.name === "dataset")
                    reserved.add(n.property.name);
            }
            break;
        case "ObjectExpression": {
            const props = n.properties.filter(p => p.type === "Property" && !p.computed);
            const key = props.find(p => name_of(p.key) === "key");
            if (key && props.some(p => name_of(p.key) === "obj") &&
                key.value.type === "Literal" && typeof key.value.value === "string")
                key_strings.push(key.value);
            break;
        }
        case "CallExpression":
        case "NewExpression":
            if (n.callee.type === "MemberExpression" && !n.callee.computed)
                for (const a of n.arguments)
                    if (a.type === "ObjectExpression") call_args.push([n.callee.property.name, a]);
            break;
    }
});

// options objects passed to methods the code doesn't define (browser APIs)
for (const [method, obj] of call_args)
    if (!defined.has(method))
        for (const p of obj.properties)
            if (p.type === "Property" && !p.computed && name_of(p.key)) reserved.add(name_of(p.key));
// read but never created here: provided by the browser
for (const r of read)
    if (!defined.has(r)) reserved.add(r);

// annotate inspector keys, back to front so offsets stay valid
for (const lit of key_strings.sort((a, b) => b.start - a.start))
    src = src.slice(0, lit.start) + "/*@__KEY__*/" + src.slice(lit.start);

(async () => {
    const result = await minify(src, {
        ecma: 2020,
        module: true,        // strict mode, top-level names are private
        toplevel: true,
        compress: {
            passes: 3,
            drop_console: true,
            pure_getters: true,
            unsafe: true,
            unsafe_arrows: true,
            unsafe_comps: true,
            unsafe_math: true,
            unsafe_methods: true,
            unsafe_proto: true,
            unsafe_regexp: true,
            unsafe_undefined: true,
            hoist_funs: true,
            // booleans_as_integers is left off: ui_helpers compares with typeof "boolean"
        },
        mangle: {
            toplevel: true,
            properties: {
                keep_quoted: "strict",
                reserved: [...reserved],
            },
        },
        format: { comments: false },
    });
    fs.writeFileSync(out_path, result.code);
    const kb = n => (n / 1024).toFixed(1) + " KB";
    console.log(`index.min.js: ${kb(fs.statSync(src_path).size)} -> ${kb(result.code.length)} ` +
                `(${key_strings.length} inspector keys, ${reserved.size} names reserved)`);
})().catch(e => { console.error(e); process.exit(1); });
