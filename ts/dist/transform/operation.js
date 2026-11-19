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
// Emitted by the heuristic for HEAD, OPTIONS and TRACE methods; no SDK operation
// exists for them yet, so they are skipped without a warning.
const IGNORED_OPS = ['head', 'options', 'OPTIONS', 'TRACE'];
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
        resolveActionCreate(ctx, opm, on);
        // After patch has joined update, so each operation's routes are final.
        for (const mop of Object.values(opm)) {
            for (const mpoint of mop?.points ?? []) {
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
// A create made only of actions on the record creates nothing: its points ride
// along into the entity's own update, as update's do when a PATCH is promoted.
function resolveActionCreate(ctx, opm, on) {
    if (null == opm.create || !onlyActionPaths(on.gent, 'create')) {
        return;
    }
    const opm$ = on.gent.opm$;
    const paths = opm$.create.paths;
    const updatePaths = [
        ...(opm$.update?.paths ?? []),
        ...(null == opm.patch ? (opm$.patch?.paths ?? []) : []),
    ];
    if (null != opm.update && updatePaths.some((p) => !hasAction(p)) &&
        paths.every(addressesRecord)) {
        opm.update.points.push(...opm.create.points);
        opm.create = undefined;
        return;
    }
    const verbs = [...new Set(paths.flatMap((p) => Object.keys(p.action ?? {})))].sort();
    ctx.warn?.({
        note: `Create on entity=${on.gent.name} has no route of its own, only the action ` +
            `${verbs.join(', ')}, so a plain create sends it. Set the route's op in the ` +
            `guide if it should not.`,
        entity: on.gent.name,
        op: 'create',
    });
}
// A custom method's `{id}:verb` keeps its placeholder in a literal, so the
// rename is what names the record there.
function addressesRecord(p) {
    return Object.values(p.rename?.param ?? {})
        .some((to) => 'id' === ('string' === typeof to ? to : to?.target)) ||
        p.segments.some((seg) => 'id' === seg.var);
}
function hasAction(p) {
    return 0 < Object.keys(p.action ?? {}).length;
}
// True when every path collected under the op carries a guide action.
function onlyActionPaths(gent, opname) {
    const paths = gent.opm$?.[opname]?.paths ?? [];
    return 0 < paths.length && paths.every(hasAction);
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
// The request transform of a point whose guide sets none, read from the body
// the guide names: an object wraps the record under the entity's name or sends
// a closed body's own properties; an array is sent from a field named for its
// records, never for an argument, another route's field, or a carrier already
// named for an array of another type or requiredness.
function requestDefault(on, ment, opm, mop, mpoint) {
    const media = (opname, q) => (0, body_1.guideMedia)(on.guide, on.entname, opname, q).body;
    const chosen = media(mop.name, mpoint);
    const list = (0, body_1.arrayRequestSchema)(on.def, mpoint.m, mpoint.o, chosen);
    if (null == list) {
        return (0, utility_1.bodyRequestTransform)(objectSchema(on.def, mpoint, chosen), [on.gent.name]) ?? '`reqdata`';
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
// The object body a point sends: under the media type the guide names, else
// the preferred one, else a schema declared on the request body itself.
function objectSchema(def, mpoint, chosen) {
    const declared = def?.paths?.[mpoint.o]?.[String(mpoint.m).toLowerCase()]?.requestBody;
    return (0, body_1.requestSchema)(def, mpoint.m, mpoint.o, chosen) ??
        (null == chosen && null != declared && 'object' === typeof declared ? declared.schema : undefined);
}
//# sourceMappingURL=operation.js.map