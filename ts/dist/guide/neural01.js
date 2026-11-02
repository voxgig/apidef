"use strict";
/* Copyright (c) 2026 Voxgig, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NETS = void 0;
exports.neural01 = neural01;
// The neural guide strategy: each per-route classification is a small
// network over named features, with weights set by hand (see
// docs/design/neural-guide.md); the relational measurements and the
// post-passes are the heuristic's own, reused.
const jostraca_1 = require("jostraca");
const struct_1 = require("@voxgig/struct");
const utility_1 = require("../utility");
const refcount_1 = require("../refcount");
const entity_1 = require("../transform/entity");
const body_1 = require("../transform/body");
const heuristic01_1 = require("./heuristic01");
const nn_1 = require("./nn");
const IS_ENTCMP_METHOD_RATE = 0.21;
const IS_ENTCMP_PATH_RATE = 0.41;
const PATH_NAME_INDEX = {
    't/p/t/': 2, 't/p/': 0, 'p/t/': 1, 't/': 0, 't/p/p': 0,
};
const METHOD_CONSIDER_ORDER = {
    GET: 100, QUERY: 150, POST: 200, PUT: 300, PATCH: 400, DELETE: 500, HEAD: 600, OPTIONS: 700,
};
const METHOD_FEATURES = {
    GET: 'm_get', QUERY: 'm_query', POST: 'm_post', PUT: 'm_put', PATCH: 'm_patch',
    DELETE: 'm_delete', HEAD: 'm_head', OPTIONS: 'm_options',
};
const SHAPE_FEATURES = {
    't/p/t/': 'shape_tpt', 't/p/': 'shape_tp', 'p/t/': 'shape_pt', 't/': 'shape_t', 't/p/p': 'shape_tpp',
};
// Rectified units are gates: a conjunction of k inputs has unit weights and
// bias 1-k, a negated input weight -1, so each fires at exactly 1.
const PROBABLE_NET = (0, nn_1.makeNet)(['nores', 'has_body', 'm_post', 'm_put', 'm_patch', 'm_query', 'm_get',
    'ends_p_slash', 'lit_in_other_paths'], {
    nores: { b: 0, w: { nores: 1 } },
    post_body: { b: -2, w: { has_body: 1, m_post: 1, ends_p_slash: -1, lit_in_other_paths: 1 } },
    putish: { b: -2, w: { has_body: 1, m_put: 1, m_patch: 1, ends_p_slash: 1 } },
    query_body: { b: -1, w: { has_body: 1, m_query: 1 } },
    get_nobody: { b: 0, w: { m_get: 1, has_body: -1 } },
}, {
    YES: { b: 0, w: { nores: 3, post_body: 3, putish: 3, query_body: 3, get_nobody: 3 } },
    NO: { b: 1, w: {} },
});
const CMP_KEEP_NET = (0, nn_1.makeNet)(['single', 'in_path', 'occurs', 'infrequent'], {
    keep: { b: 0, w: { single: 1, in_path: 1, occurs: 1, infrequent: 1 } },
}, {
    KEEP: { b: 0, w: { keep: 3 } },
    DROP: { b: 1, w: {} },
});
const CMP_SOURCE_NET = (0, nn_1.makeNet)(['cmp_avail', 'tag_avail', 'tag_is_cmp', 'tag_in_path', 'tag_eq_cmp'], {
    cmp: { b: 0, w: { cmp_avail: 1 } },
    tag_only: { b: 0, w: { tag_avail: 1, cmp_avail: -1 } },
    tag_over: { b: -3, w: { cmp_avail: 1, tag_avail: 1, tag_is_cmp: 1, tag_in_path: 1, tag_eq_cmp: -1 } },
}, {
    CMP: { b: 0, w: { cmp: 2, tag_over: -3 } },
    TAG: { b: 0, w: { tag_only: 2, tag_over: 3 } },
    NONE: { b: 1, w: {} },
});
const OP_NET = (0, nn_1.makeNet)(['m_get', 'm_query', 'm_post', 'm_put', 'm_patch', 'm_delete', 'm_head', 'm_options',
    'end_param_anchored', 'end_param_bare', 'res_array', 'res_array_prop'], {
    read: { b: 0, w: { m_get: 1, m_query: 1 } },
    list_array: { b: -1, w: { m_get: 1, m_query: 1, end_param_anchored: -1, res_array: 1 } },
    list_prop: {
        b: -1,
        w: { m_get: 1, m_query: 1, end_param_anchored: -1, end_param_bare: -1, res_array_prop: 1 },
    },
    post: { b: 0, w: { m_post: 1 } },
    put: { b: 0, w: { m_put: 1 } },
    patch: { b: 0, w: { m_patch: 1 } },
    delete: { b: 0, w: { m_delete: 1 } },
    head: { b: 0, w: { m_head: 1 } },
    options: { b: 0, w: { m_options: 1 } },
}, {
    list: { b: 0, w: { list_array: 5, list_prop: 5 } },
    load: { b: 0, w: { read: 3 } },
    create: { b: 0, w: { post: 5 } },
    update: { b: 0, w: { put: 5 } },
    patch: { b: 0, w: { patch: 5 } },
    remove: { b: 0, w: { delete: 5 } },
    head: { b: 0, w: { head: 5 } },
    OPTIONS: { b: 0, w: { options: 5 } },
});
const NAME_NET = (0, nn_1.makeNet)(['shaped', 'shape_tpt', 'cmp_avail', 'cmp_from_tag', 'cmp_ne_path', 'cmp_qualifies',
    'cmp_infrequent', 'cmp_shared', 'cmp_in_path', 'probable', 'm_delete', 'm_write',
    'delcmp_avail', 'cmp_occur_le1', 'last_lit_singular', 'cmp_not_verb',
    'item_route_exists', 'route_not_extended', 'last_is_cmp', 'path_has_children',
    'same_path_avail', 'opid_avail', 'title_avail', 'seg_avail',
    'tag_item_route', 'tag_cmp_is_record', 'collrec_avail', 'tag_collides'], {
    shaped: { b: 0, w: { shaped: 1 } },
    coll_record: {
        b: -3, w: { cmp_from_tag: 1, tag_item_route: 1, tag_cmp_is_record: 1, collrec_avail: 1 },
    },
    coll_segment: {
        b: -2, w: { cmp_from_tag: 1, tag_item_route: 1, tag_cmp_is_record: -1, tag_collides: 1 },
    },
    same_path: { b: -1, w: { cmp_from_tag: 1, same_path_avail: 1 } },
    vop: {
        b: -7,
        w: {
            shape_tpt: 1, cmp_avail: 1, m_write: 1, cmp_occur_le1: 1, last_lit_singular: 1,
            cmp_not_verb: 1, item_route_exists: 1, route_not_extended: 1,
        },
    },
    cmp_qualifies: { b: -3, w: { shaped: 1, cmp_avail: 1, cmp_ne_path: 1, cmp_qualifies: 1 } },
    cmp_primary: {
        b: -3, w: { shaped: 1, cmp_avail: 1, cmp_ne_path: 1, cmp_infrequent: 1, cmp_shared: -1 },
    },
    cmp_in_path: { b: -3, w: { shaped: 1, cmp_avail: 1, cmp_ne_path: 1, cmp_in_path: 1 } },
    delete_cmp: { b: -3, w: { shaped: 1, m_delete: 1, cmp_avail: -1, delcmp_avail: 1, probable: 1 } },
    tpt_last_cmp: { b: -2, w: { shape_tpt: 1, cmp_avail: -1, probable: 1, last_is_cmp: 1 } },
    tpt_last_child: { b: -2, w: { shape_tpt: 1, cmp_avail: -1, probable: 1, path_has_children: 1 } },
    tpt_part: { b: -1, w: { shape_tpt: 1, cmp_avail: -1, probable: 1 } },
    tpt_act: { b: 0, w: { shape_tpt: 1, cmp_avail: -1, probable: -1 } },
    none_opid: { b: 0, w: { shaped: -1, opid_avail: 1 } },
    none_title: { b: 0, w: { shaped: -1, title_avail: 1 } },
    none_seg: { b: 0, w: { shaped: -1, seg_avail: 1 } },
}, {
    COLLREC: { b: 0, w: { coll_record: 30 } },
    COLLSEG: { b: 0, w: { coll_segment: 30 } },
    SAMEPATH: { b: 0, w: { same_path: 20 } },
    PARENT: { b: 0, w: { vop: 10 } },
    CMPQ: { b: 0, w: { cmp_qualifies: 6 } },
    CMP: { b: 0, w: { cmp_primary: 5, cmp_in_path: 4 } },
    DELCMP: { b: 0, w: { delete_cmp: 5 } },
    LAST: { b: 0, w: { tpt_last_cmp: 4, tpt_last_child: 4 } },
    PART: { b: 0, w: { tpt_part: 3 } },
    ACT: { b: 0, w: { tpt_act: 4 } },
    PATH: { b: 0, w: { shaped: 1.5 } },
    OPID: { b: 0, w: { none_opid: 6 } },
    TITLE: { b: 0, w: { none_title: 5 } },
    SEG: { b: 0, w: { none_seg: 4 } },
    NONE: { b: 0.5, w: {} },
});
const ACTION_NET = (0, nn_1.makeNet)(['same_path', 'vop_chosen', 'last_verb', 'l2_is_ent', 'l3_is_ent', 'l4_is_ent',
    'l2_param', 'l3_param', 'l2_verb', 'ent_endswith_last', 'ent_endswith_compound'], {
    act_vop: { b: -1, w: { vop_chosen: 1, last_verb: 1, same_path: -1 } },
    act_l2: {
        b: -1,
        w: { l2_is_ent: 1, last_verb: 1, vop_chosen: -1, same_path: -1, ent_endswith_last: -1 },
    },
    act_l3: {
        b: -2,
        w: {
            l3_is_ent: 1, l2_param: 1, last_verb: 1, vop_chosen: -1, l2_is_ent: -1, same_path: -1,
            ent_endswith_last: -1,
        },
    },
    act_l4: {
        b: -3,
        w: {
            l4_is_ent: 1, l3_param: 1, l2_verb: 1, last_verb: 1, vop_chosen: -1, l2_is_ent: -1,
            l3_is_ent: -1, same_path: -1, ent_endswith_compound: -1,
        },
    },
}, {
    NONE: { b: 1, w: {} },
    LAST: { b: 0, w: { act_vop: 5, act_l2: 4, act_l3: 4 } },
    COMPOUND: { b: 0, w: { act_l4: 4 } },
});
const PARAM_NET = (0, nn_1.makeNet)(['pp_shape', 'last', 'second_last', 'not_last', 'has_parent', 'idx_gt1', 'exact_id',
    'idlike', 'parent_eq_ent', 'ent_starts_parent', 'ent_ends_parent', 'name_param',
    'canon_eq_ent', 'snake_differs', 'parent_id_differs'], {
    b1_action: {
        b: -4,
        w: {
            idlike: 1, has_parent: 1, not_last: 1, second_last: 1, parent_eq_ent: -1,
            ent_starts_parent: 1,
        },
    },
    b1_parent_ent: { b: -3, w: { idlike: 1, has_parent: 1, not_last: 1, parent_eq_ent: 1 } },
    b1_parent_id: { b: -2, w: { idlike: 1, has_parent: 1, not_last: 1, name_param: -1 } },
    b2_noparent: { b: 0, w: { last: 1, exact_id: -1, has_parent: -1 } },
    b2_parent_ent: { b: -1, w: { last: 1, exact_id: -1, parent_eq_ent: 1 } },
    b2_ends_parent: { b: -1, w: { last: 1, exact_id: -1, ent_ends_parent: 1 } },
    b3_end_action: {
        b: -4,
        w: {
            not_last: 1, idx_gt1: 1, has_parent: 1, idlike: -1, second_last: 1, exact_id: -1,
            canon_eq_ent: 1,
        },
    },
    b3_not_primary: {
        b: -3,
        w: {
            not_last: 1, idx_gt1: 1, has_parent: 1, idlike: -1, second_last: -1,
            parent_id_differs: 1, name_param: -1,
        },
    },
    snake: { b: 0, w: { snake_differs: 1 } },
    pp: { b: 0, w: { pp_shape: 1 } },
}, {
    ID: {
        b: 0,
        w: {
            b1_action: 6, b1_parent_ent: 6, b2_noparent: 5, b2_parent_ent: 5, b2_ends_parent: 5,
            b3_end_action: 4, pp: -20,
        },
    },
    PARENT_ID: { b: 0, w: { b1_parent_id: 5, b3_not_primary: 4, pp: -20 } },
    SNAKE: { b: 0, w: { snake: 2 } },
    KEEP: { b: 1, w: {} },
});
const NETS = {
    probable: PROBABLE_NET,
    cmpKeep: CMP_KEEP_NET,
    cmpSource: CMP_SOURCE_NET,
    op: OP_NET,
    name: NAME_NET,
    action: ACTION_NET,
    param: PARAM_NET,
};
exports.NETS = NETS;
function isPathItem(key, pathdef) {
    return !String(key).startsWith('x-') &&
        null != pathdef && 'object' === typeof pathdef && !Array.isArray(pathdef);
}
function isParam(part) {
    return null != part && '{' === part[0] && '}' === part[part.length - 1];
}
function getResponseSchema(response) {
    return response?.content?.['application/json']?.schema ?? response?.schema;
}
function successResponse(responses) {
    return responses?.[200] ?? responses?.[201] ?? responses?.[202];
}
function successSchemas(responses) {
    return ['200', '201']
        .map((code) => getResponseSchema(responses?.[code]))
        .filter((schema) => null != schema);
}
function refSchema(def, xref) {
    if (!xref.startsWith('#/')) {
        return undefined;
    }
    let node = def;
    for (const seg of xref.slice(2).split('/')) {
        const key = seg.replace(/~1/g, '/').replace(/~0/g, '~');
        node = null != node && 'object' === typeof node &&
            Object.prototype.hasOwnProperty.call(node, key) ? node[key] : undefined;
    }
    return node;
}
function declaresId(schema) {
    return null != (0, utility_1.mergedProperties)(schema)?.id;
}
// Cloned per part, since the definition shares one object per reference.
function resolveSchemaProperties(schema) {
    let properties = {};
    if (Array.isArray(schema.allOf)) {
        for (let i = schema.allOf.length - 1; -1 < i; --i) {
            properties = (0, struct_1.merge)([properties, (0, struct_1.clone)(schema.allOf[i]?.properties || {})]);
        }
    }
    if (schema.properties) {
        properties = (0, struct_1.merge)([properties, (0, struct_1.clone)(schema.properties)]);
    }
    return properties;
}
function getRequestBodySchema(def, route) {
    return (0, body_1.requestSchema)(def, route.method, route.path) ?? route.requestBody?.schema;
}
function fired(net, d, unit) {
    const i = net.layers[0].outputs.indexOf(unit);
    return -1 < i && 0 < d.hidden[i];
}
function bit(v) {
    return v ? 1 : 0;
}
function collectRoutes(def) {
    const routes = [];
    for (const [path, pdef] of (0, utility_1.sortedEntries)(def.paths)) {
        if (!isPathItem(path, pdef)) {
            continue;
        }
        const parts = path.split('/').filter((p) => '' !== p);
        for (const [m, mdef] of (0, utility_1.sortedEntries)(pdef)) {
            const method = m.toUpperCase();
            if (null == METHOD_CONSIDER_ORDER[method] ||
                null == mdef || 'object' !== typeof mdef || Array.isArray(mdef)) {
                continue;
            }
            routes.push({
                path,
                method,
                parts,
                pm: (0, heuristic01_1.matchEntityPath)(parts),
                operationId: mdef.operationId,
                tags: Array.isArray(mdef.tags) ? mdef.tags : [],
                responses: mdef.responses,
                requestBody: mdef.requestBody,
                security: mdef.security,
                deprecated: true === mdef.deprecated,
                why_op: [],
                cmp: null,
                why_cmp: [],
            });
        }
    }
    routes.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 :
        METHOD_CONSIDER_ORDER[a.method] - METHOD_CONSIDER_ORDER[b.method]);
    return routes;
}
function measureMetrics(work) {
    const metrics = work.guide.metrics;
    const def = work.def;
    for (const [path, pathdef] of (0, utility_1.sortedEntries)(def.paths)) {
        if (!isPathItem(path, pathdef)) {
            continue;
        }
        metrics.count.path++;
        for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'query']) {
            metrics.count.method += pathdef[method] ? 1 : 0;
        }
        for (const key of (0, utility_1.sortedKeys)(pathdef)) {
            const tags = pathdef[key]?.tags;
            if (!Array.isArray(tags)) {
                continue;
            }
            for (const tag of tags) {
                if ('string' === typeof tag && 0 < tag.length && !metrics.found.tag[tag]) {
                    metrics.count.tag++;
                    metrics.found.tag[tag] = { name: tag, canon: (0, utility_1.canonize)(tag) };
                }
            }
        }
        for (const part of path.split('/')) {
            if ('' !== part && !isParam(part)) {
                work.pathLiterals[(0, utility_1.canonize)(part)] = true;
            }
        }
    }
    const counts = (0, refcount_1.countRefs)(def);
    for (const xref of Object.keys(counts).sort(refcount_1.byCodePoint)) {
        const m = xref.match(/\/(components\/schemas|definitions)\/(.+)$/);
        if (null == m) {
            continue;
        }
        const name = (0, utility_1.canonizeCmpName)(m[2]);
        if (null == metrics.count.origcmprefs[name]) {
            metrics.count.cmp++;
            metrics.count.origcmprefs[name] = 0;
        }
        metrics.count.origcmprefs[name] = (0, refcount_1.satAdd)(metrics.count.origcmprefs[name], counts[xref]);
        if (null == metrics.found.cmp[name]) {
            metrics.found.cmp[name] = { orig: m[2] };
        }
    }
}
function opFeatures(route) {
    const x = {};
    x[METHOD_FEATURES[route.method]] = 1;
    const pm = route.pm;
    const anchored = null != pm && pm.expr.endsWith('p/');
    x.end_param_anchored = bit(anchored);
    x.end_param_bare = bit(null != pm && !anchored && pm.expr.endsWith('p'));
    const schema = getResponseSchema(successResponse(route.responses));
    if (null != schema) {
        x.res_array = bit('array' === schema.type);
        const props = resolveSchemaProperties(schema);
        x.res_array_prop = bit(Object.values(props).some((prop) => 'array' === prop?.type));
    }
    return x;
}
function resolveOp(route) {
    const d = (0, nn_1.decide)(OP_NET, opFeatures(route));
    route.op = d.cls;
    route.why_op = [(0, nn_1.explain)('op', d)];
}
function measureEnvelope(work) {
    for (const route of work.routes) {
        const opname = route.op;
        const unwrapref = getResponseSchema(successResponse(route.responses))?.['x-ref'];
        for (const schema of successSchemas(route.responses)) {
            const xref = schema['x-ref'];
            if (null == xref) {
                continue;
            }
            const itemref = null == opname || xref !== unwrapref ? null :
                (0, utility_1.envelopeItemRef)(schema, opname);
            work.envelope[xref] = '' === work.envelope[xref] || null == itemref ? '' : itemref;
            work.listEnvelope[xref] = 'list' === opname;
            (work.envelopePaths[xref] = work.envelopePaths[xref] ?? []).push(route.path);
        }
    }
    const carriers = Object.create(null);
    for (const xref of Object.keys(work.envelope)) {
        if ('' !== work.envelope[xref]) {
            (carriers[work.envelope[xref]] = carriers[work.envelope[xref]] ?? []).push(xref);
        }
    }
    for (const xrefs of Object.values(carriers)) {
        if (1 < xrefs.length && !isPageAndItsItem(work, xrefs)) {
            xrefs.forEach((xref) => work.envelope[xref] = '');
        }
    }
    work.answered = (0, heuristic01_1.answeredRefs)(work.def, work.envelope);
}
function isPageAndItsItem(work, xrefs) {
    const pages = xrefs.filter((xref) => work.listEnvelope[xref]);
    const items = xrefs.filter((xref) => !work.listEnvelope[xref]);
    if (1 !== pages.length || 1 !== items.length) {
        return false;
    }
    const shape = (path) => path.replace(/\{[^}]+\}/g, '{}').replace(/\/+$/, '') || '/';
    const under = work.envelopePaths[pages[0]].map(shape);
    return work.envelopePaths[items[0]].map(shape).some((path) => under.some((page) => path === page || path.startsWith(page + '/')));
}
function potentialRefs(work, route, why) {
    const xrefs = [];
    for (const schema of (0, heuristic01_1.namingSchemas)(route.method, route.responses, work.answered, work.envelope)) {
        const ref = (0, heuristic01_1.namingRef)(schema, work.envelope);
        if (null != ref) {
            if (null != schema['x-ref'] && ref !== schema['x-ref']) {
                why.push('envelope=' + (0, utility_1.cmpRefName)(schema['x-ref']));
            }
            xrefs.push(ref);
        }
    }
    return xrefs;
}
function measureSharing(work) {
    const sharing = work.sharing;
    for (const route of work.routes) {
        for (const xref of potentialRefs(work, route, [])) {
            const m = xref.match(/\/(components\/schemas|definitions)\/(.+)$/);
            if (null == m) {
                continue;
            }
            const cmp = (0, utility_1.canonizeCmpName)(m[2]);
            const record = declaresId(refSchema(work.def, xref));
            sharing.routes.push({ cmp, method: route.method, path: route.path, op: route.op ?? '' });
            sharing.records[cmp] = true === sharing.records[cmp] || record;
            const resource = (0, heuristic01_1.pathResource)(route.parts, route.method);
            if (record && null != resource) {
                work.recordResources[resource] = true;
            }
        }
    }
    const records = Object.keys(sharing.records).filter((cmp) => sharing.records[cmp]);
    for (const key of (0, heuristic01_1.sharedRoutes)(sharing.routes, records)) {
        sharing.yields[key] = true;
    }
}
function infrequent(metrics, origcmpref) {
    const cmprefs = metrics.count.origcmprefs[origcmpref] ?? 0;
    const mcount = metrics.count.method;
    const pcount = metrics.count.path;
    const method_rate = 0 < mcount ? cmprefs / mcount : -1;
    const path_rate = 0 < pcount ? cmprefs / pcount : -1;
    return method_rate < IS_ENTCMP_METHOD_RATE || path_rate < IS_ENTCMP_PATH_RATE;
}
function resolveCmp(work, route) {
    const metrics = work.guide.metrics;
    const why = [];
    const lowerpath = route.path.toLowerCase();
    const cmpxrefs = potentialRefs(work, route, why)
        .filter((val) => val.includes('schema') || val.includes('definitions'))
        .map((val) => {
        const m = val.match(/\/components\/schemas\/(.+)$/) ?? val.match(/\/definitions\/(.+)$/);
        const origcmpref = null == m ? null : (0, utility_1.canonizeCmpName)(m[1]);
        return { val, origcmp: null == m ? '' : m[1], origcmpref, cmp: origcmpref ?? '' };
    })
        .filter((xref) => null != xref.origcmpref && !xref.val.includes('Meta'));
    for (const xref of cmpxrefs) {
        xref.cmp = (0, utility_1.cleanComponentName)(xref.cmp, (n) => null != metrics.count.origcmprefs[n]);
    }
    const kept = cmpxrefs.filter((xref) => {
        const d = (0, nn_1.decide)(CMP_KEEP_NET, {
            single: bit(cmpxrefs.length <= 1),
            in_path: bit(lowerpath.includes('/' + xref.cmp + '/')),
            occurs: bit(route.parts.some((p) => '{' !== p[0] && (0, utility_1.canonize)(p.toLowerCase()) === xref.cmp)),
            infrequent: bit(infrequent(metrics, xref.origcmpref)),
        });
        why.push((0, nn_1.explain)('cmp:' + xref.cmp, d));
        return 'KEEP' === d.cls;
    });
    const fcmp = kept[0];
    const ftag = route.tags.find((tag) => {
        const canon = metrics.found.tag[tag]?.canon;
        return null != canon && (!!metrics.found.cmp[canon] || null == fcmp);
    });
    const tagcanon = null == ftag ? null : metrics.found.tag[ftag].canon;
    const d = (0, nn_1.decide)(CMP_SOURCE_NET, {
        cmp_avail: bit(null != fcmp),
        tag_avail: bit(null != tagcanon),
        tag_is_cmp: bit(null != tagcanon && !!metrics.found.cmp[tagcanon]),
        tag_in_path: bit(null != ftag &&
            (route.path.includes('/' + ftag + '/') || route.path.includes('/' + tagcanon + '/'))),
        tag_eq_cmp: bit(null != fcmp && null != tagcanon && fcmp.cmp === tagcanon),
    });
    why.push((0, nn_1.explain)('source', d));
    let out = null;
    if ('CMP' === d.cls && null != fcmp) {
        out = {
            ref: fcmp.val, cmp: fcmp.cmp, origcmp: fcmp.origcmp, origcmpref: fcmp.origcmpref,
            cmpoccur: 0, path_rate: 0, method_rate: 0,
        };
    }
    else if ('TAG' === d.cls && null != ftag && null != tagcanon) {
        out = {
            ref: 'tag', cmp: tagcanon, origcmp: ftag, origcmpref: null,
            cmpoccur: 0, path_rate: 0, method_rate: 0,
        };
        if (null != fcmp) {
            out.rescmp = fcmp.cmp;
            out.rescmpoccur = metrics.count.origcmprefs[fcmp.origcmpref ?? ''] ?? 0;
        }
    }
    if (null != out) {
        out.cmpoccur = metrics.count.origcmprefs[out.origcmpref ?? ''] ?? 0;
        out.path_rate = 0 === metrics.count.path ? -1 : out.cmpoccur / metrics.count.path;
        out.method_rate = 0 === metrics.count.method ? -1 : out.cmpoccur / metrics.count.method;
    }
    route.cmp = out;
    route.why_cmp = why;
}
function probableFeatures(work, route, pm) {
    const x = {};
    x[METHOD_FEATURES[route.method]] = 1;
    const response = route.responses?.['201'] || route.responses?.['200'];
    const resSchema = getResponseSchema(response);
    x.nores = bit(null == resSchema && null != route.responses?.['204']);
    x.has_body = bit(null != getRequestBodySchema(work.def, route));
    x.ends_p_slash = bit(pm.expr.endsWith('/p/'));
    const last = pm[pm.length - 1];
    x.lit_in_other_paths = bit(1 < (0, utility_1.sortedKeys)(work.def.paths)
        .filter((path) => path.includes('/' + last + '/')).length);
    return x;
}
// Every component a response of any of the path's methods names.
function uniqueResponseCmps(def, path) {
    const names = new Set();
    for (const mdef of Object.values(def.paths?.[path] ?? {})) {
        for (const found of (0, utility_1.find)(mdef?.responses, 'x-ref')) {
            const m = String(found.val).match(/\/(components\/schemas|definitions)\/(.+)$/);
            if (null != m) {
                names.add(m[2]);
            }
        }
    }
    return Array.from(names).map((n) => ({ cmp: (0, utility_1.canonizeCmpName)(n), origcmp: n }));
}
// The collection of an item route whose method its tag alone names, when the
// route answers nothing.
function tagItemCollection(work, route) {
    const cmp = route.cmp;
    if (null == cmp || 'tag' !== cmp.ref || null != cmp.rescmp) {
        return null;
    }
    const parts = route.parts;
    const lits = parts.slice(0, parts.findIndex(isParam));
    if (0 === lits.length || !parts.slice(lits.length).every(isParam)) {
        return null;
    }
    const answers = Object.entries(work.def?.paths?.[route.path] ?? {})
        .some(([method, mdef]) => null != METHOD_CONSIDER_ORDER[method.toUpperCase()] &&
        null != getResponseSchema(successResponse(mdef?.responses)));
    return answers ? null : '/' + lits.join('/');
}
function measureTagItems(work, route) {
    const collection = tagItemCollection(work, route);
    if (null == collection) {
        return;
    }
    const cmp = route.cmp.cmp;
    const items = work.tagItems[cmp] = work.tagItems[cmp] ?? {};
    items[collection] = items[collection] ?? {};
    items[collection][route.parts.filter(isParam)
        .map((part) => (0, utility_1.canonizeParam)(part.slice(1, -1))).sort().join(',')] = true;
}
function pathReads(pathdef) {
    return Object.entries(pathdef ?? {}).some(([method, mdef]) => 'GET' === method.toUpperCase() && null != mdef);
}
// Two of a tag's collections whose item routes take the same parameters, or
// that are both read, would share a selector on the tag's entity.
function tagCollides(def, items) {
    const seen = Object.create(null);
    let reads = 0;
    for (const [collection, params] of Object.entries(items)) {
        for (const key of Object.keys(params)) {
            if (seen[key]) {
                return true;
            }
            seen[key] = true;
        }
        if (pathReads(def.paths?.[collection]) || pathReads(def.paths?.[collection + '/'])) {
            reads++;
        }
    }
    return 1 < reads;
}
function outsideCollection(path, collection) {
    if (!(path + '/').startsWith(collection + '/')) {
        return true;
    }
    const parts = path.split('/').filter((part) => '' !== part);
    const first = parts.findIndex(isParam);
    return -1 < first && collection !== '/' + parts.slice(0, first).join('/');
}
function keyHeld(work, keys, collection, exempt) {
    return keys.some((key) => [work.entmap[key]?.path, work.claims[key]]
        .some((paths) => Object.keys(paths ?? {}).some((path) => outsideCollection(path, collection) && true !== exempt?.(path))));
}
function segmentHeld(work, name, collection, exempt) {
    return keyHeld(work, [name, (0, utility_1.ensureMinEntityName)(name, {}),
        (0, utility_1.ensureMinEntityName)(name, work.entmap)], collection, exempt);
}
function tagNamesRoute(work, path, cmp) {
    const methods = work.routes.filter((r) => path === r.path);
    return 0 < methods.length && methods.every((r) => 'tag' === r.cmp?.ref && cmp === r.cmp.cmp && null == tagItemCollection(work, r));
}
// The name an item route takes from its collection's last segment: the
// segment, the tag before it, or a number after the stored form.
function itemSegmentName(work, route, collection) {
    const cmp = route.cmp.cmp;
    const segment = (0, utility_1.canonize)(collection.substring(collection.lastIndexOf('/') + 1));
    const own = segment === cmp;
    const tagged = own ? segment : cmp + '_' + segment;
    const tagOwn = own ? (path) => tagNamesRoute(work, path, cmp) : undefined;
    for (const name of own ? [segment] : [segment, tagged]) {
        if (!segmentHeld(work, name, collection, name === segment ? tagOwn : undefined)) {
            return { name, stored: false };
        }
    }
    const stored = (0, utility_1.ensureMinEntityName)(tagged, {});
    let i = 2;
    while (keyHeld(work, [stored + i], collection)) {
        i++;
    }
    return { name: stored + i, stored: true };
}
function markRecordOwner(recordowner, route, entname) {
    const cmp = route.cmp;
    const last = route.parts.filter((part) => !isParam(part)).pop();
    if (null == recordowner[route.path] && null != cmp && 'tag' !== cmp.ref && '' !== cmp.ref &&
        entname === cmp.cmp && null != last && entname === (0, utility_1.canonize)(last)) {
        recordowner[route.path] = entname;
    }
}
function samePathOwner(work, route) {
    const owner = work.pathowner[route.path];
    if (null == owner || 'tag' !== route.cmp?.ref) {
        return null;
    }
    for (const method of ['GET', 'QUERY', 'PUT', 'PATCH']) {
        const entname = owner[method];
        const read = work.routes.find((r) => r.path === route.path && r.method === method);
        if (null != entname && (read?.tags ?? []).some((tag) => route.tags.includes(tag))) {
            return { entname, method };
        }
    }
    return null;
}
// Owners and record owners are the claims maps in the dry run that measures
// claims, and the resolved maps in the naming pass.
function nameFeatures(work, route, owners, recordowner, why) {
    const def = work.def;
    const metrics = work.guide.metrics;
    const pm = route.pm;
    const cmp = route.cmp;
    const x = {};
    const sources = {};
    const collection = tagItemCollection(work, route);
    x.tag_item_route = bit(null != collection);
    if (null != collection && null != cmp) {
        x.tag_cmp_is_record = bit(true === work.recordResources[cmp.cmp]);
        const record = recordowner[collection] ?? recordowner[collection + '/'];
        x.collrec_avail = bit(null != record);
        sources.COLLREC = record ?? null;
        x.tag_collides = bit(tagCollides(def, work.tagItems[cmp.cmp] ?? {}));
    }
    const shaped = null != pm;
    x.shaped = bit(shaped);
    x.m_delete = bit('DELETE' === route.method);
    x.m_write = bit(!utility_1.READ_METHODS.includes(route.method));
    x.cmp_avail = bit(null != cmp);
    x.cmp_from_tag = bit('tag' === cmp?.ref);
    if (null != pm) {
        x[SHAPE_FEATURES[pm.expr]] = 1;
        const pathName = (0, utility_1.canonize)(pm[PATH_NAME_INDEX[pm.expr]]);
        sources.PATH = pathName;
        const probable = (0, nn_1.decide)(PROBABLE_NET, probableFeatures(work, route, pm));
        x.probable = bit('YES' === probable.cls);
        why.push((0, nn_1.explain)('probable', probable));
        if (null != cmp) {
            sources.CMP = cmp.cmp;
            x.cmp_ne_path = bit(cmp.cmp !== pathName && !cmp.cmp.startsWith(pathName));
            const unversioned = cmp.cmp.replace(/_v\d+$/, '');
            x.cmp_qualifies = bit(unversioned !== cmp.cmp && unversioned.endsWith('_' + pathName));
            sources.CMPQ = unversioned;
            x.cmp_infrequent = bit(cmp.method_rate < IS_ENTCMP_METHOD_RATE ||
                cmp.path_rate < IS_ENTCMP_PATH_RATE);
            x.cmp_shared = bit(true === work.sharing.yields[cmp.origcmpref + ' ' + route.method + ' ' + route.path]);
            x.cmp_in_path = bit(true === work.pathLiterals[cmp.cmp]);
        }
        else if ('DELETE' === route.method) {
            const cmps = uniqueResponseCmps(def, route.path);
            x.delcmp_avail = bit(1 === cmps.length);
            sources.DELCMP = 1 === cmps.length ? cmps[0].cmp : null;
        }
        if ('t/p/t/' === pm.expr) {
            const last = pm[pm.length - 1];
            const lastCanon = (0, utility_1.canonize)(last);
            sources.LAST = lastCanon;
            sources.ACT = (0, utility_1.canonize)(pm[pm.length - 3]);
            sources.PART = sources.ACT + '_' + pathName;
            x.last_is_cmp = bit(null != metrics.count.origcmprefs[lastCanon]);
            x.path_has_children = bit(0 < (0, utility_1.findPathsWithPrefix)({ def }, pm.path, { strict: true }));
            if (null != cmp) {
                x.cmp_occur_le1 = bit((cmp.rescmpoccur ?? cmp.cmpoccur ?? 0) <= 1);
                const lit = (0, jostraca_1.snakify)(last);
                x.last_lit_singular = bit('' !== lit && (0, utility_1.depluralize)(lit) === lit);
                const c = String(cmp.rescmp ?? cmp.cmp ?? '');
                x.cmp_not_verb = bit('' !== lastCanon && c !== lastCanon && !c.endsWith('_' + lastCanon));
                const normalize = (p) => p.replace(/\{[^}]+\}/g, '{}');
                const itemNorm = normalize(pm.path.replace(/\/[^/]+$/, ''));
                const prefix = normalize(pm.path) + '/';
                let itemPath = undefined;
                let extended = false;
                for (const p of Object.keys(def.paths ?? {})) {
                    const pn = normalize(p);
                    if (pn === itemNorm) {
                        itemPath = p;
                    }
                    else if (pn.startsWith(prefix)) {
                        extended = true;
                    }
                }
                x.item_route_exists = bit(null != itemPath);
                x.route_not_extended = bit(!extended);
                const held = null == itemPath ? {} : (owners[itemPath] ?? {});
                sources.PARENT = held.GET ?? held.QUERY ??
                    Object.values(held).sort()[0] ?? sources.ACT;
            }
        }
    }
    else {
        const opid = (0, utility_1.canonize)(route.operationId ?? '');
        x.opid_avail = bit(3 <= opid.length);
        sources.OPID = opid;
        const title = (0, utility_1.canonize)(getResponseSchema(route.responses?.[200] ?? route.responses?.[201])?.title ?? '');
        x.title_avail = bit(3 <= title.length);
        sources.TITLE = title;
        for (let i = route.parts.length - 1; 0 <= i; i--) {
            if (!isParam(route.parts[i])) {
                const seg = (0, utility_1.canonize)(route.parts[i]);
                if (3 <= seg.length) {
                    x.seg_avail = 1;
                    sources.SEG = seg;
                    break;
                }
            }
        }
    }
    const owner = samePathOwner(work, route);
    x.same_path_avail = bit(null != owner);
    sources.SAMEPATH = owner?.entname ?? null;
    return { x, sources, collection };
}
// The name each route takes by its path and component, found before any
// route is named, so an item route sees one sorting after it.
function measureClaims(work, route) {
    const { x, sources } = nameFeatures(work, route, work.claimowner, work.claimrecord, []);
    const d = (0, nn_1.decide)(NAME_NET, { ...x, same_path_avail: 0 });
    if ('COLLREC' === d.cls || 'COLLSEG' === d.cls) {
        return;
    }
    const name = sources[d.cls] ?? null;
    if (null == name) {
        return;
    }
    const cmp = route.cmp?.cmp ?? '';
    const claim = (0, utility_1.resplitFromCmp)(name, cmp, []);
    const stored = (0, utility_1.ensureMinEntityName)(claim, {});
    for (const key of [claim, stored]) {
        const claims = work.claims[key] = work.claims[key] ?? {};
        claims[route.path] = true;
    }
    const owners = work.claimowner[route.path] = work.claimowner[route.path] ?? {};
    owners[route.method] = claim;
    markRecordOwner(work.claimrecord, route, stored);
}
function resolveName(work, route) {
    const why = [...route.why_cmp];
    const { x, sources, collection } = nameFeatures(work, route, work.pathowner, work.recordowner, why);
    const cmp = route.cmp?.cmp ?? '';
    let d = (0, nn_1.decide)(NAME_NET, x);
    let entname = sources[d.cls] ?? null;
    let item = null;
    if ('COLLREC' === d.cls) {
        item = { name: entname, why: 'collection-record', stored: false };
    }
    else if ('COLLSEG' === d.cls) {
        item = { ...itemSegmentName(work, route, collection), why: 'collection-segment' };
    }
    // A join counts only where it changes the name the route's own shape gives.
    if ('SAMEPATH' === d.cls) {
        const own = (0, nn_1.decide)(NAME_NET, { ...x, same_path_avail: 0 });
        const ownname = sources[own.cls] ?? null;
        if (null != ownname && null != entname &&
            (0, utility_1.resplitFromCmp)(ownname, cmp, []) === (0, utility_1.resplitFromCmp)(entname, cmp, [])) {
            d = own;
            entname = ownname;
        }
        else {
            route.same_path = entname ?? undefined;
        }
    }
    if ('PARENT' === d.cls && null != route.pm) {
        route.verb_on_parent = route.pm[route.pm.length - 1];
    }
    why.push((0, nn_1.explain)('name', d));
    const why_path = why;
    if (null == entname) {
        work.unresolved++;
        entname = 'entity' + work.unresolved;
    }
    entname = (0, utility_1.resplitFromCmp)(entname, cmp, why_path);
    if (null != item) {
        why_path.push(item.why + '=' + item.name);
        entname = item.name;
    }
    const rawEntname = entname;
    if (true !== item?.stored && null == work.entmap[entname]) {
        entname = (0, utility_1.ensureMinEntityName)(entname, work.entmap);
    }
    const ent = work.entmap[entname] = work.entmap[entname] ?? {
        name: entname,
        longname: rawEntname,
        cmp: route.cmp?.cmp ?? null,
        origcmp: route.cmp?.origcmp ?? null,
        ref: route.cmp?.ref ?? '',
        why_path,
        path: Object.create(null),
        total_ops: 0,
        authexchange_ops: 0,
    };
    const pathdesc = ent.path[route.path] = ent.path[route.path] ?? {
        pm: route.pm,
        why_path,
        rename: { param: {} },
        why_rename: { why_param: {} },
        action: {},
        op: {},
        ops: 0,
        deprecated_ops: 0,
    };
    pathdesc.why_path = why_path;
    route.entname = entname;
    work.pathowner[route.path] = work.pathowner[route.path] ?? {};
    work.pathowner[route.path][route.method] = entname;
    markRecordOwner(work.recordowner, route, entname);
}
function applyRename(ctx, path, method, capture, oldParamName, newParamName, why) {
    if (!/^[A-Za-z_]/.test(newParamName)) {
        ctx.log.debug({
            point: 'param-rename-skip',
            path,
            param: oldParamName,
            rejected: newParamName,
            note: 'derived parameter name is not an identifier, keeping the' +
                " specification's name"
        });
        return;
    }
    const otherParams = (path.match(/\{([^}]+)\}/g) || [])
        .map((seg) => seg.slice(1, -1))
        .filter((name) => name !== oldParamName);
    const takenBy = Object.keys(capture.rename)
        .find((other) => other !== oldParamName && capture.rename[other] === newParamName) ??
        otherParams
            .find((other) => null == capture.rename[other] && (0, utility_1.canonize)(other) === newParamName);
    if (null != takenBy) {
        ctx.log.debug({
            point: 'param-rename-collision',
            path,
            param: oldParamName,
            rejected: newParamName,
            takenBy,
            note: 'another parameter of this path already renames to ' +
                newParamName + ", keeping the specification's name"
        });
        return;
    }
    const existing = capture.rename[oldParamName];
    const existingWhy = capture.why[oldParamName] = capture.why[oldParamName] ?? [];
    if (null == existing) {
        capture.rename[oldParamName] = newParamName;
        if (!existingWhy.includes(why)) {
            existingWhy.push(why);
        }
    }
    else if (newParamName !== existing) {
        ctx.warn({
            paramRenameCapture: capture, oldParamName, newParamName, why,
            note: 'Param rename mismatch: existing: ' +
                oldParamName + ' -> ' + existing + ' (why: ' + existing + ') ' +
                ' proposed: ' + newParamName + ' (why: ' + why + ') ' +
                'for path: ' + path + '. method: ' + method
        });
    }
}
function updateAction(method, oldParam, actionName, ent, pathdesc, why) {
    if (!ent.name.endsWith((0, utility_1.canonize)(actionName)) && null == pathdesc.action[actionName]) {
        pathdesc.action[actionName] = {
            why_action: ['ent', ent.name, why, oldParam, method],
        };
    }
}
function paramFeatures(route, ent, parts, i) {
    const old = parts[i].slice(1, -1);
    const n = parts.length;
    const hasParent = 0 < i && !isParam(parts[i - 1]);
    const parentName = hasParent ? (0, utility_1.canonize)(parts[i - 1]) : null;
    const E = ent.name;
    return {
        pp_shape: bit(null != (0, utility_1.pathMatch)(route.path, 'p/p/')),
        last: bit(i === n - 1),
        second_last: bit(i === n - 2),
        not_last: bit(i < n - 1),
        has_parent: bit(hasParent),
        idx_gt1: bit(1 < i),
        exact_id: bit('id' === old),
        idlike: bit(old.endsWith('id') || old.endsWith('Id') || (0, utility_1.canonize)(old) === parentName ||
            (old.endsWith('_number') && parentName === E)),
        parent_eq_ent: bit(parentName === E),
        ent_starts_parent: bit(hasParent && parentName !== E && E.startsWith(parentName + '_')),
        ent_ends_parent: bit(hasParent && E.endsWith('_' + parentName)),
        name_param: bit((0, heuristic01_1.isNameParam)(old)),
        canon_eq_ent: bit((0, utility_1.canonize)(parts[i]) === E),
        snake_differs: bit((0, utility_1.depluralize)((0, jostraca_1.snakify)((0, utility_1.normalizeFieldName)(old))) !== old),
        parent_id_differs: bit(hasParent && parentName + '_id' !== old),
    };
}
function renameParams(ctx, route, ent) {
    const pathdesc = ent.path[route.path];
    const capture = {
        rename: pathdesc.rename.param,
        why: pathdesc.why_rename.why_param,
    };
    const parts = (0, heuristic01_1.verbParts)(route.parts);
    for (let i = 0; i < parts.length; i++) {
        if (!isParam(parts[i])) {
            continue;
        }
        const old = parts[i].slice(1, -1);
        capture.why[old] = capture.why[old] ?? [];
        const parentName = 0 < i && !isParam(parts[i - 1]) ? (0, utility_1.canonize)(parts[i - 1]) : '';
        const d = (0, nn_1.decide)(PARAM_NET, paramFeatures(route, ent, parts, i));
        const why = (0, nn_1.explain)('param', d);
        if ('ID' === d.cls) {
            const action = fired(PARAM_NET, d, 'b1_action') ? 'action-not-parent' :
                fired(PARAM_NET, d, 'b3_end_action') ? 'end-action' : null;
            applyRename(ctx, route.path, route.method, capture, old, 'id', why);
            if (null != action) {
                updateAction(route.method, old, parts[i + 1], ent, pathdesc, action);
            }
        }
        else if ('PARENT_ID' === d.cls) {
            applyRename(ctx, route.path, route.method, capture, old, parentName + '_id', why);
        }
        else if ('SNAKE' === d.cls) {
            applyRename(ctx, route.path, route.method, capture, old, (0, utility_1.depluralize)((0, jostraca_1.snakify)((0, utility_1.normalizeFieldName)(old))), why);
        }
        if (capture.rename[old] === old) {
            delete capture.rename[old];
            delete capture.why[old];
        }
    }
    // A rejected rename leaves the parameter to the snake-case pass.
    for (const part of parts) {
        if (!isParam(part)) {
            continue;
        }
        const old = part.slice(1, -1);
        const snake = (0, utility_1.depluralize)((0, jostraca_1.snakify)((0, utility_1.normalizeFieldName)(old)));
        if (snake !== old && undefined === capture.rename[old]) {
            capture.why[old] = capture.why[old] ?? [];
            applyRename(ctx, route.path, route.method, capture, old, snake, 'snake-case');
        }
    }
}
function findActions(route, ent) {
    const pathdesc = ent.path[route.path];
    const parts = (0, heuristic01_1.verbParts)(route.parts);
    const cmp = route.cmp?.cmp;
    const origcmp = route.cmp?.origcmp;
    const n = parts.length;
    const at = (k) => parts[n - k];
    const isEnt = (part) => {
        const canon = (0, utility_1.canonize)(part);
        return canon === cmp || canon === origcmp || canon === ent.name;
    };
    const last = at(1);
    const lastCanon = (0, utility_1.canonize)(last);
    const l2Canon = (0, utility_1.canonize)(at(2));
    const compound = l2Canon + '_' + lastCanon;
    const d = (0, nn_1.decide)(ACTION_NET, {
        same_path: bit(null != route.same_path),
        vop_chosen: bit(null != route.verb_on_parent),
        last_verb: bit((0, heuristic01_1.isVerb)(last)),
        l2_is_ent: bit(isEnt(at(2))),
        l3_is_ent: bit(isEnt(at(3))),
        l4_is_ent: bit(isEnt(at(4))),
        l2_param: bit(isParam(at(2))),
        l3_param: bit(isParam(at(3))),
        l2_verb: bit((0, heuristic01_1.isVerb)(at(2))),
        ent_endswith_last: bit(ent.name.endsWith((0, utility_1.canonize)(lastCanon))),
        ent_endswith_compound: bit(ent.name.endsWith((0, utility_1.canonize)(compound))),
    });
    pathdesc.why_path.push((0, nn_1.explain)('action', d));
    if ('LAST' === d.cls) {
        if (fired(ACTION_NET, d, 'act_vop')) {
            pathdesc.action[lastCanon] = pathdesc.action[lastCanon] ?? {
                why_action: ['ent', ent.name, 'verb-on-parent', last, route.method],
            };
        }
        else {
            updateAction(route.method, last, lastCanon, ent, pathdesc, fired(ACTION_NET, d, 'act_l2') ? 'no-param' : 'ent-param-2nd-last');
        }
    }
    else if ('COMPOUND' === d.cls) {
        updateAction(route.method, at(2) + '/' + last, compound, ent, pathdesc, 'ent-param-3rd-last');
    }
}
function resolveOperation(work, route, ent) {
    const opname = route.op;
    const pathdesc = ent.path[route.path];
    ent.total_ops++;
    if (null != (0, utility_1.authExchangeOp)(route, (0, utility_1.specSecuredByDefault)(work.def))) {
        ent.authexchange_ops++;
    }
    pathdesc.ops++;
    pathdesc.deprecated_ops += route.deprecated ? 1 : 0;
    const opdef = { method: route.method, why_op: route.why_op.join(';') };
    if (null == pathdesc.op[opname]) {
        pathdesc.op[opname] = opdef;
    }
    else {
        pathdesc.op[route.method.toLowerCase()] = opdef;
    }
}
function resolveTransform(work, route, ent) {
    const opname = route.op;
    const op = ent.path[route.path].op;
    const transform = { req: undefined, res: undefined };
    const resschema = getResponseSchema(successResponse(route.responses));
    const resprops = resschema?.properties;
    const rescmp = resschema?.['x-ref'];
    const named = null == rescmp || null == ent.cmp || (0, utility_1.cmpRefName)(rescmp) !== ent.cmp;
    const partprops = (0, utility_1.mergedProperties)(resschema);
    const records = 'list' === opname && null != partprops ? (0, utility_1.envelopeProp)(partprops, opname) : null;
    const holdsRecord = (prop) => (0, utility_1.isEntityWrapperProp)(prop) &&
        (null == records || true === (0, utility_1.propIsList)(prop));
    if (named && holdsRecord(partprops?.[ent.name])) {
        transform.res = '`body.' + ent.name + '`';
    }
    else if (resprops) {
        const envelope = (0, utility_1.envelopeProp)(resprops, opname);
        if (null != envelope) {
            transform.res = '`body.' + envelope + '`';
        }
    }
    if (null == transform.res) {
        const envelope = (0, utility_1.composedEnvelopeProp)(resschema, opname);
        if (null != envelope) {
            transform.res = '`body.' + envelope + '`';
        }
    }
    const itemref = resschema?.items?.['x-ref'];
    if (null == transform.res && 'list' === opname &&
        (null == itemref || null == ent.cmp || (0, utility_1.cmpRefName)(itemref) !== ent.cmp)) {
        const key = (0, utility_1.itemEnvelopeKey)(resschema, [ent.name]);
        if (null != key) {
            transform.res = (0, utility_1.itemEnvelopeTransform)(key);
        }
    }
    const reqschema = getRequestBodySchema(work.def, route);
    transform.req = (0, utility_1.bodyRequestTransform)(reqschema, [ent.name]);
    if (!(0, struct_1.isempty)(transform) && null != op[opname]) {
        op[opname].transform = transform;
    }
}
function versionActions(ent) {
    const groups = {};
    for (const pathStr of (0, utility_1.sortedKeys)(ent.path)) {
        const vm = pathStr.match(/\/v(\d+)(?=\/|$)/);
        if (null == vm) {
            continue;
        }
        const key = pathStr.replace(/\/v\d+(?=\/|$)/, '/v');
        groups[key] = groups[key] ?? [];
        groups[key].push({ path: pathStr, version: Number(vm[1]) });
    }
    for (const members of Object.values(groups)) {
        if (members.length < 2) {
            continue;
        }
        const live = members.filter((m) => {
            const pathdesc = ent.path[m.path];
            return pathdesc.deprecated_ops < pathdesc.ops;
        });
        const route = (0 < live.length ? live : members)
            .reduce((a, b) => b.version > a.version ? b : a);
        for (const m of members) {
            if (m === route) {
                continue;
            }
            const pathdesc = ent.path[m.path];
            const vname = 'v' + m.version;
            const why = ['ent', ent.name, 'version', vname, 'behind', route.path];
            const actions = pathdesc.action;
            pathdesc.action = {};
            for (const actname of (0, utility_1.sortedKeys)(actions)) {
                pathdesc.action[actname + '_' + vname] = {
                    why_action: [...actions[actname].why_action, ...why],
                };
            }
            if (0 === (0, utility_1.sortedKeys)(actions).length) {
                pathdesc.action[vname] = { why_action: why };
            }
        }
    }
}
function buildEntity(guide, ent) {
    guide.metrics.count.entity++;
    const path = {};
    for (const pathstr of Object.keys(ent.path)) {
        const pathdesc = ent.path[pathstr];
        const param = {};
        for (const key of Object.keys(pathdesc.rename.param)) {
            param[key] = {
                target: pathdesc.rename.param[key],
                why_rename: pathdesc.why_rename.why_param[key],
            };
        }
        path[pathstr] = {
            why_path: pathdesc.why_path,
            action: pathdesc.action,
            rename: { param },
            op: pathdesc.op,
        };
    }
    const guideEntity = {
        name: ent.name,
        orig: ent.origcmp,
        path,
    };
    if (0 < ent.authexchange_ops && ent.authexchange_ops === ent.total_ops) {
        guideEntity.active = false;
        guideEntity.why_inactive = 'auth-exchange';
    }
    guide.entity[ent.name] = guideEntity;
}
function nameEntityParams(entity) {
    const given = {};
    for (const [pathStr, guidePath] of Object.entries(entity.path ?? {})) {
        given[pathStr] = {};
        for (const [param, rename] of Object.entries(guidePath.rename?.param ?? {})) {
            given[pathStr][param] = rename.target;
        }
    }
    const named = (0, heuristic01_1.entityParamNames)(given);
    for (const [pathStr, guidePath] of Object.entries(entity.path ?? {})) {
        guidePath.rename = guidePath.rename ?? { param: {} };
        const renames = guidePath.rename.param = guidePath.rename.param ?? {};
        for (const param of Object.keys(renames)) {
            if (null == named[pathStr][param]) {
                delete renames[param];
            }
        }
        for (const [param, target] of Object.entries(named[pathStr])) {
            if (target !== renames[param]?.target) {
                renames[param] = { target, why_rename: ['entity-param'] };
            }
        }
    }
}
async function neural01(ctx) {
    const named = () => Object.create(null);
    const guide = {
        control: {},
        entity: named(),
        metrics: {
            count: { path: 0, field: 0, method: 0, tag: 0, cmp: 0, entity: 0, origcmprefs: named() },
            found: { tag: named(), cmp: named() },
        },
    };
    const work = {
        def: ctx.def,
        guide,
        routes: [],
        envelope: named(),
        listEnvelope: named(),
        envelopePaths: named(),
        answered: named(),
        sharing: { routes: [], records: named(), yields: named() },
        pathowner: named(),
        recordowner: named(),
        recordResources: named(),
        tagItems: named(),
        claims: named(),
        claimowner: named(),
        claimrecord: named(),
        entmap: named(),
        unresolved: 0,
        pathLiterals: named(),
    };
    measureMetrics(work);
    work.routes = collectRoutes(ctx.def);
    for (const route of work.routes) {
        resolveOp(route);
    }
    measureEnvelope(work);
    measureSharing(work);
    for (const route of work.routes) {
        resolveCmp(work, route);
        measureTagItems(work, route);
    }
    for (const route of work.routes) {
        measureClaims(work, route);
    }
    for (const route of work.routes) {
        resolveName(work, route);
        const ent = work.entmap[route.entname];
        renameParams(ctx, route, ent);
        if (null == route.same_path) {
            findActions(route, ent);
        }
        resolveOperation(work, route, ent);
        resolveTransform(work, route, ent);
    }
    for (const entname of (0, utility_1.sortedKeys)(work.entmap)) {
        versionActions(work.entmap[entname]);
        buildEntity(guide, work.entmap[entname]);
    }
    guide.metrics.count.entity -= (0, entity_1.mergeCollectionPaths)(guide, ctx.log, (pathStr, methods, collection) => (0, heuristic01_1.pathRecordRef)(ctx.def, pathStr, methods, collection), (sharePath, shareMethods, itemPath, itemMethods) => (0, heuristic01_1.distinctShare)(ctx.def, sharePath, shareMethods, itemPath, itemMethods)).length;
    guide.metrics.count.entity -= (0, entity_1.mergeFoldedEntities)(guide, ctx.log).length;
    for (const entity of Object.values(guide.entity)) {
        nameEntityParams(entity);
    }
    let totalPaths = 0;
    let totalOps = 0;
    for (const entity of Object.values(guide.entity)) {
        for (const p of (0, utility_1.sortedKeys)(entity.path ?? {})) {
            totalPaths++;
            totalOps += (0, utility_1.sortedKeys)(entity.path[p].op ?? {}).length;
        }
    }
    ctx.log.info({
        point: 'neural01',
        note: `entities=${Object.keys(guide.entity).length} paths=${guide.metrics.count.path}` +
            ` methods=${guide.metrics.count.method} tags=${guide.metrics.count.tag}` +
            ` cmps=${guide.metrics.count.cmp}` +
            ` entity-paths=${totalPaths} entity-ops=${totalOps}`,
    });
    return guide;
}
//# sourceMappingURL=neural01.js.map