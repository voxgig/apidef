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
            (0, jostraca_1.each)(mop.points, (mtarget) => {
                const argdefs = [];
                const pathdef = def.paths[mtarget.orig];
                argdefs.push(...(pathdef.parameters ?? []));
                const opdef = pathdef[mtarget.method.toLowerCase()];
                argdefs.push(...(opdef?.parameters ?? []));
                resolveArgs(ment, mop, mtarget, argdefs);
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
function resolveArgs(ment, mop, mtarget, argdefs) {
    const touchedKeys = new Set();
    (0, jostraca_1.each)(argdefs, (argdef) => {
        const orig = (0, utility_1.depluralize)((0, jostraca_1.snakify)((0, utility_1.normalizeFieldName)(argdef.name)));
        const kind = ARG_KIND[argdef.in] ?? 'query';
        const name = mtarget.rename[kind]?.[orig] ?? orig;
        const marg = {
            name,
            orig,
            type: (0, utility_1.inferFieldType)(name, (0, utility_1.validator)(argdef.schema?.type)),
            kind,
            reqd: !!argdef.required
        };
        if (argdef.nullable) {
            marg.type = ['`$ONE`', '`$NULL`', marg.type];
        }
        const argsKey = (marg.kind === 'param' ? 'params' : marg.kind);
        let kindargs = (mtarget.args[argsKey] = mtarget.args[argsKey] ?? []);
        kindargs.push(marg);
        touchedKeys.add(argsKey);
    });
    // Sort once after all args are collected
    const cmp = (a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    for (const key of touchedKeys) {
        mtarget.args[key]?.sort(cmp);
    }
}
//# sourceMappingURL=args.js.map