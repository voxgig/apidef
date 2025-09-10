"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.argsTransform = void 0;
const jostraca_1 = require("jostraca");
const utility_1 = require("../utility");
const argsTransform = async function (ctx) {
    const { apimodel, def } = ctx;
    let msg = 'args ';
    (0, jostraca_1.each)(apimodel.main.sdk.entity, (ment, entname) => {
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
        const marg = {
            name: (0, utility_1.depluralize)((0, jostraca_1.snakify)(argdef.name)),
            type: (0, utility_1.validator)(argdef.schema?.type),
            kind: ARG_KIND[argdef.in] ?? 'query',
            req: !!argdef.required
        };
        if (argdef.nullable) {
            marg.type = ['`$ONE`', '`$NULL`', marg.type];
        }
        // insert sorted by name
        let kindargs = (malt.args[marg.kind] = malt.args[marg.kind] ?? []);
        let kalen = kindargs.length;
        for (let ka, i = 0; i <= kalen; i++) {
            ka = kindargs[i];
            if (ka && ka.name > marg.name) {
                kindargs = [...kindargs.slice(0, i), marg, ...kindargs.slice(i + 1)];
            }
            else {
                kindargs.push(marg);
            }
        }
    });
}
//# sourceMappingURL=args.js.map