"use strict";
/* Copyright (c) 2024-2026 Voxgig, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.graphqlTransform = void 0;
exports.selectionFields = selectionFields;
exports.renderDoc = renderDoc;
const jostraca_1 = require("jostraca");
const types_1 = require("../types");
const graphql01_1 = require("../guide/graphql01");
const REL_STUB = '{ id }';
function pascal(s) {
    return s.replace(/(^|[_-])([a-z])/g, (_m, _p, c) => c.toUpperCase());
}
// Build the selection set for an entity type: every non-deprecated scalar,
// skipping fields that require arguments (they cannot appear in a fixed
// fragment without binding those arguments), plus an id stub per to-one
// relation. Sorted — byte-stability.
function selectionFields(typeName, def) {
    const gtype = def.types?.[typeName];
    if (null == gtype) {
        return [];
    }
    const out = [];
    for (const fname of Object.keys(gtype.fields)) {
        const f = gtype.fields[fname];
        if (f.deprecated) {
            continue;
        }
        if (f.args.some((a) => a.reqd)) {
            continue;
        }
        const ftype = def.types?.[f.type];
        const kind = ftype?.kind;
        if ('SCALAR' === kind || 'ENUM' === kind) {
            out.push(fname);
        }
        else if (('OBJECT' === kind || 'INTERFACE' === kind) && !f.list) {
            if (null != ftype.fields?.id) {
                out.push(fname + ' ' + REL_STUB);
            }
        }
    }
    return out.sort();
}
// Scalar fields of a payload type, for payloads that carry no entity. Used
// when there is nothing to spread a fragment on, so the operation still has
// a valid selection set.
function payloadScalarFields(typeName, def) {
    const gtype = def.types?.[typeName];
    if (null == gtype) {
        return [];
    }
    const out = [];
    for (const fname of Object.keys(gtype.fields)) {
        const f = gtype.fields[fname];
        const kind = def.types?.[f.type]?.kind;
        if (!f.deprecated && !f.args.some((a) => a.reqd) &&
            ('SCALAR' === kind || 'ENUM' === kind)) {
            out.push(fname);
        }
    }
    return out.sort();
}
function buildVars(fielddef, def) {
    const args = fielddef?.args ?? [];
    // The whole-request-body binding is the SINGLE-entity-input convention
    // (issueCreate(input: IssueCreateInput!)). A field taking several input
    // objects — items(filter: Filter, orderBy: OrderBy) — must bind each from
    // its own argument, or they all receive the same value and at least one
    // fails input validation.
    const inputs = args.filter((a) => {
        const atype = def.types?.[a.type];
        return null != atype && 'INPUT_OBJECT' === atype.kind;
    });
    const soleInput = 1 === inputs.length ? inputs[0].name : undefined;
    return args.map((arg) => {
        const v = {
            name: arg.name,
            from: arg.name === soleInput ? '' : arg.name,
            gqltype: arg.gqltype,
        };
        if (undefined !== arg.deflt) {
            v.deflt = arg.deflt;
        }
        return v;
    });
}
function argList(vars) {
    return 0 === vars.length ? '' :
        '(' + vars.map((v) => v.name + ': $' + v.name).join(', ') + ')';
}
// `($id: String!, $first: Int = 100)` — the operation's variable
// declarations. A schema default is carried through: without it a non-null
// argument that the schema makes omittable (`first: Int! = 100`) would fail
// variable coercion when the caller leaves it out.
function varDecl(vars) {
    return 0 === vars.length ? '' :
        '(' + vars.map((v) => '$' + v.name + ': ' + v.gqltype +
            (undefined === v.deflt ? '' :
                ' = ' + JSON.stringify(v.deflt))).join(', ') + ')';
}
function renderDoc(opname, optype, field, vars, selection, fragName, fragType, fragFields) {
    const doc = optype + ' ' + opname + varDecl(vars) +
        ' { ' + field + argList(vars) + ' ' + selection + ' }' +
        (0 < fragFields.length ?
            ' fragment ' + fragName + ' on ' + fragType +
                ' { ' + fragFields.join(' ') + ' }' : '');
    return doc.replace(/\s+/g, ' ').trim();
}
const graphqlTransform = async function (ctx) {
    const { apimodel, def, guide } = ctx;
    if (true !== def?.graphql) {
        return { ok: true, msg: 'graphql (skipped: not a graphql def)' };
    }
    const kit = apimodel.main[types_1.KIT];
    let msg = 'graphql ';
    (0, jostraca_1.each)(kit.entity, (ment, entname) => {
        const gent = guide.entity[entname];
        (0, jostraca_1.each)(ment.op, (mop, opname) => {
            (0, jostraca_1.each)(mop.points, (mpoint) => {
                const rootfield = mpoint.o;
                const gfield = gent?.field?.[rootfield];
                const optype = gfield?.op?.[opname]?.optype ?? 'query';
                const fielddef = 'mutation' === optype ?
                    def.mutation?.[rootfield] : def.query?.[rootfield];
                if (null == fielddef) {
                    return;
                }
                const ret = (0, graphql01_1.deriveRetShape)(fielddef, def.types ?? {});
                const entityType = ret.entity ?? '';
                const fragFields = selectionFields(entityType, def);
                const fragName = pascal(entname) + 'Fields';
                const fragSpread = 0 < fragFields.length ? '{ ...' + fragName + ' }' : '{ id }';
                const vars = buildVars(fielddef, def);
                let selection = fragSpread;
                let respath = 'body.data.' + rootfield;
                if ('connection' === ret.kind) {
                    const nodes = ret.nodes ?? 'nodes';
                    selection = 'nodes' === nodes ?
                        '{ nodes ' + fragSpread + ' pageInfo { endCursor hasNextPage } }' :
                        '{ edges { node ' + fragSpread + ' } pageInfo { endCursor hasNextPage } }';
                    respath = 'body.data.' + rootfield + '.' + nodes;
                }
                else if ('list' === ret.kind) {
                    selection = fragSpread;
                }
                else if ('payload' === ret.kind && null == ret.entity) {
                    const own = payloadScalarFields(fielddef.type, def);
                    selection = '{ ' + (0 < own.length ? own.join(' ') : '__typename') + ' }';
                    respath = 'body.data.' + rootfield;
                }
                else if ('payload' === ret.kind && null != ret.unwrap) {
                    // Mutation payload wrapper: select the entity inside it (plus the
                    // conventional success flag when present) and unwrap on the way
                    // back, so create/update return the entity exactly as REST does.
                    const payloadType = def.types?.[fielddef.type];
                    const hasSuccess = null != payloadType?.fields?.success;
                    selection = '{ ' + ret.unwrap + ' ' + fragSpread +
                        (hasSuccess ? ' success' : '') + ' }';
                    respath = 'body.data.' + rootfield + '.' + ret.unwrap;
                }
                const actionName = Object.keys(gfield?.action ?? {})[0];
                const docname = pascal(entname) + pascal(opname) +
                    (null != actionName ? pascal(actionName) : '');
                mpoint.k = 'graphql';
                mpoint.m = 'POST';
                mpoint.s = [];
                mpoint.gq = {
                    optype: optype,
                    field: rootfield,
                    doc: renderDoc(docname, optype, rootfield, vars, selection, fragName, entityType, fragFields),
                    vars,
                };
                mpoint.gq.entityType$ = entityType;
                if ('connection' === ret.kind) {
                    mpoint.gq.page = {
                        style: 'relay',
                        nodes: ret.nodes ?? 'nodes',
                        cursor: 'pageInfo.endCursor',
                        more: 'pageInfo.hasNextPage',
                    };
                }
                mpoint.t.res = '`' + respath + '`';
            });
        });
        msg += ment.name + ' ';
    });
    return { ok: true, msg };
};
exports.graphqlTransform = graphqlTransform;
//# sourceMappingURL=graphql.js.map