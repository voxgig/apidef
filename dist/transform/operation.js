"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.operationTransform = void 0;
const jostraca_1 = require("jostraca");
const utility_1 = require("../utility");
const operationTransform = async function (ctx) {
    const { apimodel, guide } = ctx;
    let msg = 'operation ';
    (0, jostraca_1.each)(guide.entity, (gent, entname) => {
        const opm = {
            load: undefined,
            list: undefined,
            create: undefined,
            update: undefined,
            delete: undefined,
            patch: undefined,
        };
        collectOps(gent);
        // console.log(entname, formatJSONIC(gent, { $: true }))
        resolveLoad(opm, gent);
        resolveList(opm, gent);
        resolveCreate(opm, gent);
        resolveUpdate(opm, gent);
        resolveDelete(opm, gent);
        resolvePatch(opm, gent);
        // per path add select:param:name = false for params from other paths
        // updateSelect(opm)
        console.log('OPM', entname, (0, utility_1.formatJSONIC)(opm));
        apimodel.main.sdk.entity[entname].op = opm;
        msg += gent.name + ' ';
    });
    console.log('=== operationTransform ===');
    console.log((0, utility_1.formatJSONIC)(apimodel.main.sdk.entity));
    return { ok: true, msg };
};
exports.operationTransform = operationTransform;
function collectOps(gent) {
    gent.op$ = gent.op$ ?? {};
    (0, jostraca_1.each)(gent.pathlist$, (gpath) => {
        (0, jostraca_1.each)(gpath.op, (gop, opname) => {
            gent.op$[opname] = gent.op$[opname] ?? { paths: [] };
            const pdef = {
                ...gpath,
                method: gop.method ?? 'GET'
            };
            delete pdef.op;
            gent.op$[opname].paths.push(pdef);
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
    let opdesc = undefined;
    let opraw = gent.op$[opname];
    if (opraw) {
        opdesc = {
            name: opname,
            alt: opraw.paths.map(p => {
                const parts = applyRename(p);
                return {
                    orig: p.orig,
                    parts,
                    method: p.method,
                    select: {
                        param: parts
                            .filter(p => '{' === p[0])
                            .map(p => p.substring(1, p.length - 1))
                            .reduce((a, p) => (a[p] = true, a), {})
                    }
                };
            })
        };
    }
    return opdesc;
}
function applyRename(rawpath) {
    const prn = rawpath.rename?.param ?? {};
    return rawpath.parts.map(p => '{' === p[0] ? (prn[p.substring(1, p.length - 1)] ?? p) : p);
}
//# sourceMappingURL=operation.js.map