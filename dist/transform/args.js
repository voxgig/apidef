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
                const pathdef = def.paths[mpoint.orig];
                argdefs.push(...(pathdef.parameters ?? []));
                const opdef = pathdef[mpoint.method.toLowerCase()];
                argdefs.push(...(opdef?.parameters ?? []));
                resolveArgs(ment, mop, mpoint, argdefs);
            });
        });
        msg += ment.name + ' ';
    });
    return { ok: true, msg };
};
exports.argsTransform = argsTransform;
const ARG_KIND = {
    'query': 'query',
    'header': 'header',
    'path': 'param',
    'cookie': 'cookie',
};
function resolveArgs(ment, mop, mpoint, argdefs) {
    const touchedKeys = new Set();
    (0, jostraca_1.each)(argdefs, (argdef) => {
        // Spec name as written (e.g. `dataType`) is what the rename map is keyed
        // by; the snakified form is the user-friendly runtime identifier.
        const specName = (0, utility_1.normalizeFieldName)(argdef.name);
        const orig = (0, utility_1.depluralize)((0, jostraca_1.snakify)(specName));
        const kind = ARG_KIND[argdef.in] ?? 'query';
        // Rename map can be keyed by either the spec original (camelCase) or by
        // the snakified form depending on which path went through heuristic01.
        // Try both before falling through to `orig`.
        const renameMap = mpoint.rename[kind];
        const name = renameMap?.[specName] ?? renameMap?.[orig] ?? orig;
        const marg = {
            name,
            orig,
            type: (0, utility_1.inferFieldType)(name, (0, utility_1.validator)(argdef.schema?.type)),
            kind,
            reqd: !!argdef.required
        };
        const example = resolveArgExample(argdef);
        if (undefined !== example) {
            marg.example = example;
        }
        if (argdef.nullable) {
            marg.type = ['`$ONE`', '`$NULL`', marg.type];
        }
        const argsKey = (marg.kind === 'param' ? 'params' : marg.kind);
        let kindargs = (mpoint.args[argsKey] = mpoint.args[argsKey] ?? []);
        kindargs.push(marg);
        touchedKeys.add(argsKey);
    });
    // Sort once after all args are collected
    const cmp = (a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    for (const key of touchedKeys) {
        mpoint.args[key]?.sort(cmp);
    }
}
// OpenAPI lets specs advertise example values four ways:
//   parameter.example          (single value, OAS 3.0+)
//   parameter.examples          (named-example object, take first .value)
//   parameter.schema.example   (single value on the schema)
//   parameter.schema.default   (default value)
// Pick the first one we find so test generators can produce valid live
// requests even when the parameter is required and has no other source.
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