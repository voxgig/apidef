"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectTransform = void 0;
const jostraca_1 = require("jostraca");
const types_1 = require("../types");
const selectTransform = async function (ctx) {
    const { apimodel, def, guide } = ctx;
    const kit = apimodel.main[types_1.KIT];
    let msg = 'select ';
    (0, jostraca_1.each)(kit.entity, (ment, entname) => {
        (0, jostraca_1.each)(ment.op, (mop, opname) => {
            (0, jostraca_1.each)(mop.alts, (malt) => {
                const pdef = def.paths[malt.orig];
                resolveSelect(guide, ment, mop, malt, pdef);
            });
        });
        msg += ment.name + ' ';
    });
    return { ok: true, msg };
};
exports.selectTransform = selectTransform;
function resolveSelect(guide, ment, mop, malt, pdef) {
    const select = malt.select;
    const margs = malt.args;
    const argkinds = ['param', 'query', 'header', 'cookie'];
    argkinds.map((kind) => {
        (0, jostraca_1.each)(margs[kind], (marg) => {
            select[kind] = (select[kind] ?? {});
            if (marg.req) {
                select[kind][marg.name] = true;
            }
        });
    });
    const gent = guide.entity[ment.name];
    const gpath = gent.path[malt.orig];
    // console.log('GPATH', gpath)
    if (gpath.action) {
        const actname = Object.keys(gpath.action)[0];
        if (null != actname) {
            select.$action = actname;
        }
    }
}
//# sourceMappingURL=select.js.map