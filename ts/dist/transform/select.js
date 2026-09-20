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
            (0, jostraca_1.each)(mop.points, (mpoint) => {
                // GraphQL defs have no `paths`; the lookup is only passed through to
                // an unused parameter, so skip it rather than dereference undefined.
                const pdef = def.paths?.[mpoint.o];
                resolveSelect(guide, ment, mop, mpoint, pdef);
            });
            if (null != mop.points && 0 < mop.points.length) {
                sortPoints(guide, ment, mop);
            }
        });
        msg += ment.name + ' ';
    });
    return { ok: true, msg };
};
exports.selectTransform = selectTransform;
function resolveSelect(guide, ment, _mop, mpoint, _pdef) {
    const select = mpoint.q;
    const margs = mpoint.g;
    const argkinds = ['params', 'query', 'header', 'cookie'];
    // `exist` names values that must be PRESENT for this point to be chosen.
    // A GraphQL root field exposes its optional arguments (relay's first /
    // after, filters) as params, and requiring those for selection would make
    // list() unusable without supplying every pagination argument. Only
    // required arguments identify a point.
    const reqdonly = 'graphql' === mpoint.k;
    argkinds.map((kind) => {
        (0, jostraca_1.each)(margs[kind], (marg) => {
            if (reqdonly && !marg.r) {
                return;
            }
            if (!select.exist.includes(marg.n)) {
                select.exist.push(marg.n);
            }
        });
    });
    select.exist.sort();
    const gent = guide.entity[ment.name];
    // REST guides key entries by path, GraphQL guides by root field.
    const gpath = gent.path?.[mpoint.o] ?? gent.field?.[mpoint.o];
    if (null == gpath) {
        return;
    }
    if (gpath.action) {
        const actname = Object.keys(gpath.action).sort()[0];
        if (null != actname) {
            select.$action = actname;
        }
    }
}
function sortPoints(_guide, _ment, mop) {
    // Cache joined exist strings to avoid recomputing on every comparison.
    const existCache = new Map();
    for (const pt of mop.points) {
        existCache.set(pt, pt.q.exist.join('\t'));
    }
    mop.points.sort((a, b) => {
        // longest exist len first
        let order = b.q.exist.length - a.q.exist.length;
        if (0 === order) {
            if (null != a.q.$action && null != b.q.$action) {
                order = a.q.$action < b.q.$action ? -1 :
                    a.q.$action > b.q.$action ? 1 : 0;
            }
            if (0 === order) {
                const a_exist_str = existCache.get(a);
                const b_exist_str = existCache.get(b);
                order = a_exist_str < b_exist_str ? -1 :
                    a_exist_str > b_exist_str ? 1 : 0;
            }
        }
        return order;
    });
}
//# sourceMappingURL=select.js.map