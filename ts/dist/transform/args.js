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
    (0, jostraca_1.each)(argdefs, (argdef) => {
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
        const kind = ARG_KIND[argdef.in] ?? 'query';
        // Rename map can be keyed by either the spec original (camelCase) or by
        // the snakified form depending on which path went through heuristic01.
        // Try both before falling through to `orig`.
        const renameMap = mpoint.r[kind];
        const name = renameMap?.[specName] ?? renameMap?.[orig] ?? orig;
        const marg = {
            n: name,
            or: orig,
            t: (0, utility_1.inferFieldType)(name, (0, utility_1.validator)(argdef.schema?.type)),
            k: kind,
            r: !!argdef.required
        };
        const example = resolveArgExample(argdef);
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
    // Sort once after all args are collected
    const cmp = (a, b) => a.n < b.n ? -1 : a.n > b.n ? 1 : 0;
    for (const key of touchedKeys) {
        mpoint.g[key]?.sort(cmp);
    }
}
function resolveArgExample(argdef) {
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
    const schema = argdef?.schema;
    if (schema) {
        if (undefined !== schema.example)
            return schema.example;
        if (undefined !== schema.default)
            return schema.default;
    }
    return undefined;
}
//# sourceMappingURL=args.js.map