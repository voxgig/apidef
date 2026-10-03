"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.argsTransform = void 0;
const jostraca_1 = require("jostraca");
const utility_1 = require("../utility");
const types_1 = require("../types");
const argsTransform = async function (ctx) {
    const { apimodel, def } = ctx;
    const kit = apimodel.main[types_1.KIT];
    let msg = 'args ';
    (0, jostraca_1.each)(kit.entity, (ment, entname) => {
        (0, jostraca_1.each)(ment.op, (mop, opname) => {
            (0, jostraca_1.each)(mop.points, (mpoint) => {
                const argdefs = [];
                if ('graphql' === mpoint.k) {
                    // GraphQL root-field arguments become 'param' args, so the existing
                    // arg machinery (select.exist matching, request typing, test
                    // generation) works on them unchanged. Input-object arguments are
                    // the request body and are bound as variables by the document
                    // renderer instead, so they are not surfaced as params here.
                    const fielddef = graphqlFieldDef(def, mpoint);
                    for (const arg of (fielddef?.args ?? [])) {
                        const argtype = def.types?.[arg.type];
                        if (null != argtype && 'INPUT_OBJECT' === argtype.kind) {
                            continue;
                        }
                        argdefs.push({
                            name: arg.name,
                            in: 'path',
                            // A schema default makes a non-null argument omittable by the
                            // caller, so it is not required of the SDK caller either.
                            required: arg.reqd && undefined === arg.deflt,
                            schema: { type: gqlScalarType(arg.type) },
                        });
                    }
                }
                else {
                    const pathdef = def.paths[mpoint.o];
                    argdefs.push(...(pathdef?.parameters ?? []));
                    const opdef = pathdef?.[mpoint.m.toLowerCase()];
                    argdefs.push(...(opdef?.parameters ?? []));
                }
                resolveArgs(ctx, ment, mop, mpoint, argdefs);
            });
        });
        msg += ment.name + ' ';
    });
    return { ok: true, msg };
};
exports.argsTransform = argsTransform;
// Locate the normalised root-field descriptor a GraphQL point came from.
function graphqlFieldDef(def, mpoint) {
    const field = mpoint.gq?.field ?? mpoint.o;
    return 'mutation' === mpoint.gq?.optype ?
        def.mutation?.[field] : def.query?.[field];
}
function gqlScalarType(typeName) {
    return 'Int' === typeName ? 'integer' :
        'Float' === typeName ? 'number' :
            'Boolean' === typeName ? 'boolean' :
                ('String' === typeName || 'ID' === typeName) ? 'string' :
                    undefined;
}
const ARG_KIND = {
    'query': 'query',
    'header': 'header',
    'path': 'param',
    'cookie': 'cookie',
};
function resolveArgs(ctx, ment, mop, mpoint, argdefs) {
    const touchedKeys = new Set();
    const placeholders = [...String(mpoint.o ?? '').matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    (0, jostraca_1.each)(argdefs, (argdef) => {
        // A Swagger body parameter is the request body, which the body step reads.
        if ('body' === argdef.in) {
            return;
        }
        const specName = (0, utility_1.normalizeFieldName)(argdef.name);
        const orig = (0, utility_1.depluralize)((0, jostraca_1.snakify)(specName));
        if ('' === orig) {
            const ref = argdef?.$ref;
            ctx?.warn?.({
                note: `Parameter with no name on entity=${ment.name} op=${mop.name}` +
                    ` path=${mpoint.o} is dropped` +
                    (null == ref ? '.' : `: \`$ref\` "${ref}" resolves to nothing.`) +
                    ' A parameter needs a `name`, or a reference that resolves to one.',
                entity: ment.name,
                path: mpoint.o,
                op: mop.name,
            });
            return;
        }
        let kind = ARG_KIND[argdef.in] ?? 'query';
        let placed = false;
        const where = argdef.in;
        if ('string' !== typeof where || '' === where) {
            placed = placeholders.includes(argdef.name);
            kind = placed ? 'param' : 'query';
            ctx?.warn?.({
                note: `Parameter ${argdef.name} on entity=${ment.name} op=${mop.name}` +
                    ` path=${mpoint.o} has no \`in\`` +
                    (placed ? `; it names the path placeholder {${argdef.name}}, so it is taken as` +
                        ' a path parameter.' : ', so it is taken as a query parameter.') +
                    ' A parameter needs an `in`.',
                entity: ment.name,
                path: mpoint.o,
                op: mop.name,
                param: argdef.name,
            });
        }
        // A path argument is named by the lookup that names its segment, so the
        // two agree under a raw rename key, and one that fills a placeholder is
        // required, as OpenAPI requires; a GraphQL argument keeps its own flag.
        // Any other rename map is keyed by the spec original or the snakified form.
        const path = 'param' === kind;
        const fills = path && placeholders.some((p) => p === argdef.name || (0, utility_1.canonizeParam)(p) === orig);
        const renameMap = mpoint.r[kind];
        const name = path ? (0, utility_1.paramName)(argdef.name, mpoint.r.param) :
            (renameMap?.[specName] ?? renameMap?.[orig] ?? orig);
        const schema = paramSchema(argdef);
        // The name the definition gives, which the SDK sends on the wire. The
        // model name beside it is only what a caller writes.
        const marg = {
            n: name,
            or: String(argdef.name),
            t: (0, utility_1.inferFieldType)(name, (0, utility_1.validator)(schema?.type)),
            k: kind,
            r: fills || !!argdef.required
        };
        const example = resolveArgExample(argdef, schema);
        if (undefined !== example) {
            marg.ex = example;
        }
        if (argdef.nullable) {
            marg.t = ['`$ONE`', '`$NULL`', marg.t];
        }
        const argsKey = (marg.k === 'param' ? 'params' : marg.k);
        let kindargs = (mpoint.g[argsKey] = mpoint.g[argsKey] ?? []);
        kindargs.push(marg);
        touchedKeys.add(argsKey);
    });
    // A placeholder the definition declares no parameter for, such as Vapi's
    // DELETE /call/{id}, still takes a value: it gets a required string
    // argument under its own name, and a warning.
    if ('graphql' !== mpoint.k) {
        const declared = new Set((mpoint.g.params ?? [])
            .map((arg) => (0, utility_1.canonizeParam)(String(arg.or))));
        for (const wire of placeholders) {
            const orig = (0, utility_1.canonizeParam)(wire);
            const name = (0, utility_1.paramName)(wire, mpoint.r.param);
            // A declared parameter the placeholder is renamed to already fills it.
            if ('' === orig || declared.has(orig) ||
                (mpoint.g.params ?? []).some((arg) => arg.n === name))
                continue;
            declared.add(orig);
            const params = (mpoint.g.params = mpoint.g.params ?? []);
            params.push({ n: name, or: wire, t: (0, utility_1.inferFieldType)(name, (0, utility_1.validator)('string')), k: 'param', r: true });
            touchedKeys.add('params');
            ctx?.warn?.({
                note: `Path placeholder {${wire}} on entity=${ment.name} op=${mop.name}` +
                    ` path=${mpoint.o} has no declared parameter, so it is taken as a required string.`,
                entity: ment.name,
                path: mpoint.o,
                op: mop.name,
            });
        }
    }
    // Sort once after all args are collected
    const cmp = (a, b) => a.n < b.n ? -1 : a.n > b.n ? 1 : 0;
    for (const key of touchedKeys) {
        mpoint.g[key]?.sort(cmp);
    }
}
// Type facts sit on a Swagger 2 parameter itself, and under `schema` in
// OpenAPI 3. A formData parameter converts to a body field, not a parameter.
function paramSchema(argdef) {
    if (null != argdef?.schema) {
        return argdef.schema;
    }
    if ('formData' === argdef?.in) {
        return undefined;
    }
    // Swagger 2's file type is a binary string in OpenAPI 3.
    return 'file' === argdef?.type ? { ...argdef, type: 'string', format: 'binary' } : argdef;
}
function resolveArgExample(argdef, schema) {
    if (undefined !== argdef?.example)
        return argdef.example;
    const examples = argdef?.examples;
    if (examples && 'object' === typeof examples) {
        for (const v of Object.values(examples)) {
            if (v && 'object' === typeof v && undefined !== v.value) {
                return v.value;
            }
        }
    }
    if (schema) {
        if (undefined !== schema.example)
            return schema.example;
        if (undefined !== schema.default)
            return schema.default;
    }
    return undefined;
}
//# sourceMappingURL=args.js.map