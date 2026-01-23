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
            (0, jostraca_1.each)(mop.alts, (malt) => {
                const argdefs = [];
                const pathdef = def.paths[malt.orig];
                argdefs.push(...(pathdef.parameters ?? []));
                const opdef = pathdef[malt.method.toLowerCase()];
                argdefs.push(...(opdef.parameters ?? []));
                resolveArgs(ment, mop, malt, argdefs);
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
function resolveArgs(ment, mop, malt, argdefs) {
    (0, jostraca_1.each)(argdefs, (argdef) => {
        const orig = (0, utility_1.depluralize)((0, jostraca_1.snakify)(argdef.name));
        const kind = ARG_KIND[argdef.in] ?? 'query';
        const name = malt.rename[kind]?.[orig] ?? orig;
        const marg = {
            name,
            orig,
            type: (0, utility_1.validator)(argdef.schema?.type),
            kind,
            reqd: !!argdef.required
        };
        if (argdef.nullable) {
            marg.type = ['`$ONE`', '`$NULL`', marg.type];
        }
        // insert sorted by name
        let kindargs = (malt.args[marg.kind] = malt.args[marg.kind] ?? []);
        kindargs.push(marg);
        kindargs.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    });
}
//# sourceMappingURL=args.js.map