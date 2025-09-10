"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.operationTransform = void 0;
const jostraca_1 = require("jostraca");
const struct_1 = require("@voxgig/struct");
const operationTransform = async function (ctx) {
    const { apimodel, guide } = ctx;
    let msg = 'operation ';
    (0, jostraca_1.each)(guide.entity, (gent, entname) => {
        collectOps(gent);
        const opm = {
            load: undefined,
            list: undefined,
            create: undefined,
            update: undefined,
            delete: undefined,
            patch: undefined,
        };
        resolveLoad(opm, gent);
        resolveList(opm, gent);
        resolveCreate(opm, gent);
        resolveUpdate(opm, gent);
        resolveDelete(opm, gent);
        resolvePatch(opm, gent);
        apimodel.main.sdk.entity[entname].op = opm;
        msg += gent.name + ' ';
    });
    return { ok: true, msg };
};
exports.operationTransform = operationTransform;
function collectOps(gent) {
    gent.opm$ = gent.opm$ ?? {};
    (0, jostraca_1.each)(gent.paths$, (pathdesc) => {
        (0, jostraca_1.each)(pathdesc.op, (gop, opname) => {
            gent.opm$[opname] = gent.opm$[opname] ?? { paths: [] };
            const oppathdesc = {
                orig: pathdesc.orig,
                parts: pathdesc.parts,
                rename: pathdesc.rename,
                method: gop.method,
                op: pathdesc.op,
                def: pathdesc.def,
            };
            gent.opm$[opname].paths.push(oppathdesc);
        });
    });
}
function resolveLoad(opm, gent) {
    const opdesc = opm.load = resolveOp('load', gent);
    return opdesc;
}
function resolveList(opm, gent) {
    const opdesc = opm.list = resolveOp('list', gent);
    return opdesc;
}
function resolveCreate(opm, gent) {
    const opdesc = opm.create = resolveOp('create', gent);
    return opdesc;
}
function resolveUpdate(opm, gent) {
    const opdesc = opm.update = resolveOp('update', gent);
    return opdesc;
}
function resolveDelete(opm, gent) {
    const opdesc = opm.delete = resolveOp('delete', gent);
    return opdesc;
}
function resolvePatch(opm, gent) {
    const opdesc = resolveOp('patch', gent);
    // If patch is actually update, make it update!
    if (null != opdesc && null == opm.update) {
        opm.update = opdesc;
        opm.update.name = 'update';
    }
    else {
        opm.patch = opdesc;
    }
    return opdesc;
}
function resolveOp(opname, gent) {
    let mop = undefined;
    let opdsec = gent.opm$[opname];
    if (opdsec) {
        mop = {
            name: opname,
            alts: opdsec.paths.map(p => {
                const parts = applyRename(p);
                const malt = {
                    orig: p.orig,
                    parts,
                    method: p.method,
                    args: {},
                    select: {
                        param: parts
                            .filter(p => '{' === p[0])
                            .map(p => p.substring(1, p.length - 1))
                            .reduce((a, p) => (a[p] = true, a), ('{id}' === (0, struct_1.getelem)(parts, -2) ? {
                            $action: (0, struct_1.getelem)(parts, -1)
                        } : {}))
                    },
                };
                return malt;
            })
        };
    }
    return mop;
}
function applyRename(pathdesc) {
    const prn = pathdesc.rename?.param ?? {};
    return pathdesc.parts.map(p => '{' === p[0] ? (prn[p.substring(1, p.length - 1)] ?? p) : p);
}
//# sourceMappingURL=operation.js.map