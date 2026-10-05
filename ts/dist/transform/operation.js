"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.operationTransform = void 0;
const utility_1 = require("../utility");
const heuristic01_1 = require("../guide/heuristic01");
const body_1 = require("./body");
const field_1 = require("./field");
const args_1 = require("./args");
const jostraca_1 = require("jostraca");
const types_1 = require("../types");
// The op names the transform resolves. Anything else under a guide path's
// `op` map is dropped, and an unknown name (a verb such as `merge`, or a
// typo) is dropped WITH A WARNING: guide.aontu is the only correction surface
// (ADR-002), so a correction that vanishes silently defeats it. A non-CRUD
// verb is declared as `action: <verb>: {}` beside a CRUD op on the same path.
const RESOLVED_OPS = ['load', 'list', 'create', 'update', 'remove', 'patch'];
// Emitted by the heuristic for HEAD and OPTIONS methods; no SDK operation
// exists for them yet, so they are skipped without a warning.
const IGNORED_OPS = ['head', 'options', 'OPTIONS'];
const operationTransform = async function (ctx) {
    const { apimodel, def, guide } = ctx;
    const kit = apimodel.main[types_1.KIT];
    let msg = 'operation ';
    (0, jostraca_1.each)(guide.entity, (gent, entname) => {
        if (!(0, utility_1.guideActive)(gent))
            return;
        collectOps(ctx, gent);
        const opm = {
            load: undefined,
            list: undefined,
            create: undefined,
            update: undefined,
            remove: undefined,
            patch: undefined,
        };
        const on = { gent, def, entname, guide };
        resolveLoad(opm, on);
        resolveList(opm, on);
        resolveCreate(opm, on);
        resolveUpdate(opm, on);
        resolveRemove(opm, on);
        resolvePatch(opm, on);
        // After patch has joined update, so each operation's routes are final.
        for (const mop of Object.values(opm)) {
            for (const mpoint of mop?.points ?? []) {
                if (heuristicRequest(on, mop, mpoint)) {
                    mpoint.t.req = undefined;
                }
                mpoint.t.req = mpoint.t.req ?? requestDefault(on, kit.entity[entname], opm, mop, mpoint);
                mpoint.t.res = mpoint.t.res ?? '`body`';
            }
        }
        kit.entity[entname].op = opm;
        msg += gent.name + ' ';
    });
    return { ok: true, msg };
};
exports.operationTransform = operationTransform;
function collectOps(ctx, gent) {
    ;
    gent.opm$ = gent.opm$ ?? {};
    (0, jostraca_1.each)(gent.paths$, (pathdesc) => {
        (0, jostraca_1.each)(pathdesc.op, (gop, opname) => {
            if (!(0, utility_1.guideActive)(gop)) {
                return;
            }
            if (!RESOLVED_OPS.includes(opname)) {
                if (!IGNORED_OPS.includes(opname)) {
                    ctx.warn?.({
                        note: `Unknown op "${opname}" on entity=${gent.name} path=${pathdesc.orig}` +
                            ` is dropped: only ${RESOLVED_OPS.join('/')} are resolved.` +
                            ` Declare a verb as \`action: ${opname}: {}\` beside a CRUD op on that path.`,
                        entity: gent.name,
                        path: pathdesc.orig,
                        op: opname,
                    });
                }
                return;
            }
            ;
            gent.opm$[opname] = gent.opm$[opname] ?? { paths: [] };
            const oppathdesc = {
                orig: pathdesc.orig,
                segments: pathdesc.segments,
                rename: pathdesc.rename,
                method: gop.method,
                op: gop,
                action: pathdesc.action,
                def: pathdesc.def,
            };
            gent.opm$[opname].paths.push(oppathdesc);
        });
    });
}
function resolveLoad(opm, on) {
    const opdesc = opm.load = resolveOp('load', on);
    return opdesc;
}
function resolveList(opm, on) {
    const opdesc = opm.list = resolveOp('list', on);
    return opdesc;
}
function resolveCreate(opm, on) {
    const opdesc = opm.create = resolveOp('create', on);
    return opdesc;
}
function resolveUpdate(opm, on) {
    const opdesc = opm.update = resolveOp('update', on);
    return opdesc;
}
function resolveRemove(opm, on) {
    const opdesc = opm.remove = resolveOp('remove', on);
    return opdesc;
}
function resolvePatch(opm, on) {
    const opdesc = resolveOp('patch', on);
    if (null != opdesc && (null == opm.update || onlyActionPaths(on.gent, 'update'))) {
        if (null != opm.update) {
            opdesc.points.push(...opm.update.points);
        }
        opm.update = opdesc;
        opm.update.name = 'update';
    }
    else {
        opm.patch = opdesc;
    }
    return opdesc;
}
// True when every path collected under the op carries a guide action.
function onlyActionPaths(gent, opname) {
    const paths = gent.opm$?.[opname]?.paths ?? [];
    return 0 < paths.length &&
        paths.every((p) => 0 < Object.keys(p.action ?? {}).length);
}
function resolveOp(opname, on) {
    let mop = undefined;
    let opdesc = on.gent.opm$[opname];
    if (opdesc) {
        mop = {
            name: opname,
            points: opdesc.paths.map((p) => {
                const segments = p.segments;
                const mpoint = {
                    o: p.orig,
                    s: segments,
                    r: p.rename,
                    m: p.method,
                    g: {},
                    t: { ...(p.op?.transform ?? {}) },
                    q: {
                        exist: []
                    }
                };
                return mpoint;
            })
        };
    }
    return mop;
}
// The request transform the heuristic took from the default body, still in
// place where the guide selects another media type for the point.
function heuristicRequest(on, mop, mpoint) {
    const chosen = (0, body_1.guideMedia)(on.guide, on.entname, mop.name, mpoint).body;
    if (null == chosen || null == mpoint.t.req)
        return false;
    const generated = (0, utility_1.bodyRequestTransform)((0, body_1.requestSchema)(on.def, mpoint.m, mpoint.o), [on.gent.name]);
    return null != generated && sameTransform(mpoint.t.req, generated);
}
function sameTransform(a, b) {
    const canon = (t) => 'string' === typeof t ? t :
        JSON.stringify(Object.keys(t ?? {}).sort().map((k) => [k, t[k]]));
    return canon(a) === canon(b);
}
// An array body is sent from one field of the request data, named for its
// records, and never for an argument of its operation, a field another route of
// its entity has, as fields span operations, or a carrier already named for an
// array of another type or requiredness. Decided here, not by the guide
// heuristic, as the guide's media type decides the body.
function requestDefault(on, ment, opm, mop, mpoint) {
    const media = (opname, q) => (0, body_1.guideMedia)(on.guide, on.entname, opname, q).body;
    const chosen = media(mop.name, mpoint);
    const list = (0, body_1.arrayRequestSchema)(on.def, mpoint.m, mpoint.o, chosen);
    if (null == list) {
        return (null == chosen ? undefined :
            (0, utility_1.bodyRequestTransform)((0, body_1.requestSchema)(on.def, mpoint.m, mpoint.o, chosen), [on.gent.name])) ?? '`reqdata`';
    }
    const required = true === (0, body_1.requestDecl)(on.def, mpoint.m, mpoint.o)?.required;
    const others = mop.points.filter((q) => q !== mpoint);
    const routes = Object.values(opm).flatMap((op) => (op?.points ?? []).filter((q) => q !== mpoint).map((q) => ({ opname: op.name, q })));
    const taken = [
        ...mop.points.flatMap((q) => (0, args_1.routeArgNames)(on.def, q)),
        ...routes.flatMap(({ opname, q }) => (0, field_1.routeFieldNames)(ment, opname, q, on.def, media(opname, q))),
        ...others.map((q) => (0, body_1.arrayCarrier)(on.def, q, media(mop.name, q)))
            .filter((carrier) => null != carrier &&
            !((0, body_1.sameType)(carrier.type, (0, body_1.nullableType)(list)) && carrier.required === required))
            .map((carrier) => carrier.name),
    ];
    return '`reqdata.' + (0, heuristic01_1.arrayBodyField)(list, on.entname, taken) + '`';
}
//# sourceMappingURL=operation.js.map