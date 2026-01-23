"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectTransform = void 0;
const jostraca_1 = require("jostraca");
const types_1 = require("../types");
const selectTransform = async function (ctx) {
    const { apimodel, def, guide } = ctx;
    const kit = apimodel.main[types_1.KIT];
    let msg = 'select ';
    (0, jostraca_1.each)(kit.entity, (ment, _entname) => {
        (0, jostraca_1.each)(ment.op, (mop, _opname) => {
            (0, jostraca_1.each)(mop.alts, (malt) => {
                const pdef = def.paths[malt.orig];
                resolveSelect(guide, ment, mop, malt, pdef);
            });
            if (null != mop.alts && 0 < mop.alts.length) {
                sortAlts(guide, ment, mop);
            }
        });
        msg += ment.name + ' ';
    });
    return { ok: true, msg };
};
exports.selectTransform = selectTransform;
function resolveSelect(guide, ment, _mop, malt, _pdef) {
    const select = malt.select;
    const margs = malt.args;
    const argkinds = ['param', 'query', 'header', 'cookie'];
    argkinds.map((kind) => {
        (0, jostraca_1.each)(margs[kind], (marg) => {
            if (!select.exist.includes(marg.name)) {
                select.exist.push(marg.name);
            }
        });
    });
    select.exist.sort();
    const gent = guide.entity[ment.name];
    const gpath = gent.path[malt.orig];
    if (gpath.action) {
        const actname = Object.keys(gpath.action)[0];
        if (null != actname) {
            select.$action = actname;
        }
    }
}
function sortAlts(_guide, _ment, mop) {
    mop.alts.sort((a, b) => {
        // longest exist len first
        let order = b.select.exist.length - a.select.exist.length;
        if (0 === order) {
            if (null != a.select.$action && null != b.select.$action) {
                order = a.select.$action < b.select.$action ? -1 :
                    a.select.$action > b.select.$action ? 1 : 0;
            }
            if (0 === order) {
                const a_exist_str = a.select.exist.join('\t');
                const b_exist_str = b.select.exist.join('\t');
                order = a_exist_str < b_exist_str ? -1 :
                    a_exist_str > b_exist_str ? 1 : 0;
            }
        }
        return order;
    });
}
//# sourceMappingURL=select.js.map