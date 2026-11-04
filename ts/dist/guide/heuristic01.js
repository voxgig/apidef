"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.READ_VERBS = exports.LITERAL_LAST_SHAPES = void 0;
exports.answeredRefs = answeredRefs;
exports.arrayBodyField = arrayBodyField;
exports.commandBodyName = commandBodyName;
exports.commandTwin = commandTwin;
exports.itemAbove = itemAbove;
exports.readsRecord = readsRecord;
exports.recordOf = recordOf;
exports.responsePayload = responsePayload;
exports.tagHolds = tagHolds;
exports.wrapsLiteral = wrapsLiteral;
exports.isListResponse = isListResponse;
exports.distinctRecord = distinctRecord;
exports.distinctShare = distinctShare;
exports.heuristic01 = heuristic01;
exports.keyParamOf = keyParamOf;
exports.matchEntityPath = matchEntityPath;
exports.pathNoun = pathNoun;
exports.namingRef = namingRef;
exports.namingSchemas = namingSchemas;
exports.pathRecordRef = pathRecordRef;
exports.pathResource = pathResource;
exports.sharedRoutes = sharedRoutes;
exports.entityParamNames = entityParamNames;
exports.isNameParam = isNameParam;
exports.isVerb = isVerb;
exports.verbParts = verbParts;
const ordu_1 = require("ordu");
const jostraca_1 = require("jostraca");
const struct_1 = require("@voxgig/struct");
const utility_1 = require("../utility");
const body_1 = require("../transform/body");
const utility_2 = require("../utility");
const jostraca_2 = require("jostraca");
const entity_1 = require("../transform/entity");
const refcount_1 = require("../refcount");
const KONSOLE_LOG = console['log'];
// Log non - fatal wierdness.
const dlog = (0, utility_2.getdlog)('apidef', __filename);
// A schema whose per-use occurrences, over the method count or over the path
// count, fall below these rates names an entity rather than a shared shape.
const IS_ENTCMP_METHOD_RATE = 0.21;
const IS_ENTCMP_PATH_RATE = 0.41;
const METHOD_IDOP = {
    GET: 'load',
    // QUERY (RFC 10008) is a safe, idempotent read carrying its filter in the
    // request body — a "GET with a body". Treat it as a load; ResolveOperation
    // promotes it to `list` when the response is a collection.
    QUERY: 'load',
    POST: 'create',
    PUT: 'update',
    DELETE: 'remove',
    PATCH: 'patch',
    HEAD: 'head',
    OPTIONS: 'OPTIONS',
};
// Tried in order: the first shape a path matches decides how its entity is named.
const ENTITY_PATH_SHAPES = ['t/p/t/', 't/p/', 'p/t/', 't/', 't/p/p'];
// A trailing literal that is one of these is a verb on the noun before it.
const VERB_WORDS = new Set([
    'send', 'resend', 'get', 'fetch', 'list', 'create', 'add', 'update', 'edit', 'delete',
    'remove', 'search', 'find', 'query', 'lookup', 'check', 'validate', 'verify', 'submit',
    'cancel', 'approve', 'reject', 'publish', 'unpublish', 'archive', 'unarchive', 'restore',
    'run', 'execute', 'start', 'stop', 'pause', 'resume', 'retry', 'refresh', 'reset', 'sync',
    'import', 'export', 'upload', 'download', 'login', 'logout', 'register', 'subscribe',
    'unsubscribe', 'activate', 'deactivate', 'enable', 'disable', 'lock', 'unlock', 'move',
    'copy', 'rename', 'merge', 'split', 'assign', 'unassign', 'attach', 'detach', 'invite',
    'accept', 'decline', 'notify', 'ping', 'count', 'exists', 'preview', 'render', 'generate',
    'calculate', 'compute', 'convert', 'process', 'trigger', 'dispatch', 'apply', 'revoke',
    'grant', 'save',
]);
// A literal that names an identifier keys a resource rather than naming one.
const ID_LITERAL_RE = /(^|_)ids?$/;
// A literal opening with one of these reads, whatever the method.
const READ_VERBS = ['list', 'search', 'get', 'find', 'query'];
exports.READ_VERBS = READ_VERBS;
// The shapes whose naming literal ends the path.
const LITERAL_LAST_SHAPES = ['t/p/t/', 't/', 'p/t/'];
exports.LITERAL_LAST_SHAPES = LITERAL_LAST_SHAPES;
// Stripped from a command's body component to name the command.
const COMMAND_SUFFIXES = [
    '_request', '_input', '_payload', '_body', '_params', '_parameters', '_command', '_dto',
];
const SCALAR_TYPES = new Set(['string', 'number', 'integer', 'boolean']);
// The matched part that gives each shape its name.
const PATH_NAME_INDEX = {
    't/p/t/': 2, 't/p/': 0, 'p/t/': 1, 't/': 0, 't/p/p': 0,
};
const METHOD_CONSIDER_ORDER = {
    'GET': 100,
    'QUERY': 150,
    'POST': 200,
    'PUT': 300,
    'PATCH': 400,
    'DELETE': 500,
    'HEAD': 600,
    'OPTIONS': 700,
};
async function heuristic01(ctx) {
    const analysis = new ordu_1.Ordu({ select: { sort: true } }).add([
        Prepare,
        {
            select: 'def.paths', apply: [
                MeasurePath,
                { select: selectPathItemMembers, apply: MeasureMethod },
                PreparePath
            ]
        },
        { select: selectCmpXrefs, apply: MeasureRef },
        { select: selectAllMethods, apply: MeasureEnvelope },
        MeasureEnvelopeItems,
        MeasureAnswered,
        { select: selectAllMethods, apply: MeasureSharing },
        MeasureShared,
        { select: selectAllMethods, apply: [ResolveEntityComponent, MeasureTagItems] },
        { select: selectAllMethods, apply: MeasureClaims },
        {
            select: selectAllMethods, apply: [
                ResolveEntityName,
                RenameParams,
                FindActions,
                ResolveOperation,
                ResolveTransform,
                // ShowNode,
            ]
        },
        { select: 'work.entmap', apply: [VersionActions, BuildEntity] }
    ]);
    const result = analysis.execSync(ctx, {});
    if (result.err) {
        throw result.err;
    }
    const guide = result.data.guide;
    guide.metrics.count.entity -= (0, entity_1.mergeCollectionPaths)(guide, ctx.log, (pathStr, methods, collection) => pathRecordRef(ctx.def, pathStr, methods, collection), (sharePath, shareMethods, itemPath, itemMethods) => distinctShare(ctx.def, sharePath, shareMethods, itemPath, itemMethods)).length;
    guide.metrics.count.entity -= (0, entity_1.mergeFoldedEntities)(guide, ctx.log).length;
    // After the merge, which can move a path onto another entity.
    for (const entity of Object.values(guide.entity)) {
        nameEntityParams(entity);
    }
    const metrics = guide.metrics;
    const entities = Object.values(guide.entity);
    const entityCount = entities.length;
    let totalPaths = 0;
    let totalOps = 0;
    for (const ent of entities) {
        const pathKeys = (0, utility_2.sortedKeys)(ent.path || {});
        totalPaths += pathKeys.length;
        for (const p of pathKeys) {
            totalOps += (0, utility_2.sortedKeys)(ent.path[p].op || {}).length;
        }
    }
    ctx.log.info({
        point: 'heuristic01',
        note: `entities=${entityCount} paths=${metrics.count.path}` +
            ` methods=${metrics.count.method} tags=${metrics.count.tag}` +
            ` cmps=${metrics.count.cmp}` +
            ` entity-paths=${totalPaths} entity-ops=${totalOps}`,
    });
    return guide;
}
function ShowNode(spec) {
    KONSOLE_LOG('NODE', spec.node.key, spec.node.val);
}
function Prepare(spec) {
    // Keyed by names from the definition, so no key may find an Object.prototype member.
    const named = () => Object.create(null);
    const guide = {
        control: {},
        entity: named(),
        metrics: {
            count: {
                path: 0,
                field: 0,
                method: 0,
                tag: 0,
                cmp: 0,
                entity: 0,
                origcmprefs: named(),
            },
            found: {
                tag: named(),
                cmp: named(),
            }
        },
    };
    Object.assign(spec.data, {
        def: spec.ctx.def,
        guide,
        work: {
            pathmap: named(),
            entmap: named(),
            envelope: named(),
            listEnvelope: named(),
            envelopePaths: named(),
            sharing: { routes: [], records: named(), yields: named() },
            recordResources: named(),
            tagItems: named(),
            claims: named(),
            claimowner: named(),
            claimrecord: named(),
            pathowner: named(),
            recordowner: named(),
            entity: {
                count: {
                    seen: 0,
                    unresolved: 0,
                }
            },
        }
    });
}
// Expects to run over paths
function MeasurePath(spec) {
    const guide = spec.data.guide;
    const metrics = guide.metrics;
    const pathdef = spec.node.val;
    if (!isPathItem(spec.node.key, pathdef)) {
        return;
    }
    metrics.count.path++;
    metrics.count.method += ((pathdef.get ? 1 : 0) +
        (pathdef.post ? 1 : 0) +
        (pathdef.put ? 1 : 0) +
        (pathdef.patch ? 1 : 0) +
        (pathdef.delete ? 1 : 0) +
        (pathdef.head ? 1 : 0) +
        (pathdef.options ? 1 : 0) +
        (pathdef.query ? 1 : 0));
}
// Expects to run over paths.<method>
function MeasureMethod(spec) {
    const guide = spec.data.guide;
    const metrics = guide.metrics;
    const methoddef = spec.node.val;
    const pathtags = methoddef.tags;
    if (Array.isArray(pathtags)) {
        for (let tag of pathtags) {
            if ('string' === typeof tag && 0 < tag.length) {
                if (!metrics.found.tag[tag]) {
                    metrics.count.tag++;
                    metrics.found.tag[tag] = {
                        name: tag,
                        canon: (0, utility_1.literalName)(tag),
                    };
                }
            }
        }
    }
}
function PreparePath(spec) {
    const work = spec.data.work;
    const pathstr = spec.node.key;
    const pathdef = spec.node.val;
    if (!isPathItem(pathstr, pathdef)) {
        return;
    }
    const pathdesc = {
        path: pathstr,
        def: pathdef,
        parts: (0, utility_1.pathParts)(pathstr),
        op: {}
    };
    work.pathmap[pathstr] = pathdesc;
}
// A vendor extension beside the paths is no path, as apidef reads no `x-` key.
function isPathItem(key, pathdef) {
    return !String(key).startsWith('x-') &&
        null != pathdef && 'object' === typeof pathdef && !Array.isArray(pathdef);
}
function selectPathItemMembers(pathdef, spec) {
    return isPathItem(spec.node.key, pathdef) ?
        (0, utility_2.sortedKeys)(pathdef).map((key) => pathdef[key]) : [];
}
function selectCmpXrefs(_source, spec) {
    const counts = (0, refcount_1.countRefs)(spec.ctx.def);
    return Object.keys(counts)
        .sort(refcount_1.byCodePoint)
        .filter(val => val.match(/\/(components\/schemas|definitions)\//))
        .map(val => ({ val, count: counts[val] }));
}
function MeasureRef(spec) {
    const guide = spec.data.guide;
    const metrics = guide.metrics;
    const xref = spec.node.val;
    let m = xref.val.match(/\/(components\/schemas|definitions)\/(.+)$/);
    if (m) {
        const name = (0, utility_2.canonizeCmpName)(m[2]);
        if (null == metrics.count.origcmprefs[name]) {
            metrics.count.cmp++;
            metrics.count.origcmprefs[name] = 0;
        }
        metrics.count.origcmprefs[name] =
            (0, refcount_1.satAdd)(metrics.count.origcmprefs[name], xref.count);
        if (null == metrics.found.cmp[name]) {
            metrics.found.cmp[name] = { orig: m[2] };
        }
    }
}
// Being an envelope belongs to the component, not to one operation: it names
// through the record it carries only when every operation answering with it
// unwraps it, so the operations on one resource are never split between the
// record's name and the envelope's. An operation unwraps only the response
// ResolveTransform reads. The entry is the item's reference, or '' for none.
function MeasureEnvelope(spec) {
    const work = spec.data.work;
    const mdesc = spec.node.val;
    const opname = methodOpname(mdesc, matchEntityPath(work.pathmap[mdesc.path].parts), []);
    const unwrapref = getResponseSchema(successResponse(mdesc.responses))?.['x-ref'];
    for (const schema of successSchemas(mdesc.responses)) {
        const xref = schema['x-ref'];
        if (null != xref) {
            const itemref = null == opname || xref !== unwrapref ? null :
                (0, utility_1.envelopeItemRef)(schema, opname);
            work.envelope[xref] = '' === work.envelope[xref] || null == itemref ? '' : itemref;
            // Only a list unwraps a page, so every unwrapping operation agrees here.
            work.listEnvelope[xref] = 'list' === opname;
            (work.envelopePaths[xref] = work.envelopePaths[xref] ?? []).push(mdesc.path);
        }
    }
}
// An item carried by more than one envelope is named by none of them: the
// envelopes' own names are then what tell the resources apart. A page and one
// single-item envelope are the exception when a route of the item lies at or
// beneath a route of the page: those are one resource's list and its item.
function MeasureEnvelopeItems(spec) {
    const work = spec.data.work;
    const envelope = work.envelope;
    const carriers = Object.create(null);
    for (const xref of Object.keys(envelope)) {
        if ('' !== envelope[xref]) {
            (carriers[envelope[xref]] = carriers[envelope[xref]] ?? []).push(xref);
        }
    }
    for (const xrefs of Object.values(carriers)) {
        if (1 < xrefs.length && !isPageAndItsItem(work, xrefs)) {
            xrefs.forEach((xref) => envelope[xref] = '');
        }
    }
}
// The records some operation answers with in a 200 or 201, read through the
// envelopes MeasureEnvelopeItems settles.
function MeasureAnswered(spec) {
    spec.data.work.answered = answeredRefs(spec.data.def, spec.data.work.envelope);
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
// Records every route whose operation answers with a response component, and
// whether that component declares an `id`, before any method is named.
function MeasureSharing(spec) {
    const work = spec.data.work;
    const mdesc = spec.node.val;
    const parts = work.pathmap[mdesc.path].parts;
    const op = methodOpname(mdesc, matchEntityPath(parts), []) ?? '';
    const sharing = work.sharing;
    const resource = pathResource(parts, mdesc.method);
    const xrefs = findPotentialSchemaRefs(mdesc.path, mdesc.method, mdesc.responses, work.envelope, work.answered, []);
    for (const xref of xrefs) {
        const m = xref.match(/\/(components\/schemas|definitions)\/(.+)$/);
        if (null != m) {
            const cmp = (0, utility_2.canonizeCmpName)(m[2]);
            const record = declaresId(refSchema(spec.data.def, xref));
            sharing.routes.push({ cmp, method: mdesc.method, path: mdesc.path, op });
            sharing.records[cmp] = true === sharing.records[cmp] || record;
            if (record && null != resource) {
                work.recordResources[resource] = true;
            }
        }
    }
}
function MeasureShared(spec) {
    const sharing = spec.data.work.sharing;
    const records = Object.keys(sharing.records).filter((cmp) => sharing.records[cmp]);
    for (const key of sharedRoutes(sharing.routes, records)) {
        sharing.yields[key] = true;
    }
}
// One list for every pass, so a method keeps the component resolved for it.
function selectAllMethods(_source, spec) {
    const ctx = spec.ctx;
    const work = spec.data.work;
    if (null != work.methods) {
        return work.methods;
    }
    let caught = { methods: [] };
    for (const [path, pdef] of (0, utility_2.sortedEntries)(ctx.def.paths)) {
        if (!isPathItem(path, pdef)) {
            continue;
        }
        for (const [m, mdef] of (0, utility_2.sortedEntries)(pdef)) {
            const method = m.toUpperCase();
            // A path item also holds parameters, servers, summary and the like.
            if (null == METHOD_CONSIDER_ORDER[method] ||
                null == mdef || 'object' !== typeof mdef || Array.isArray(mdef)) {
                continue;
            }
            caught.methods.push({
                path,
                method,
                summary: mdef.summary,
                operationId: mdef.operationId,
                tags: mdef.tags,
                parameters: mdef.parameters,
                responses: mdef.responses,
                requestBody: mdef.requestBody,
                // Carried so authExchangeOp can see a per-operation `security: []`.
                // Everything downstream ignores it.
                security: mdef.security,
                deprecated: true === mdef.deprecated,
            });
        }
    }
    caught.methods.sort((a, b) => {
        if (a.path < b.path) {
            return -1;
        }
        else if (a.path > b.path) {
            return 1;
        }
        else if (METHOD_CONSIDER_ORDER[a.method] < METHOD_CONSIDER_ORDER[b.method]) {
            return -1;
        }
        else if (METHOD_CONSIDER_ORDER[a.method] > METHOD_CONSIDER_ORDER[b.method]) {
            return 1;
        }
        else {
            return 0;
        }
    });
    work.methods = caught.methods;
    return work.methods;
}
// The collections each tag gathers item routes from, before any is named, with
// the parameters of each collection's item routes.
function MeasureTagItems(spec) {
    const work = spec.data.work;
    const mdesc = spec.node.val;
    const parts = work.pathmap[mdesc.path].parts;
    const collection = tagItemCollection(spec.data, mdesc, parts);
    if (null != collection) {
        const cmp = mdesc.MethodEntity.cmp;
        const items = work.tagItems[cmp] = work.tagItems[cmp] ?? {};
        items[collection] = items[collection] ?? {};
        items[collection][parts.filter(isParam)
            .map((part) => (0, utility_2.canonizeParam)((0, utility_1.paramOf)(part))).sort().join(',')] = true;
    }
}
// The name each route takes by its path and component, and its stored form,
// found before any route is named so an item route sees one sorting after it.
// The rules run on copies. A verb takes its parent's claim; an item route its
// collection names makes none, so a verb on one claims the route's segment.
function MeasureClaims(spec) {
    const data = spec.data;
    const work = data.work;
    const mdesc = spec.node.val;
    const parts = work.pathmap[mdesc.path].parts;
    if (null != collectionNaming(data, mdesc, parts, work.claimrecord)) {
        return;
    }
    const ment = { ...(mdesc.MethodEntity ?? makeMethodEntityDesc({})) };
    const name = pathEntityName(data, { ...mdesc, MethodEntity: ment }, parts, matchEntityPath(parts), work.claimowner, []);
    if (null != name) {
        const claim = (0, utility_2.resplitFromCmp)(name, ment.cmp, []);
        const stored = (0, utility_2.ensureMinEntityName)(claim, {});
        for (const key of [claim, stored]) {
            const claims = work.claims[key] = work.claims[key] ?? {};
            claims[mdesc.path] = true;
        }
        const owners = work.claimowner[mdesc.path] = work.claimowner[mdesc.path] ?? {};
        owners[mdesc.method] = claim;
        markRecordOwner(work.claimrecord, mdesc.path, parts, ment, stored);
    }
}
function ResolveEntityComponent(spec) {
    const guide = spec.data.guide;
    const metrics = guide.metrics;
    const work = spec.data.work;
    const methodDef = spec.node.val;
    const methodName = methodDef.method;
    const pathStr = methodDef.path;
    const parts = work.pathmap[pathStr].parts;
    let why_cmp = [];
    let responses = methodDef.responses;
    let origxrefs = findPotentialSchemaRefs(pathStr, methodName, responses, work.envelope, work.answered, why_cmp).map(val => ({
        val
    }));
    let cmpxrefs = origxrefs
        .filter(xref => xref.val.includes('schema') || xref.val.includes('definitions'))
        .map(xref => {
        let m = xref.val.match(/\/components\/schemas\/(.+)$/);
        if (!m) {
            m = xref.val.match(/\/definitions\/(.+)$/);
        }
        if (m) {
            const cmp = (0, utility_2.canonizeCmpName)(m[1]);
            xref.cmp = cmp;
            xref.origcmp = m[1];
            xref.origcmpref = cmp;
        }
        return xref;
    })
        .filter(xref => null != xref.cmp)
        .filter(xref => !xref.val.includes('Meta'));
    let cleanxrefs = cmpxrefs
        .map(xref => {
        // Guarded wrapper-suffix stripping folds e.g. BeneficiaryPageResponse
        // into beneficiary — but only when the remainder is itself a schema
        // measured by MeasureRef (keys are canonizeCmpName, pre-clean).
        xref.cmp = (0, utility_2.cleanComponentName)(xref.cmp, (n) => null != metrics.count.origcmprefs[n]);
        return xref;
    })
        .flatMap((xref) => unwrapCmp(metrics, xref, why_cmp));
    let goodxrefs = cleanxrefs
        .filter(xref => {
        if (cleanxrefs.length <= 1
            || pathStr.toLowerCase().includes('/' + xref.cmp + '/')
            // || entityOccursInPath(pathStr.toLowerCase(), xref.cmp)
            || entityOccursInPath(parts, xref.cmp)) {
            return true;
        }
        // Exclude high frequency suspicious cmps as probably meta data
        const cmprefs = metrics.count.origcmprefs[xref.origcmpref] ?? 0;
        const mcount = metrics.count.method;
        const pcount = metrics.count.path;
        const method_rate = (0 < mcount ? (cmprefs / mcount) : -1);
        const path_rate = (0 < pcount ? (cmprefs / pcount) : -1);
        const infrequent = method_rate < IS_ENTCMP_METHOD_RATE
            || path_rate < IS_ENTCMP_PATH_RATE;
        if (!infrequent) {
            (0, utility_2.debugpath)(pathStr, methodName, 'CMP-INFREQ', xref.val, 'method:', method_rate, IS_ENTCMP_METHOD_RATE, 'path:', path_rate, IS_ENTCMP_PATH_RATE);
        }
        return infrequent;
    });
    // .sort((a, b) => a.path.length - b.path.length)
    const fcmp = goodxrefs[0];
    let out = undefined;
    if (null != fcmp) {
        out = makeMethodEntityDesc({
            ref: fcmp.val,
            cmp: fcmp.cmp,
            origcmp: fcmp.origcmp,
            origcmpref: fcmp.origcmpref,
            entname: fcmp.cmp,
        });
    }
    const tags = methodDef.tags ?? [];
    const goodtags = tags.filter((tag) => {
        const tagdesc = metrics.found.tag[tag];
        const ctag = tagdesc?.canon;
        return (!!metrics.found.cmp[ctag] // tag matches a cmp
            || null == fcmp // there's no cmp, so use tag
        );
    });
    (0, utility_2.debugpath)(pathStr, methodName, 'TAGS', tags, goodtags, fcmp, methodDef, metrics.found);
    const ftag = goodtags[0];
    if (null != ftag) {
        const tagdesc = metrics.found.tag[ftag];
        const tagcmp = metrics.found.cmp[tagdesc.canon];
        if (tagdesc && (tagcmp || null == fcmp)) {
            if (null == out) {
                out = makeMethodEntityDesc({
                    ref: 'tag',
                    cmp: tagdesc.canon,
                    origcmp: ftag,
                    why_cmp,
                    entname: tagdesc.canon,
                });
                why_cmp.push('tag=' + out.cmp);
            }
            else if ((pathStr.includes('/' + ftag + '/') || pathStr.includes('/' + tagdesc.canon + '/'))
                && out.cmp !== tagdesc.canon) {
                const rescmp = out.cmp;
                const rescmpoccur = metrics.count.origcmprefs[out.origcmpref ?? ''] ?? 0;
                out = makeMethodEntityDesc({
                    ref: 'tag',
                    cmp: tagdesc.canon,
                    origcmp: ftag,
                    why_cmp,
                    entname: tagdesc.canon,
                });
                out.rescmp = rescmp;
                out.rescmpoccur = rescmpoccur;
                why_cmp.push('tag/path=' + out.cmp);
            }
        }
    }
    if (null != out) {
        why_cmp.push('cmp/resolve=' + out.cmp);
        out.why_cmp = why_cmp;
        out.cmpoccur = metrics.count.origcmprefs[out.origcmpref ?? ''] ?? 0;
        out.path_rate = 0 == metrics.count.path ? -1 : (out.cmpoccur / metrics.count.path);
        out.method_rate = 0 == metrics.count.method ? -1 : (out.cmpoccur / metrics.count.method);
        methodDef.MethodEntity = out;
    }
    (0, utility_2.debugpath)(pathStr, methodName, 'CMP-NAME', out, origxrefs, cleanxrefs, goodxrefs, goodtags);
}
function ResolveEntityName(spec) {
    const ctx = spec.ctx;
    const data = spec.data;
    const mdesc = spec.node.val;
    const methodName = mdesc.method;
    const pathStr = mdesc.path;
    const work = spec.data.work;
    const pathDesc = work.pathmap[pathStr];
    const parts = pathDesc.parts;
    work.entity.count.seen++;
    let ment;
    ment = mdesc.MethodEntity;
    const why_path = [];
    if (null == ment) {
        why_path.push('no-desc');
        mdesc.MethodEntity = makeMethodEntityDesc({});
        ment = mdesc.MethodEntity;
    }
    why_path.push(...(ment.why_cmp ?? []));
    const pm = matchEntityPath(parts);
    // A join counts only where it changes the entity the shape gives, so a path
    // the shape already names keeps the shape's reasons and actions.
    const verb_on_parent = ment.verb_on_parent;
    const why_shape = [];
    const shaped = pathEntityName(data, mdesc, parts, pm, work.pathowner, why_shape);
    const item = itemOfCollection(data, mdesc, parts);
    const owner = null == item ? samePathOwner(mdesc, work) : null;
    const cmp = ment.cmp;
    let entname = shaped;
    if (null != owner && (null == shaped ||
        (0, utility_2.resplitFromCmp)(owner.entname, cmp, []) !== (0, utility_2.resplitFromCmp)(shaped, cmp, []))) {
        ment.verb_on_parent = verb_on_parent;
        ment.same_path = owner.entname;
        why_path.push('same-path-tag=' + owner.entname + '/' + owner.method);
        entname = owner.entname;
    }
    else {
        why_path.push(...why_shape);
    }
    if (null == entname) {
        work.entity.count.unresolved++;
        entname = 'entity' + work.entity.count.unresolved;
    }
    entname = (0, utility_2.resplitFromCmp)(entname, cmp, why_path);
    if (null != item) {
        why_path.push(item.why + '=' + item.name);
        entname = item.name;
    }
    // Keep the pre-truncation name so a truncated-name collision can tell a
    // re-encounter of the SAME origin (merge) from a genuinely different one
    // (numeric suffix) — see ensureMinEntityName.
    const rawEntname = entname;
    // A numbered stored form, or an entity's own name a verb reads, is kept,
    // since a cut would drop its number.
    if (true !== item?.stored && null == work.entmap[entname]) {
        entname = (0, utility_2.ensureMinEntityName)(entname, work.entmap);
    }
    const entdesc = work.entmap[entname] = work.entmap[entname] ?? {
        name: entname,
        id: 'N' + ('' + Math.random()).substring(2, 10),
        op: {},
        why_path,
        ...ment,
        longname: rawEntname,
    };
    entdesc.path = (entdesc.path || {});
    entdesc.path[pathStr] = entdesc.path[pathStr] || {
        rename: { param: {} },
        why_rename: { why_param: {} },
        pm,
    };
    entdesc.path[pathStr].op = entdesc.path[pathStr].op || {};
    entdesc.path[pathStr].why_path = why_path;
    ment.entname = entname;
    ment.pm = pm;
    // Which entity took each path+method, in resolution order. verbOnParent
    // reads the item path's GET owner from here: a t/p/ item path can be
    // split across entities by method (a PUT answering with a one-off
    // acknowledgement is named after it), and the parent of a verb is the
    // entity a read of the item returns.
    work.pathowner[pathStr] = work.pathowner[pathStr] ?? {};
    work.pathowner[pathStr][methodName] = entname;
    markRecordOwner(work.recordowner, pathStr, parts, ment, entname);
    // Same guard, same reason: the formatting is the cost, not the call.
    if ((0, utility_2.debugpathOn)()) {
        (0, utility_2.debugpath)(pathStr, methodName, 'RESOLVE-ENTITY-NAME', (0, utility_2.formatJSONIC)({ entdesc, ment }, { hsepd: 0, $: true, color: true }));
    }
}
// A method named only from its tag, as a DELETE answering 204 is, joins the
// entity a read of the same path resolved to when that read carries the same
// tag: the tag then groups the path's routes and names no other resource.
function samePathOwner(mdesc, work) {
    const ment = mdesc.MethodEntity;
    const owner = work.pathowner[mdesc.path];
    if (null == owner || 'tag' !== ment?.ref) {
        return null;
    }
    const tags = mdesc.tags ?? [];
    for (const method of ['GET', 'QUERY', 'PUT', 'PATCH']) {
        const entname = owner[method];
        const read = work.methods.find((m) => m.path === mdesc.path && m.method === method);
        if (null != entname && (read?.tags ?? []).some((tag) => tags.includes(tag))) {
            return { entname, method };
        }
    }
    return null;
}
// The name a method's path shape and component give it, or null where neither
// does; a read that views an item joins it, and a POST that reads or commands
// is named for what it reads or sends.
function pathEntityName(data, mdesc, parts, pm, pathowner, why) {
    const view = viewOfItem(data, mdesc, parts, pathowner);
    if (null != view) {
        const ment = mdesc.MethodEntity;
        ment.verb_on_parent = parts[parts.length - 1];
        ment.view_on_parent = true;
        ment.view_action = view.action;
        why.push('view-of-item=' + view.parent);
        return view.parent;
    }
    const shaped = shapeEntityName(data, mdesc, parts, pm, pathowner, why);
    if (null == pm || null == shaped) {
        return shaped;
    }
    const read = postRead(mdesc, pm, parts, why);
    if (null != read) {
        return '' === read ? shaped : read;
    }
    return commandName(data, mdesc, pm, parts, why) ?? commandTwin(data, mdesc, pm, parts, why) ?? shaped;
}
// A verb on a parent takes the name pathowner holds for the parent.
function shapeEntityName(data, mdesc, parts, pm, pathowner, why) {
    if ('t/p/t/' === pm?.expr) {
        return entityPathMatch_tpte(data, pm, mdesc, pathowner, why);
    }
    else if ('t/p/' === pm?.expr) {
        return entityPathMatch_tpe(data, pm, mdesc, why);
    }
    else if ('p/t/' === pm?.expr) {
        return entityPathMatch_pte(data, pm, mdesc, why);
    }
    else if ('t/' === pm?.expr) {
        return entityPathMatch_te(data, pm, mdesc, why);
    }
    else if ('t/p/p' === pm?.expr) {
        return entityPathMatch_tpp(data, pm, mdesc, why);
    }
    return inferEntityName(mdesc, parts, why);
}
// The entity a path's own record names, where the record carries the name the
// path's last segment gives.
function markRecordOwner(recordowner, pathStr, parts, ment, entname) {
    const last = parts.filter((part) => !isParam(part)).pop();
    if (null == recordowner[pathStr] && isSchemaRef(ment.ref) &&
        entname === ment.cmp && null != last && entname === (0, utility_1.literalName)(last)) {
        recordowner[pathStr] = entname;
    }
}
function RenameParams(spec) {
    const ctx = spec.ctx;
    const data = spec.data;
    const mdesc = spec.node.val;
    const ment = mdesc.MethodEntity;
    const pathStr = mdesc.path;
    const work = spec.data.work;
    const entname = mdesc.MethodEntity.entname;
    const entdesc = work.entmap[entname];
    const pathdesc = spec.data.work.pathmap[pathStr];
    const methodName = mdesc.method;
    const pathDesc = entdesc.path[pathStr];
    pathDesc.rename = (pathDesc.rename ?? { param: {} });
    pathDesc.why_rename = (pathDesc.why_rename ?? { why_param: {} });
    pathDesc.action = (pathDesc.action ?? {});
    pathDesc.why_action = (pathDesc.why_action ?? {});
    const paramRenameCapture = {
        rename: pathDesc.rename.param = (pathDesc.rename.param ?? {}),
        why: pathDesc.why_rename.why_param = (pathDesc.why_rename.why_param ?? {}),
    };
    const parts = verbParts(pathdesc.parts);
    const applySnakeCaseRename = () => {
        for (const part of parts) {
            if (!isParam(part))
                continue;
            const placeholder = (0, utility_1.paramOf)(part);
            const snake = (0, utility_2.depluralize)((0, jostraca_2.snakify)((0, utility_2.normalizeFieldName)(placeholder)));
            if (snake !== placeholder && paramRenameCapture.rename[placeholder] === undefined) {
                paramRenameCapture.why[placeholder] = (paramRenameCapture.why[placeholder] ?? []);
                updateParamRename(ctx, data, pathStr, methodName, paramRenameCapture, placeholder, snake, 'snake-case');
            }
        }
    };
    // id needs to be t/p/
    const multParamEndMatch = (0, utility_2.pathMatch)(mdesc.path, 'p/p/');
    if (multParamEndMatch) {
        applySnakeCaseRename();
        ment.rename = paramRenameCapture.rename;
        ment.why_rename = paramRenameCapture.why;
        return;
    }
    const origParams = [];
    for (let partI = 0; partI < parts.length; partI++) {
        let partStr = parts[partI];
        if (isParam(partStr)) {
            origParams.push((0, utility_1.paramOf)(partStr).replace(/\*/g, ''));
            const why = [];
            const oldParam = (0, utility_1.paramOf)(partStr);
            paramRenameCapture.why[oldParam] = (paramRenameCapture.why[oldParam] ?? []);
            const lastPart = partI === parts.length - 1;
            const secondLastPart = partI === parts.length - 2;
            const notLastPart = partI < parts.length - 1;
            const hasParent = 0 < partI && !isParam(parts[partI - 1]);
            const parentName = hasParent ? (0, utility_1.literalName)(parts[partI - 1]) : null;
            const not_exact_id = 'id' !== oldParam;
            const probably_an_id = oldParam.endsWith('id')
                || oldParam.endsWith('Id')
                || (0, utility_2.canonize)(oldParam) === parentName
                // GitHub-style `<parent>_number` keys (pull_number, issue_number):
                // the parent's own key under another name. Only when the param sits
                // under its own entity, so a nested collection keeps its parent key.
                || (oldParam.endsWith('_number') && parentName === entdesc.name);
            (0, utility_2.debugpath)(pathStr, mdesc.method, 'RENAME-PARAM-PART', parts, partI, partStr, {
                lastPart,
                secondLastPart,
                notLastPart,
                hasParent,
                parentName,
                not_exact_id,
                probably_an_id,
            });
            // Id-like not at end, and after a possible entname.
            // .../parentent/{id}/...
            if (probably_an_id
                && hasParent
                && notLastPart) {
                why.push('maybe-parent');
                // actually an action
                if (secondLastPart
                    && parentName !== entdesc.name
                    && entdesc.name.startsWith(parentName + '_')) {
                    updateParamRename(ctx, data, pathStr, methodName, paramRenameCapture, oldParam, 'id', 'action-parent:' + entdesc.name);
                    why.push('action');
                    updateAction(methodName, oldParam, parts[partI + 1], entdesc, pathDesc, 'action-not-parent');
                }
                else if (hasParent && parentName === entdesc.name) {
                    updateParamRename(ctx, data, pathStr, methodName, paramRenameCapture, oldParam, 'id', 'id-parent-ent');
                    why.push('id-parent-ent');
                }
                else if (!isNameParam(oldParam)) {
                    updateParamRename(ctx, data, pathStr, methodName, paramRenameCapture, oldParam, parentName + '_id', 'parent:' + parentName);
                    why.push('parent');
                }
            }
            // /api/foo/{foo}/bar/...
            // param matches parent entname, but is not _id format
            // At end, but not called id.
            // .../ent/{not-id}
            else if (lastPart
                && not_exact_id
                && (!hasParent
                    || (parentName === entdesc.name
                        || entdesc.name.endsWith('_' + parentName)))) {
                updateParamRename(ctx, data, pathStr, methodName, paramRenameCapture, oldParam, 'id', 'end-id;' + methodName + ';parent=' + hasParent + '/' + parentName);
                why.push('end-id');
            }
            // Mot at end, has preceding non-param part.
            // .../parentent/{paramname}/...
            else if (notLastPart
                && 1 < partI
                && hasParent) {
                why.push('has-parent');
                // Actually primary ent with an action$ suffix
                if (secondLastPart) {
                    why.push('second-last');
                    if ('id' !== oldParam
                        // && fixEntName(partStr) === entdesc.name
                        && (0, utility_1.literalName)(partStr) === entdesc.name) {
                        updateParamRename(ctx, data, pathStr, methodName, paramRenameCapture, oldParam, 'id', 'end-action');
                        why.push('end-action');
                        updateAction(methodName, oldParam, parts[partI + 1], entdesc, pathDesc, 'end-action');
                    }
                    else {
                        why.push('not-end-action');
                    }
                }
                // Not primary ent.
                else {
                    why.push('default');
                    let newParamName = parentName + '_id';
                    if (newParamName != oldParam && !isNameParam(oldParam)) {
                        updateParamRename(ctx, data, pathStr, methodName, paramRenameCapture, oldParam, newParamName, 'not-primary');
                        why.push('not-primary');
                    }
                }
            }
            why.push('done');
            if (paramRenameCapture.rename[oldParam] === oldParam) {
                why.push('delete-dup');
                delete paramRenameCapture.rename[oldParam];
                delete paramRenameCapture.why[oldParam];
            }
            (0, utility_2.debugpath)(pathStr, methodName, 'RENAME-PARAM', {
                pathStr,
                methodName,
                partStr,
                why,
                oldParam,
                lastPart,
                secondLastPart,
                notLastPart,
                hasParent,
                parentName,
                not_exact_id,
                probably_an_id,
                paramRenameCapture,
                entdesc
            });
        }
    }
    applySnakeCaseRename();
    ment.rename = paramRenameCapture.rename;
    ment.why_rename = paramRenameCapture.why;
    ment.rename_orig = origParams;
}
function FindActions(spec) {
    const mdesc = spec.node.val;
    const pathStr = mdesc.path;
    const work = spec.data.work;
    const ment = mdesc.MethodEntity;
    const entname = ment.entname;
    const entdesc = work.entmap[entname];
    const pathdesc = entdesc.path[pathStr];
    const methodName = mdesc.method;
    pathdesc.action = (pathdesc.action ?? {});
    pathdesc.why_action = (pathdesc.why_action ?? {});
    // The read the method joined has already found the path's actions; the
    // method's own tag names no resource on this path.
    if (null != ment.same_path) {
        return;
    }
    const parts = verbParts(spec.data.work.pathmap[pathStr].parts);
    const fourthLastPart = parts[parts.length - 4];
    const fourthLastPartCanon = (0, utility_1.literalName)(fourthLastPart);
    const thirdLastPart = parts[parts.length - 3];
    const thirdLastPartCanon = (0, utility_1.literalName)(thirdLastPart);
    const secondLastPart = parts[parts.length - 2];
    const secondLastPartCanon = (0, utility_1.literalName)(secondLastPart);
    const lastPart = parts[parts.length - 1];
    const lastPartCanon = (0, utility_1.literalName)(lastPart);
    const cmp = ment.cmp;
    if (null != ment.verb_on_parent) {
        if (isVerb(lastPart)) {
            const name = ment.view_action ?? lastPartCanon;
            pathdesc.action[name] = pathdesc.action[name] ?? {
                why_action: ['ent', entdesc.name, 'verb-on-parent', lastPart, methodName],
            };
        }
    }
    // /api/foo/bar where foo is the entity and bar is the action, no id param
    else if (secondLastPartCanon === cmp
        || secondLastPartCanon === ment.origcmp
        || secondLastPartCanon === entname) {
        if (isVerb(lastPart)) {
            updateAction(methodName, lastPart, lastPartCanon, entdesc, pathdesc, 'no-param');
        }
    }
    //  /api/foo/{param}/action
    else if (thirdLastPartCanon === cmp
        || thirdLastPartCanon === ment.origcmp
        || thirdLastPartCanon === entname) {
        if (isParam(secondLastPart) && isVerb(lastPart)) {
            updateAction(methodName, lastPart, lastPartCanon, entdesc, pathdesc, 'ent-param-2nd-last');
        }
    }
    //  /api/foo/{param}/action/subaction
    else if (fourthLastPartCanon === cmp
        || fourthLastPartCanon === ment.origcmp
        || fourthLastPartCanon === entname) {
        if (isParam(thirdLastPart) && isVerb(secondLastPart) && isVerb(lastPart)) {
            const oldActionName = secondLastPart + '/' + lastPart;
            const actionName = secondLastPartCanon + '_' + lastPartCanon;
            updateAction(methodName, oldActionName, actionName, entdesc, pathdesc, 'ent-param-3rd-last');
        }
    }
    (0, utility_2.debugpath)(pathStr, methodName, 'FIND-ACTIONS', cmp, parts, pathdesc.action, pathdesc.why_action);
    // return pathdesc.action
}
function ResolveOperation(spec) {
    const mdesc = spec.node.val;
    const ment = mdesc.MethodEntity;
    const pathStr = mdesc.path;
    const work = spec.data.work;
    const parts = work.pathmap[pathStr].parts;
    const entname = mdesc.MethodEntity.entname;
    const entdesc = work.entmap[entname];
    const methodName = mdesc.method;
    const why_op = ment.why_op = [];
    let opname = METHOD_IDOP[methodName];
    let standard_opname = opname;
    if (null == opname) {
        why_op.push('no-op:' + methodName);
        return;
    }
    if ('load' === standard_opname) {
        const islist = true !== ment.view_on_parent && isListResponse(mdesc, ment.pm, pathStr, why_op);
        opname = islist ? 'list' : opname;
        if (true === ment.view_on_parent) {
            why_op.push('view');
        }
    }
    else if ('create' === standard_opname && true === ment.post_read) {
        opname = 'list';
        why_op.push('post-read');
    }
    else {
        why_op.push('not-load');
    }
    ment.opname = opname;
    ment.why_opname = why_op;
    // Tally access-token exchanges per entity. An entity whose ops are ALL
    // exchange is deactivated in BuildEntity: it is credential plumbing, not a
    // resource. Counted here rather than in BuildEntity because this is where
    // an op is known to be real — the `no-op` early return above has already
    // discarded the methods that never become operations.
    entdesc.total_ops = (entdesc.total_ops ?? 0) + 1;
    if (null != (0, utility_1.authExchangeOp)(mdesc, (0, utility_1.specSecuredByDefault)(spec.data.def))) {
        entdesc.authexchange_ops = (entdesc.authexchange_ops ?? 0) + 1;
    }
    const pathdesc = entdesc.path[pathStr];
    pathdesc.ops = (pathdesc.ops ?? 0) + 1;
    pathdesc.deprecated_ops = (pathdesc.deprecated_ops ?? 0) + (true === mdesc.deprecated ? 1 : 0);
    const op = pathdesc.op;
    const opdef = {
        method: methodName,
        why_op: why_op.join(';')
    };
    if (null == op[opname]) {
        op[opname] = opdef;
    }
    // Conflicting methods for same operation
    // METHOD_CONSIDER_ORDER wins
    // Add operation using method name
    else {
        op[methodName.toLowerCase()] = opdef;
    }
    (0, utility_2.debugpath)(pathStr, methodName, 'ResolveOperation', standard_opname, opname, why_op, op);
}
function ResolveTransform(spec) {
    const mdesc = spec.node.val;
    const ment = mdesc.MethodEntity;
    const pathStr = mdesc.path;
    const work = spec.data.work;
    const entname = mdesc.MethodEntity.entname;
    const entdesc = work.entmap[entname];
    const pathdesc = entdesc.path[pathStr];
    const methodName = mdesc.method;
    const opname = ment.opname;
    const op = pathdesc.op;
    // Only specify transforms if they are not defaults
    const transform = {
        req: undefined,
        res: undefined,
    };
    const resschema = getResponseSchema(successResponse(mdesc.responses));
    const resprops = resschema?.properties;
    (0, utility_2.debugpath)(pathStr, methodName, 'TRANSFORM-RES', (0, struct_1.keysof)(resprops));
    // A response that is the component the entity is named from is the record
    // itself, though one of its properties shares the entity's name, such as
    // SaladCloud's container group and the container it runs. The entity's cmp
    // is the name after cleaning, so a UserResponse naming user stays a wrapper.
    const rescmp = resschema?.['x-ref'];
    const named = null == rescmp || null == entdesc.cmp ||
        (0, utility_2.cmpRefName)(rescmp) !== entdesc.cmp;
    // A composed response carries the record as one of its parts, such as the
    // project in Neon's project create beside its branch and roles, and may
    // declare properties of its own beside them.
    const partprops = (0, utility_2.mergedProperties)(resschema);
    // A list reads records, so an object named for the entity does not win over
    // a list of them beside it, such as the matches beside the competition a
    // page of them repeats. The list is found in the same parts the name is.
    const records = 'list' === opname && null != partprops ? (0, utility_1.envelopeProp)(partprops, opname) : null;
    const holdsRecord = (prop) => (0, utility_1.isEntityWrapperProp)(prop) &&
        (null == records || true === (0, utility_1.propIsList)(prop));
    if (named && holdsRecord(partprops?.[entdesc.origname])) {
        transform.res = '`body.' + entdesc.origname + '`';
    }
    else if (named && holdsRecord(partprops?.[entdesc.name])) {
        transform.res = '`body.' + entdesc.name + '`';
    }
    else if (resprops) {
        // The wrapper is often named for the CARDINALITY rather than the
        // entity — `{item: {...}}` from a load, `{items: [...]}` from a list —
        // which the entity-name rules above cannot see. Left unwrapped, list()
        // hands back the envelope where the caller expects an array, and the
        // envelope key is mistaken for a field of the entity.
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
    // An item that is the entity's own component is the record, as above.
    const itemref = resschema?.items?.['x-ref'];
    if (null == transform.res && 'list' === opname &&
        (null == itemref || null == entdesc.cmp || (0, utility_2.cmpRefName)(itemref) !== entdesc.cmp)) {
        const key = (0, utility_1.itemEnvelopeKey)(resschema, [entdesc.origname, entdesc.name]);
        if (null != key) {
            transform.res = (0, utility_1.itemEnvelopeTransform)(key);
        }
    }
    const reqschema = getRequestBodySchema(spec.data.def, mdesc);
    (0, utility_2.debugpath)(pathStr, methodName, 'TRANSFORM-REQ', (0, struct_1.keysof)(reqschema?.properties));
    transform.req = (0, utility_1.bodyRequestTransform)(reqschema, [entdesc.origname, entdesc.name]);
    if (!(0, struct_1.isempty)(transform) && null != op[opname]) {
        op[opname].transform = transform;
    }
}
// An API that keeps older versions of a route beside the current one gives
// every version the same selector, so only the first would ever be reached.
// The highest version with an operation the spec does not deprecate is the
// route; each other version becomes an action named for it (v1, v2), or
// suffixes the action its path already has, so it stays reachable.
function VersionActions(spec) {
    const entdesc = spec.node.val;
    const groups = {};
    for (const pathStr of (0, utility_2.sortedKeys)(entdesc.path)) {
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
            const pathdesc = entdesc.path[m.path];
            return (pathdesc.deprecated_ops ?? 0) < (pathdesc.ops ?? 0);
        });
        const route = (0 < live.length ? live : members)
            .reduce((a, b) => b.version > a.version ? b : a);
        for (const m of members) {
            if (m === route) {
                continue;
            }
            const pathdesc = entdesc.path[m.path];
            const vname = 'v' + m.version;
            const why = ['ent', entdesc.name, 'version', vname, 'behind', route.path];
            const actions = pathdesc.action ?? {};
            pathdesc.action = {};
            for (const actname of (0, utility_2.sortedKeys)(actions)) {
                pathdesc.action[actname + '_' + vname] = {
                    why_action: [...actions[actname].why_action, ...why],
                };
            }
            if (0 === (0, utility_2.sortedKeys)(actions).length) {
                pathdesc.action[vname] = { why_action: why };
            }
        }
    }
}
function BuildEntity(spec) {
    const entdesc = spec.node.val;
    const guide = spec.data.guide;
    guide.metrics.count.entity++;
    const entityMap = guide.entity;
    const path = {};
    const rename_param = (pathdesc) => {
        const out = {};
        (0, jostraca_1.each)(pathdesc.rename.param, (item) => {
            out[item.key$] = {
                target: item.val$,
                why_rename: pathdesc.why_rename.why_param[item.key$]
            };
        });
        return out;
    };
    (0, jostraca_1.each)(entdesc.path, (pathdesc, pathstr) => {
        const guidepath = {
            why_path: pathdesc.why_path,
            action: pathdesc.action,
            rename: {
                param: rename_param(pathdesc)
            },
            op: pathdesc.op
        };
        path[pathstr] = guidepath;
    });
    const guideEntity = {
        name: entdesc.name,
        orig: entdesc.origcmp,
        path,
    };
    if (0 < entdesc.authexchange_ops && entdesc.authexchange_ops === entdesc.total_ops) {
        guideEntity.active = false;
        guideEntity.why_inactive = 'auth-exchange';
    }
    entityMap[entdesc.name] = guideEntity;
}
// The noun the shape's literal gives: the literal before a custom method's
// colon, or the noun before the literal when it is a verb, as `/message/send`
// names message.
function pathNoun(pm, parts, why) {
    const at = pm.index + PATH_NAME_INDEX[pm.expr];
    const custom = parts[at].match(CUSTOM_METHOD_RE);
    if (null != custom && !isParam(custom[1])) {
        why.push('noun-before-method=' + custom[1]);
        return (0, utility_1.literalName)(custom[1]);
    }
    const name = (0, utility_1.literalName)(parts[at]);
    const lit = (0, jostraca_2.snakify)(parts[at]);
    if (null != custom || (VERB_WORDS.has(name) && (0, utility_2.depluralize)(lit) === lit)) {
        for (let i = at - 1; 0 <= i; i--) {
            if (!isParam(parts[i])) {
                why.push('noun-before-verb=' + parts[i]);
                return (0, utility_1.literalName)(parts[i]);
            }
        }
    }
    return name;
}
function entityPathMatch_tpte(data, pm, mdesc, pathowner, why) {
    const ment = mdesc.MethodEntity;
    const pathNameIndex = PATH_NAME_INDEX['t/p/t/'];
    const parts = data.work.pathmap[mdesc.path].parts;
    why.push('path=t/p/t/');
    const origPathName = pm[pathNameIndex];
    let entname = pathNoun(pm, parts, why);
    const verbish = entname !== (0, utility_1.literalName)(origPathName);
    let ecm = undefined;
    if (null != ment.cmp) {
        const parent = verbOnParent(data, pm, mdesc, pathowner);
        if (null != parent) {
            entname = parent;
            ment.verb_on_parent = (0, struct_1.getelem)(pm, -1);
            why.push('verb-on-parent=' + parent);
        }
        else {
            ecm = entityCmpMatch(data, entname, mdesc, why);
            entname = ecm.name;
            why.push('has-cmp=' + ecm.orig);
        }
    }
    else if (probableEntityMethod(data, mdesc, pm, why)) {
        ecm = entityCmpMatch(data, entname, mdesc, why);
        if (ecm.cmpish) {
            entname = ecm.name;
            why.push('prob-ent=' + ecm.orig);
        }
        else if (endsWithCmp(data, pm)) {
            entname = (0, utility_1.literalName)((0, struct_1.getelem)(pm, -1));
            why.push('prob-ent-last=' + ecm.orig);
        }
        else if (0 < (0, utility_2.findPathsWithPrefix)(data, pm.path, { strict: true })) {
            entname = (0, utility_1.literalName)((0, struct_1.getelem)(pm, -1));
            why.push('prob-ent-prefix=' + ecm.orig);
        }
        else if (verbish) {
            why.push('prob-ent-noun');
        }
        else {
            entname = (0, utility_1.literalName)((0, struct_1.getelem)(pm, -3)) + '_' + entname;
            why.push('prob-ent-part');
        }
    }
    // Probably an entity action suffix
    else {
        why.push('prob-ent-act');
        entname = (0, utility_1.literalName)((0, struct_1.getelem)(pm, -3));
    }
    return entname;
}
function endsWithCmp(data, pm) {
    const last = (0, utility_1.literalName)((0, struct_1.getelem)(pm, -1));
    return isOrigCmp(data, last);
}
function verbOnParent(data, pm, mdesc, pathowner) {
    const method = mdesc.method;
    if (utility_2.READ_METHODS.includes(method)) {
        return null;
    }
    const ment = mdesc.MethodEntity;
    if (1 < (ment.rescmpoccur ?? ment.cmpoccur ?? 0)) {
        return null;
    }
    const lit = (0, jostraca_2.snakify)((0, struct_1.getelem)(pm, -1));
    if ('' === lit || (0, utility_2.depluralize)(lit) !== lit) {
        return null;
    }
    const verb = (0, utility_2.canonize)((0, struct_1.getelem)(pm, -1));
    const cmp = String(ment.rescmp ?? ment.cmp ?? '');
    if ('' === verb || cmp === verb || cmp.endsWith('_' + verb)) {
        return null;
    }
    const itemPath = leafItemRoute(data, pm);
    return null == itemPath ? null : itemOwner(pm, itemPath, pathowner);
}
// The item route a verb path hangs off, or null when a path extends the
// verb. Paths compare with parameters normalised: the item path may spell
// its key `{id}` where the verb path spells it `{thing_number}`.
function leafItemRoute(data, pm) {
    const normalize = (p) => p.replace(/\{[^}]+\}/g, '{}');
    const itemNorm = normalize(pm.path.replace(/\/[^/]+$/, ''));
    const prefix = normalize(pm.path) + '/';
    let itemPath = null;
    for (const p of Object.keys(data.def?.paths ?? {})) {
        const pn = normalize(p);
        if (pn === itemNorm) {
            itemPath = p;
        }
        // On a segment boundary, so `/merge` is not extended by `/merge-async`.
        else if (pn.startsWith(prefix)) {
            return null;
        }
    }
    return itemPath;
}
// Methods resolve in path order, so the item path's owners are already
// known. The parent is the entity a READ of the item returns: a PUT on the
// item answering with a one-off acknowledgement is named after that and must
// not claim the verb. Fall back to any owner, then the literal.
function itemOwner(pm, itemPath, pathowner) {
    const owners = pathowner[itemPath] ?? {};
    const parent = owners.GET ?? owners.QUERY ??
        Object.values(owners).sort()[0];
    return parent ?? (0, utility_1.literalName)((0, struct_1.getelem)(pm, -3));
}
// A read whose literals after the item key are singular and whose response
// declares no record of its own, or is an array of scalars, is a view of
// the item: the nearest resource above takes it as a load action.
function viewOfItem(data, mdesc, parts, pathowner) {
    if (!utility_2.READ_METHODS.includes(mdesc.method)) {
        return null;
    }
    let key = -1;
    for (let i = 0; i < parts.length; i++) {
        if (isParam(parts[i])) {
            key = i;
        }
    }
    if (key < 0 || parts.length - 1 === key || /version/i.test(parts[key])) {
        return null;
    }
    const tail = parts.slice(key + 1);
    const singular = tail.every((part) => {
        const lit = (0, jostraca_2.snakify)(part);
        return '' !== lit && (0, utility_2.depluralize)(lit) === lit;
    });
    const payload = responsePayload(getResponseSchema(successResponse(mdesc.responses)));
    if ((!payload.scalars && (!singular || payload.record)) ||
        0 < (0, utility_2.findPathsWithPrefix)(data, mdesc.path, { strict: true })) {
        return null;
    }
    const parent = itemAbove(data, parts, key, pathowner);
    return null == parent ? null : { parent, action: tail.map(utility_1.literalName).join('_') };
}
// The entity of the item route a view hangs off, the entity a read of it
// returns, else the noun before the key.
function itemAbove(data, parts, key, pathowner) {
    const itemPath = pathNamed(data, '/' + parts.slice(0, key + 1).join('/'));
    if (null != itemPath) {
        const owners = pathowner[itemPath] ?? {};
        const parent = owners.GET ?? owners.QUERY ?? Object.values(owners).sort()[0];
        if (null != parent) {
            return parent;
        }
    }
    return 0 < key && !isParam(parts[key - 1]) ? (0, utility_1.literalName)(parts[key - 1]) : null;
}
// The path of the definition that is the given path with its parameters
// normalised, or null.
function pathNamed(data, pathStr) {
    const work = data.work;
    if (null == work.normPaths) {
        work.normPaths = Object.create(null);
        for (const p of Object.keys(data.def?.paths ?? {})) {
            work.normPaths[normalizeParams(p)] = work.normPaths[normalizeParams(p)] ?? p;
        }
    }
    return work.normPaths[normalizeParams(pathStr)] ?? null;
}
// What a response carries past its envelopes: whether it reaches an array of
// scalars, and whether the record it reaches declares an id, with that record.
function responsePayload(schema) {
    let node = schema;
    let array = false;
    for (let depth = 0; null != node && 'object' === typeof node && depth < 8; depth++) {
        if ('array' === node.type) {
            array = true;
            node = node.items;
            continue;
        }
        const props = (0, utility_2.mergedProperties)(node);
        if (null == props) {
            break;
        }
        if (null != props.id) {
            return { scalars: false, record: true, node };
        }
        const env = (0, utility_1.strictEnvelopeProp)(props, 'list') ?? (0, utility_1.strictEnvelopeProp)(props, 'load');
        if (null == env) {
            break;
        }
        node = props[env];
    }
    const scalar = null != node && 'object' === typeof node &&
        SCALAR_TYPES.has(node.type) && null == (0, utility_2.mergedProperties)(node);
    return { scalars: array && scalar, record: false, node };
}
// The record component the item route of a path answers with, the path's own
// when it ends with a parameter, else the item route beneath it: null for none.
function recordOf(data, pathStr) {
    const work = data.work;
    work.itemRecords = work.itemRecords ?? Object.create(null);
    if (pathStr in work.itemRecords) {
        return work.itemRecords[pathStr];
    }
    const parts = (0, utility_1.pathParts)(pathStr);
    const itemPath = isParam(parts[parts.length - 1]) ? pathStr :
        pathNamed(data, pathStr + '/{}');
    let found = null;
    const orig = null == itemPath ? null : itemRecordRef(data, itemPath);
    if (null != orig && 1 === itemRecordRoutes(data)[orig].size) {
        const cmp = (0, utility_2.cleanComponentName)((0, utility_2.canonizeCmpName)(orig), (n) => null != data.guide.metrics.count.origcmprefs[n]);
        found = { cmp, orig };
    }
    work.itemRecords[pathStr] = found;
    return found;
}
// The component an item route's read answers with when it declares an id.
function itemRecordRef(data, itemPath) {
    const read = data.def?.paths?.[itemPath]?.get;
    const payload = responsePayload(getResponseSchema(successResponse(read?.responses)));
    const xref = payload.record ? payload.node['x-ref'] : null;
    const m = 'string' === typeof xref ? xref.match(/\/(components\/schemas|definitions)\/(.+)$/) : null;
    return null == m ? null : m[2];
}
// The collections whose item routes answer each record, by the item path
// with its parameters normalised: a record shared by several names none.
function itemRecordRoutes(data) {
    const work = data.work;
    if (null == work.itemRecordRoutes) {
        work.itemRecordRoutes = Object.create(null);
        for (const p of Object.keys(data.def?.paths ?? {})) {
            const parts = (0, utility_1.pathParts)(p);
            const orig = 0 < parts.length && isParam(parts[parts.length - 1]) ? itemRecordRef(data, p) : null;
            if (null != orig) {
                (work.itemRecordRoutes[orig] = work.itemRecordRoutes[orig] ?? new Set()).add(normalizeParams(p));
            }
        }
    }
    return work.itemRecordRoutes;
}
// Whether a component's name holds the literal's words in a row, compared
// singular: such a name wraps the literal and the literal keeps naming.
function wrapsLiteral(cmp, lit) {
    const cw = cmp.split('_').map((w) => (0, utility_2.depluralize)(w));
    const lw = lit.split('_').map((w) => (0, utility_2.depluralize)(w));
    for (let i = 0; i + lw.length <= cw.length; i++) {
        if (lw.every((w, j) => w === cw[i + j])) {
            return true;
        }
    }
    return false;
}
// A POST addressed to a singular literal that names no component, with no
// item route above it to be a verb on or beneath it to be a collection, is a
// command: its body component names it.
function commandName(data, mdesc, pm, parts, why) {
    const ment = mdesc.MethodEntity;
    if ('POST' !== mdesc.method || null != ment.verb_on_parent ||
        !LITERAL_LAST_SHAPES.includes(pm.expr)) {
        return null;
    }
    const last = (0, struct_1.getelem)(pm, -1);
    const lit = (0, jostraca_2.snakify)(last);
    if ('' === lit || (0, utility_2.depluralize)(lit) !== lit || pathNoun(pm, parts, []) !== (0, utility_1.literalName)(last) ||
        isOrigCmp(data, (0, utility_1.literalName)(last)) || null != keyParamOf(data.def, mdesc.path, data.work) ||
        ('t/p/t/' === pm.expr && null != leafItemRoute(data, pm)) || readsRecord(data, mdesc.path)) {
        return null;
    }
    const name = commandBodyName(data, mdesc);
    if (null != name) {
        why.push('command=' + name);
    }
    return name;
}
// A path whose read answers with a record is a resource, not a command.
function readsRecord(data, pathStr) {
    const mdef = data.def?.paths?.[pathStr]?.get;
    return null != mdef && responsePayload(getResponseSchema(successResponse(mdef.responses))).record;
}
// The name a command's body component gives under any media type, the first
// member of a oneOf, its affixes stripped. A body that is no object, such as
// an upload, names nothing.
function commandBodyName(data, mdesc) {
    const body = (0, body_1.selectedRequestSchema)(data.def, mdesc.method, mdesc.path) ?? mdesc.requestBody?.schema;
    const member = Array.isArray(body?.oneOf) ? body.oneOf[0] :
        Array.isArray(body?.anyOf) ? body.anyOf[0] : body;
    const xref = member?.['x-ref'];
    if ('string' !== typeof xref || null == (0, utility_2.mergedProperties)(member)) {
        return null;
    }
    let name = (0, utility_2.cleanComponentName)((0, utility_2.canonizeCmpName)((0, utility_2.cmpRefName)(xref)), (n) => null != data.guide.metrics.count.origcmprefs[n]);
    for (;;) {
        const suffix = COMMAND_SUFFIXES.find((sfx) => name.endsWith(sfx) && sfx.length < name.length);
        if (null == suffix) {
            break;
        }
        name = name.slice(0, -suffix.length);
    }
    return '' === name ? null : name;
}
// A read on a command's path is the command's load.
function commandTwin(data, mdesc, pm, parts, why) {
    const post = data.def?.paths?.[mdesc.path]?.post;
    if (!utility_2.READ_METHODS.includes(mdesc.method) || null == post || 'object' !== typeof post) {
        return null;
    }
    const twin = { method: 'POST', path: mdesc.path, responses: post.responses, MethodEntity: {} };
    const name = commandName(data, twin, pm, parts, []);
    if (null != name) {
        why.push('command-twin=' + name);
    }
    return name;
}
// A POST whose literal opens with a read verb and answers with a collection
// lists the noun the literal names, the body its filter; '' keeps the shape's
// name where the literal is the verb alone.
function postRead(mdesc, pm, parts, why) {
    if ('POST' !== mdesc.method) {
        return null;
    }
    const verbs = verbParts(parts);
    const last = verbs[verbs.length - 1];
    const lit = (0, jostraca_2.snakify)(last);
    const verb = READ_VERBS.find((v) => lit === v || lit.startsWith(v + '_'));
    if (null == verb || isParam(last) || !isListResponse(mdesc, pm, mdesc.path, [])) {
        return null;
    }
    mdesc.MethodEntity.post_read = true;
    why.push('post-read=' + verb);
    const noun = lit.slice(verb.length + 1);
    return '' === noun ? '' : (0, utility_1.literalName)(noun);
}
// The collection of an item route whose method its tag alone names, when the
// route answers nothing.
function tagItemCollection(data, mdesc, parts) {
    const ment = mdesc.MethodEntity;
    if (null == ment || 'tag' !== ment.ref || null != ment.rescmp) {
        return null;
    }
    const lits = parts.slice(0, parts.findIndex(isParam));
    if (0 === lits.length || !parts.slice(lits.length).every(isParam)) {
        return null;
    }
    const answers = Object.entries(data.def?.paths?.[mdesc.path] ?? {})
        .some(([method, mdef]) => null != METHOD_CONSIDER_ORDER[method.toUpperCase()] &&
        null != getResponseSchema(successResponse(mdef?.responses)));
    return answers ? null : '/' + lits.join('/');
}
// The collection that names a tag-named item route, given the record owners
// known so far: by its record, where the tag names another resource with one
// (GitHub's invitations), or by its segment, where the routes the tag gathers
// from several collections would share a selector (Apicurio's well-known
// routes). Null where the route keeps the name its own path gives.
function collectionNaming(data, mdesc, parts, recordowner) {
    const collection = tagItemCollection(data, mdesc, parts);
    if (null == collection) {
        return null;
    }
    const work = data.work;
    const cmp = mdesc.MethodEntity.cmp;
    if (true === work.recordResources[cmp]) {
        const record = recordowner[collection] ?? recordowner[collection + '/'];
        return null == record ? null : { collection, record };
    }
    return tagCollides(data.def, work.tagItems[cmp] ?? {}) ? { collection } : null;
}
// The entity of an item route its collection names: the collection's record,
// or its segment. A route outside the collection that has the segment puts the
// tag before it, and one that has that name too a number from 2 after the
// stored form, which a cut would otherwise drop. The routes a tag names leave
// it its own name as a segment, which is numbered rather than doubled.
function itemOfCollection(data, mdesc, parts) {
    const naming = collectionNaming(data, mdesc, parts, data.work.recordowner);
    if (null == naming) {
        return null;
    }
    if (null != naming.record) {
        return { name: naming.record, why: 'collection-record' };
    }
    const work = data.work;
    const collection = naming.collection;
    const cmp = mdesc.MethodEntity.cmp;
    const segment = (0, utility_1.literalName)(collection.substring(collection.lastIndexOf('/') + 1));
    const own = segment === cmp;
    const tagged = own ? segment : cmp + '_' + segment;
    const tagOwn = own ? (path) => tagNamesRoute(data, path, cmp) : undefined;
    for (const name of own ? [segment] : [segment, tagged]) {
        if (!segmentHeld(work, name, collection, name === segment ? tagOwn : undefined)) {
            return { name, why: 'collection-segment' };
        }
    }
    const stored = (0, utility_2.ensureMinEntityName)(tagged, {});
    let i = 2;
    while (keyHeld(work, [stored + i], collection)) {
        i++;
    }
    return { name: stored + i, why: 'collection-segment', stored: true };
}
// A route outside the collection has the name: one named already under its
// stored form or the key it would take now, or one that claims the name, its
// stored form or that key.
function segmentHeld(work, name, collection, exempt) {
    return keyHeld(work, [name, (0, utility_2.ensureMinEntityName)(name, {}),
        (0, utility_2.ensureMinEntityName)(name, work.entmap)], collection, exempt);
}
// Every method of the route is named by the tag alone, and none is an item
// route the tag gathers, whose collection may name it apart.
function tagNamesRoute(data, path, cmp) {
    const parts = data.work.pathmap[path]?.parts ?? [];
    const methods = (data.work.methods ?? []).filter((mdesc) => path === mdesc.path);
    return 0 < methods.length && methods.every((mdesc) => 'tag' === mdesc.MethodEntity?.ref && cmp === mdesc.MethodEntity.cmp &&
        null == tagItemCollection(data, mdesc, parts));
}
// A route outside the collection is named under one of the keys or claims one.
// An item route its collection names makes no claim, so it counts only once
// named.
function keyHeld(work, keys, collection, exempt) {
    return keys.some((key) => [work.entmap[key]?.path, work.claims[key]]
        .some((paths) => Object.keys(paths ?? {}).some((path) => outsideCollection(path, collection) && true !== exempt?.(path))));
}
// A route under the collection is its own when it has no parameter or its
// first parameter follows the collection: one under a collection nested in it
// is outside.
function outsideCollection(path, collection) {
    if (!(path + '/').startsWith(collection + '/')) {
        return true;
    }
    const parts = (0, utility_1.pathParts)(path);
    const first = parts.findIndex(isParam);
    return -1 < first && collection !== '/' + parts.slice(0, first).join('/');
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
function pathReads(pathdef) {
    return Object.entries(pathdef ?? {}).some(([method, mdef]) => 'GET' === method.toUpperCase() && null != mdef);
}
function isSchemaRef(ref) {
    return null != ref && '' !== ref && 'tag' !== ref;
}
function isOrigCmp(data, name) {
    return null != data.guide.metrics.count.origcmprefs[name];
}
function entityOccursInPath(parts, entname) {
    return parts.some(p => p[0] !== '{' && (0, utility_1.literalName)(p.toLowerCase()) === entname);
}
function entityPathMatch_tpe(data, pm, mdesc, why) {
    const ment = mdesc.MethodEntity;
    why.push('path=t/p/');
    let entname = pathNoun(pm, data.work.pathmap[mdesc.path].parts, why);
    if (null != ment.cmp || probableEntityMethod(data, mdesc, pm, why)) {
        let ecm = entityCmpMatch(data, entname, mdesc, why);
        entname = ecm.name;
    }
    else {
        why.push('ent-act');
    }
    return entname;
}
function entityPathMatch_pte(data, pm, mdesc, why) {
    const ment = mdesc.MethodEntity;
    why.push('path=p/t/');
    let entname = pathNoun(pm, data.work.pathmap[mdesc.path].parts, why);
    if (null != ment.cmp || probableEntityMethod(data, mdesc, pm, why)) {
        let ecm = entityCmpMatch(data, entname, mdesc, why);
        entname = ecm.name;
    }
    else {
        why.push('ent-act');
    }
    return entname;
}
function entityPathMatch_te(data, pm, mdesc, why) {
    const ment = mdesc.MethodEntity;
    why.push('path=t/');
    let entname = pathNoun(pm, data.work.pathmap[mdesc.path].parts, why);
    if (null != ment.cmp || probableEntityMethod(data, mdesc, pm, why)) {
        let ecm = entityCmpMatch(data, entname, mdesc, why);
        entname = ecm.name;
    }
    else {
        why.push('ent-act');
    }
    return entname;
}
function entityPathMatch_tpp(data, pm, mdesc, why) {
    const ment = mdesc.MethodEntity;
    why.push('path=t/p/p');
    let entname = pathNoun(pm, data.work.pathmap[mdesc.path].parts, why);
    if (null != ment.cmp || probableEntityMethod(data, mdesc, pm, why)) {
        let ecm = entityCmpMatch(data, entname, mdesc, why);
        entname = ecm.name;
    }
    else {
        why.push('ent-act');
    }
    return entname;
}
// The JSON body a method sends, a Swagger 2 body parameter included.
function getRequestBodySchema(def, mdesc) {
    return (0, body_1.requestSchema)(def, mdesc.method, mdesc.path) ?? mdesc.requestBody?.schema;
}
// The response an operation's result is read from, down to an Accepted
// response when nothing else answers, whose body may be the job it queued.
function successResponse(responses) {
    return responses?.[200] ?? responses?.[201] ?? responses?.[202];
}
// The response schemas an operation answers with when it succeeds, in the
// order they are tried. An Accepted response names nothing, since its body
// may describe the work rather than the resource.
function successSchemas(responses) {
    return ['200', '201']
        .map((rescode) => getResponseSchema(responses?.[rescode]))
        .filter((schema) => null != schema);
}
// A read answered only by an Accepted response is named from it when another
// operation answers with the same record in a 200 or 201, which shows the
// record is a resource rather than the work queued.
function namingSchemas(method, responses, answered, envelope) {
    const schemas = successSchemas(responses);
    if (0 === schemas.length && utility_2.READ_METHODS.includes(method)) {
        const accepted = getResponseSchema(responses?.[202]);
        if (true === answered[namingRef(accepted, envelope) ?? '']) {
            schemas.push(accepted);
        }
    }
    return schemas;
}
function answeredRefs(def, envelope) {
    const answered = Object.create(null);
    for (const pathdef of Object.values(def?.paths ?? {})) {
        for (const [method, mdef] of Object.entries(pathdef ?? {})) {
            if (null == METHOD_CONSIDER_ORDER[method.toUpperCase()] ||
                null == mdef || 'object' !== typeof mdef) {
                continue;
            }
            for (const schema of successSchemas(mdef.responses)) {
                const ref = namingRef(schema, envelope);
                if (null != ref) {
                    answered[ref] = true;
                }
            }
        }
    }
    return answered;
}
// The component a response schema names through: the record an envelope
// carries, else the schema's own component, else its array items'.
function namingRef(schema, envelope) {
    const xref = schema?.['x-ref'];
    if (null != xref) {
        const itemref = envelope[xref];
        return null == itemref || '' === itemref ? xref : itemref;
    }
    return 'array' === schema?.type ? schema.items?.['x-ref'] : undefined;
}
function getResponseSchema(response) {
    return response?.content?.['application/json']?.schema ??
        response?.schema;
}
// The record a path answers with, read from its methods in the order they are
// considered, so a read decides before a write.
function pathRecordRef(def, pathStr, methods, collection, accepted = true) {
    const rank = (method) => METHOD_CONSIDER_ORDER[method] ?? Number.MAX_SAFE_INTEGER;
    const ordered = [...methods].sort((a, b) => rank(a) - rank(b) || (0, refcount_1.byCodePoint)(a, b));
    for (const method of ordered) {
        const ref = routeRecordRef(def, pathStr, method, collection, accepted);
        if (null != ref) {
            return ref;
        }
    }
    return null;
}
// The component of the record a route answers with: the schema's own, its
// items', or the one its envelope carries, such as the job summary in Mux's
// `{ data }`. Only a collection reads a page, so beneath the collection a
// team that holds nothing but its members is a team. Null when the answer
// names no component, or is Accepted and `accepted` excludes it.
function routeRecordRef(def, pathStr, method, collection, accepted = true) {
    const responses = def?.paths?.[pathStr]?.[method.toLowerCase()]?.responses;
    const schema = getResponseSchema(accepted ? successResponse(responses) :
        responses?.[200] ?? responses?.[201]);
    if (null == schema || 'object' !== typeof schema) {
        return null;
    }
    if ('array' === schema.type) {
        return schema.items?.['x-ref'] ?? null;
    }
    const xref = schema['x-ref'];
    const props = (0, utility_2.mergedProperties)(schema) ?? {};
    for (const opname of collection ? ['list', 'load'] : ['load']) {
        const key = (0, utility_1.envelopeProp)(props, opname);
        const record = null == key ? null :
            'list' === opname ? props[key]?.items : props[key];
        if (null != record?.['x-ref']) {
            return record['x-ref'];
        }
    }
    return xref ?? null;
}
function inferEntityName(mdesc, parts, why) {
    // A route with no literal is named for its first parameter's noun.
    const param = parts.find(isParam)?.match(/\{([^}]+)\}/);
    const noun = null == param ? '' : (0, utility_1.paramNoun)(param[1]);
    if (3 <= noun.length) {
        why.push('infer-param');
        return noun;
    }
    // Try operationId: e.g. "getUser" -> "user", "listProducts" -> "product"
    if (mdesc.operationId) {
        const opid = (0, utility_2.canonize)(mdesc.operationId);
        if (opid.length >= 3) {
            why.push('infer-opid');
            return opid;
        }
    }
    // Try response schema title
    const response = mdesc.responses?.[200] ?? mdesc.responses?.[201];
    const resSchema = getResponseSchema(response);
    if (resSchema?.title) {
        const title = (0, utility_2.canonize)(resSchema.title);
        if (title.length >= 3) {
            why.push('infer-res-title');
            return title;
        }
    }
    // Try last non-param path segment
    for (let i = parts.length - 1; i >= 0; i--) {
        if (!isParam(parts[i])) {
            const seg = (0, utility_1.literalName)(parts[i]);
            if (seg.length >= 3) {
                why.push('infer-path-seg');
                return seg;
            }
        }
    }
    // A tag names only a route with no usable literal.
    const tag = mdesc.MethodEntity?.cmp;
    if ('tag' === mdesc.MethodEntity?.ref && 'string' === typeof tag && 3 <= tag.length) {
        why.push('infer-tag');
        return tag;
    }
    return null;
}
function probableEntityMethod(data, mdesc, pm, why) {
    const reqSchema = getRequestBodySchema(data.def, mdesc);
    const response = mdesc.responses?.['201'] || mdesc.responses?.['200'];
    const resSchema = getResponseSchema(response);
    const noResponse = null == resSchema && null != mdesc.responses?.['204'];
    let prob_why = '';
    let probent = false;
    if (noResponse) {
        // No response at all means not an action, thus probably an entity.
        prob_why = 'nores';
        probent = true;
    }
    else if (null != reqSchema) {
        if ('POST' === mdesc.method
            && !pm.expr.endsWith('/p/')
            // A real entity would probably occur in at least one other t/p path
            // otherwise this is probably an action
            && (1 < (0, utility_2.sortedKeys)(data.def.paths).filter(path => path.includes('/' + pm[pm.length - 1] + '/')).length)) {
            prob_why = 'post';
            probent = true;
        }
        else if (('PUT' === mdesc.method || 'PATCH' === mdesc.method)
            && pm.expr.endsWith('/p/')) {
            prob_why = 'putish';
            probent = true;
        }
        // QUERY (RFC 10008) carries a filter body but is a safe read, so — like
        // GET — it implies an entity, not an action.
        else if ('QUERY' === mdesc.method) {
            prob_why = 'query';
            probent = true;
        }
    }
    else if ('GET' === mdesc.method) {
        prob_why = 'get';
        probent = true;
    }
    const rescodes = (0, utility_2.sortedKeys)(mdesc.responses ?? {});
    (0, utility_2.debugpath)(mdesc.path, mdesc.method, 'PROBABLE-ENTITY-RESPONSE', { mdesc, responses: rescodes, probent, prob_why });
    why.push('entres=' + probent + '/' + rescodes + ('' === prob_why ? '' : '/' + prob_why));
    return probent;
}
function entityCmpMatch(data, entname, mdesc, why) {
    const ment = mdesc.MethodEntity;
    let out = {
        name: entname,
        orig: ment.origcmp ?? entname,
        cmpish: false,
        pathish: true,
    };
    const cmpInfrequent = (ment.method_rate < IS_ENTCMP_METHOD_RATE
        || ment.path_rate < IS_ENTCMP_PATH_RATE);
    const cmpShared = true === data.work.sharing.yields[ment.origcmpref + ' ' + mdesc.method + ' ' + mdesc.path];
    // CallRouteOptionV2 answering /call_routes/{id}/options/{id}: the record
    // names the path's resource, qualified by its parent and versioned.
    const unversioned = (ment.cmp ?? '').replace(/_v\d+$/, '');
    const qualifies = unversioned !== ment.cmp && unversioned.endsWith('_' + entname);
    const record = recordOf(data, mdesc.path);
    // The key parameter names the component, whatever the literal beside it:
    // `/b/{bucket}` answering with a Bucket.
    if (null != ment.cmp
        && entname != ment.cmp
        && 'tag' !== ment.ref
        && keyParamNames(data, mdesc, ment.cmp)) {
        why.push('cmp-names-key');
        out.name = ment.cmp;
        out.orig = ment.origcmp;
        out.cmpish = true;
        out.pathish = false;
    }
    // The record an item route answers names the item and its collection,
    // whatever its frequency, unless the record's name wraps the literal's.
    else if (null != record
        && record.cmp !== entname
        && !wrapsLiteral(record.cmp, entname)) {
        why.push('cmp-record=' + record.orig);
        out.name = record.cmp;
        out.orig = record.orig;
        out.cmpish = true;
        out.pathish = false;
    }
    else if (null != ment.cmp
        && entname != ment.cmp
        && !ment.cmp.startsWith(entname)) {
        if (cmpInfrequent && cmpShared) {
            why.push('cmp-shared');
        }
        // A tag that is not the path's own noun groups routes; the noun names them.
        if ('tag' === ment.ref && !ID_LITERAL_RE.test(entname) &&
            !tagHolds(data, data.work.pathmap[mdesc.path].parts, mdesc.path, ment.cmp)) {
            why.push('path-over-tag');
        }
        else if (qualifies) {
            why.push('cmp-qualifies-path');
            out.name = unversioned;
            out.orig = ment.origcmp;
            out.cmpish = true;
            out.pathish = false;
        }
        else if (cmpInfrequent && !cmpShared) {
            why.push('cmp-primary');
            out.name = ment.cmp;
            out.orig = ment.origcmp;
            out.cmpish = true;
            out.pathish = false;
            why.push('cmp-infreq');
        }
        else if (cmpOccursInPath(data, ment.cmp)) {
            why.push('cmp-path');
            out.name = ment.cmp;
            out.orig = ment.origcmp;
            out.cmpish = true;
            out.pathish = false;
            why.push('cmp-inpath');
        }
        else {
            why.push('path-over-cmp');
        }
    }
    else if ('DELETE' === mdesc.method
        && null == ment.cmp) {
        let cmps = findcmps(data, mdesc.path, ['responses'], { uniq: true })
            .flatMap((found) => unwrapCmp(data.guide.metrics, found, why));
        if (1 === cmps.length) {
            out.name = cmps[0].cmp;
            out.orig = cmps[0].origcmp;
            out.cmpish = true;
            out.pathish = false;
            why.push('cmp-found-delete');
        }
        else {
            why.push('path-primary-delete');
        }
    }
    else {
        why.push('path-primary');
    }
    (0, utility_2.debugpath)(mdesc.path, mdesc.method, 'ENTITY-CMP-NAME', mdesc.path, mdesc.method, entname + '->', out, why, ment, IS_ENTCMP_METHOD_RATE, IS_ENTCMP_PATH_RATE);
    return out;
}
// A tag keeps naming a route whose noun it is not when it names a literal
// before the naming literal and the route is a leaf, or ends with a key
// whose literal is singular: a selector or a view of the tag's resource.
function tagHolds(data, parts, pathStr, tag) {
    const pm = matchEntityPath(parts);
    if (null == pm) {
        return false;
    }
    const at = pm.index + PATH_NAME_INDEX[pm.expr];
    if (!parts.slice(0, at).some((part) => !isParam(part) && (0, utility_1.literalName)(part) === tag)) {
        return false;
    }
    if (isParam(parts[parts.length - 1])) {
        const lit = (0, jostraca_2.snakify)(parts[at]);
        return '' !== lit && (0, utility_2.depluralize)(lit) === lit;
    }
    return 0 === (0, utility_2.findPathsWithPrefix)(data, pathStr, { strict: true });
}
// The key parameter names the component, as a bucket's key does beside the
// literal b, and a collection through the item route beneath it.
function keyParamNames(data, mdesc, cmp) {
    const key = keyParamOf(data.def, mdesc.path, data.work);
    return null != key && (0, utility_2.canonizeParam)(key) === cmp;
}
// The name of the parameter that keys a route's records: its own trailing
// parameter, or the one the item route directly beneath a collection takes.
function keyParamOf(def, pathStr, work) {
    const parts = (0, utility_1.pathParts)(pathStr);
    const pm = matchEntityPath(parts);
    if (null == pm) {
        return null;
    }
    const last = parts[parts.length - 1];
    if (pm.expr.endsWith('p/') && isParam(last)) {
        return (0, utility_1.paramOf)(last);
    }
    if (isParam(last)) {
        return null;
    }
    work.childKeys = work.childKeys ?? childKeyIndex(def);
    return work.childKeys[normalizeParams(pathStr)] ?? null;
}
function normalizeParams(pathStr) {
    return pathStr.replace(/\{[^}]+\}/g, '{}');
}
// The parameter each path takes directly beneath it, keyed by the path with
// its parameters normalised.
function childKeyIndex(def) {
    const index = Object.create(null);
    for (const p of Object.keys(def?.paths ?? {}).sort()) {
        const parts = (0, utility_1.pathParts)(p);
        const last = parts[parts.length - 1];
        if (1 < parts.length && isParam(last)) {
            const parent = normalizeParams('/' + parts.slice(0, -1).join('/'));
            index[parent] = index[parent] ?? (0, utility_1.paramOf)(last);
        }
    }
    return index;
}
// A wrapper names the component it wraps, or nothing: the candidate is
// replaced or dropped. The replacement keeps the candidate's other fields.
function unwrapCmp(metrics, xref, why) {
    const inner = (0, utility_2.wrapperOf)(xref.cmp, Object.keys(metrics.found.cmp).sort());
    if (null == inner) {
        return [xref];
    }
    why.push('wrapper=' + xref.cmp + ('' === inner ? '' : '>' + inner));
    if ('' === inner) {
        return [];
    }
    const orig = metrics.found.cmp[inner]?.orig ?? inner;
    const out = { ...xref, cmp: inner, origcmp: orig };
    if (null != xref.val) {
        out.val = xref.val.replace(/[^/]+$/, orig);
    }
    if (null != xref.origcmpref) {
        out.origcmpref = inner;
    }
    return [out];
}
function cmpOccursInPath(data, cmpname) {
    if (null == data.work.potentialCmpsFromPaths) {
        data.work.potentialCmpsFromPaths = Object.create(null);
        (0, jostraca_1.each)(data.def.paths, (_pathdef, pathstr) => {
            const parts = data.work.pathmap[pathstr].parts;
            parts
                .filter(p => !p.startsWith('{'))
                .map(p => data.work.potentialCmpsFromPaths[(0, utility_1.literalName)(p)] = true);
        });
    }
    return null != data.work.potentialCmpsFromPaths[cmpname];
}
function matchEntityPath(parts) {
    for (const shape of ENTITY_PATH_SHAPES) {
        const pm = (0, utility_2.pathMatch)(parts, shape);
        if (null != pm) {
            return pm;
        }
    }
    return null;
}
// The resource a method's path names by itself, as its shape names it. A
// write to a singular trailing literal is a verb on another resource, and
// names none.
function pathResource(parts, method) {
    const pm = matchEntityPath(parts);
    if (null == pm) {
        return null;
    }
    const last = parts[parts.length - 1];
    if (!utility_2.READ_METHODS.includes(method) && !isParam(last)) {
        const lit = (0, jostraca_2.snakify)(last);
        if ('' !== lit && (0, utility_2.depluralize)(lit) === lit) {
            return null;
        }
    }
    return (0, utility_1.literalName)(pm[PATH_NAME_INDEX[pm.expr]]);
}
// The routes that keep their own path's name for the component they answer
// with, each keyed `cmp METHOD path`: those of a component that several
// resources share, where a record (one that declares an `id`) is never shared.
function sharedRoutes(routes, records) {
    const bycmp = Object.create(null);
    for (const route of routes) {
        const parts = (0, utility_1.pathParts)(route.path);
        const resource = pathResource(parts, route.method);
        if (null != resource && !records.includes(route.cmp)) {
            (bycmp[route.cmp] = bycmp[route.cmp] ?? []).push({ ...route, parts, resource });
        }
    }
    const taking = [];
    for (const cmp of Object.keys(bycmp).sort()) {
        const names = new Set(bycmp[cmp].map((entry) => entry.resource));
        const counted = bycmp[cmp].filter((entry) => !isSharingView(entry, names));
        const group = aliasGroups(counted);
        if (new Set(counted.map((entry) => group[entry.resource])).size < 2) {
            continue;
        }
        const members = Object.create(null);
        for (const name of new Set(counted.map((entry) => entry.resource))) {
            members[group[name]] = (members[group[name]] ?? 0) + 1;
        }
        taking.push(...counted.filter((entry) => 1 === members[group[entry.resource]]));
    }
    const cmps = Object.create(null);
    const routesOf = Object.create(null);
    for (const entry of taking) {
        (cmps[entry.resource] = cmps[entry.resource] ?? new Set()).add(entry.cmp);
        const key = entry.resource + ' ' + entry.op + ' ' + paramNames(entry.parts);
        (routesOf[key] = routesOf[key] ?? new Set()).add(entry.path);
    }
    const blocked = new Set(Object.keys(cmps).filter((name) => 1 < cmps[name].size));
    for (const key of Object.keys(routesOf)) {
        if (1 < routesOf[key].size) {
            blocked.add(key.split(' ')[0]);
        }
    }
    return taking
        .filter((entry) => !blocked.has(entry.resource))
        .map((entry) => entry.cmp + ' ' + entry.method + ' ' + entry.path)
        .sort();
}
// A route beneath a segment that names another of the component's resources
// is a view of that resource, such as `/builds/latest` of `/builds`.
function isSharingView(entry, names) {
    for (let i = 1; i < entry.parts.length; i++) {
        const name = pathResource(entry.parts.slice(0, i), 'GET');
        if (null != name && name !== entry.resource && names.has(name)) {
            return true;
        }
    }
    return false;
}
// Item routes under the same parent keyed by the same parameters address the
// same records, so the resources they name are one: each maps to its group.
function aliasGroups(entries) {
    const group = Object.create(null);
    const find = (name) => group[name] === name ? name : find(group[name]);
    for (const entry of entries) {
        group[entry.resource] = entry.resource;
    }
    const first = Object.create(null);
    for (const entry of entries) {
        if (!isParam(entry.parts[entry.parts.length - 1])) {
            continue;
        }
        const pm = matchEntityPath(entry.parts);
        const parent = entry.parts.slice(0, pm.index + PATH_NAME_INDEX[pm.expr])
            .map((p) => isParam(p) ? '{}' : p).join('/');
        const key = parent + ' ' + paramNames(entry.parts);
        const other = first[key] = first[key] ?? entry.resource;
        const [a, b] = [find(other), find(entry.resource)].sort();
        group[b] = a;
    }
    for (const name of Object.keys(group)) {
        group[name] = find(name);
    }
    return group;
}
function paramNames(parts) {
    return parts.filter(isParam).sort().join(',');
}
// The schema a local `$ref` pointer names in the definition.
function refSchema(def, xref) {
    if (!xref.startsWith('#/')) {
        return undefined;
    }
    let node = def;
    for (const seg of xref.slice(2).split('/')) {
        const key = seg.replace(/~1/g, '/').replace(/~0/g, '~');
        node = null != node && 'object' === typeof node && Object.prototype.hasOwnProperty.call(node, key)
            ? node[key] : undefined;
    }
    return node;
}
// Whether a share's record is apart from an item's: both declare an `id`, and
// the share has no more than half of its properties in common with the item,
// since a collection's list is routinely a summary of its item's record.
function distinctRecord(share, item) {
    if (!declaresId(share) || !declaresId(item)) {
        return false;
    }
    const own = Object.keys((0, utility_2.mergedProperties)(share) ?? {});
    const theirs = (0, utility_2.mergedProperties)(item) ?? {};
    const common = own.filter((name) => Object.prototype.hasOwnProperty.call(theirs, name));
    return common.length * 2 <= own.length;
}
// Whether a collection share answers with a record apart from the one its item
// route answers with, both read from a 200 or 201: an Accepted body may
// describe the queued work rather than a resource. A share that reads stays,
// since a list's records, however summarised, are the collection's items.
function distinctShare(def, sharePath, shareMethods, itemPath, itemMethods) {
    if (shareMethods.some((method) => utility_2.READ_METHODS.includes(method))) {
        return false;
    }
    const share = pathRecordRef(def, sharePath, shareMethods, true, false);
    const item = pathRecordRef(def, itemPath, itemMethods, false, false);
    return null != share && null != item && share !== item &&
        distinctRecord(refSchema(def, share), refSchema(def, item));
}
function declaresId(schema) {
    return null != (0, utility_2.mergedProperties)(schema)?.id;
}
// The operation ResolveOperation will assign, needed before the entity is
// named: whether a response unwraps as an envelope depends on it.
function methodOpname(mdesc, pm, why) {
    const opname = METHOD_IDOP[mdesc.method];
    return 'load' === opname && isListResponse(mdesc, pm, mdesc.path, why) ? 'list' : opname;
}
function isListResponse(mdesc, pm, pathStr, why) {
    let islist = false;
    let schema;
    const endParamAnchored = !!(pm && pm.expr.endsWith('p/'));
    const endParamBare = !!(pm && !endParamAnchored && pm.expr.endsWith('p'));
    if (endParamAnchored) {
        why.push('end-param');
    }
    else {
        schema = getResponseSchema(successResponse(mdesc.responses));
        if (null == schema) {
            why.push('no-schema');
        }
        else {
            if (schema.type === 'array') {
                why.push('array');
                islist = true;
            }
            if (!islist && !endParamBare) {
                const properties = resolveSchemaProperties(schema);
                (0, jostraca_1.each)(properties, (prop) => {
                    if (prop.type === 'array') {
                        why.push('array-prop:' + prop.key$);
                        islist = true;
                    }
                });
            }
            if (!islist) {
                why.push(endParamBare ? 'end-param' : 'not-list');
            }
        }
    }
    (0, utility_2.debugpath)(pathStr, mdesc.method, 'IS-LIST', islist, why, schema);
    return islist;
}
// struct's merge rewrites every list element it walks, not just the first, so
// each schema is cloned: the definition shares one object per $ref target.
function resolveSchemaProperties(schema) {
    let properties = {};
    // This is definitely heuristic!
    if (schema.allOf) {
        for (let i = schema.allOf.length - 1; -1 < i; --i) {
            properties = (0, struct_1.merge)([properties, (0, struct_1.clone)(schema.allOf[i].properties || {})]);
        }
    }
    if (schema.properties) {
        properties = (0, struct_1.merge)([properties, (0, struct_1.clone)(schema.properties)]);
    }
    return properties;
}
function updateAction(methodName, oldParam, actionName, entityDesc, pathdesc, why) {
    if (
    // Entity not already encoding action.
    !entityDesc.name.endsWith((0, utility_1.literalName)(actionName))
        && null == pathdesc.action[actionName]) {
        pathdesc.action[actionName] = {
            // kind: '`$BOOLEAN`',
            why_action: ['ent', `${entityDesc.name}`, `${why}`, `${oldParam}`, `${methodName}`]
        };
    }
}
function updateParamRename(ctx, data, path, method, paramRenameCapture, oldParamName, newParamName, why) {
    // A name that cannot be an identifier is not an improvement on the one the
    // specification gave. See docs/design/derived-names.md
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
    // The clash is with what the path's OTHER parameters end up called: their
    // rename if they have one, their canonical name if not.
    const otherParams = (path.match(/\{([^}]+)\}/g) || [])
        .map((seg) => (0, utility_1.paramOf)(seg))
        .filter((name) => name !== oldParamName);
    const takenBy = Object.keys(paramRenameCapture.rename)
        .find((other) => other !== oldParamName &&
        paramRenameCapture.rename[other] === newParamName) ??
        otherParams
            .find((other) => null == paramRenameCapture.rename[other] &&
            (0, utility_2.canonize)(other) === newParamName);
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
    const existingNewName = paramRenameCapture.rename[oldParamName];
    const existingWhy = paramRenameCapture.why[oldParamName];
    (0, utility_2.debugpath)(path, method, 'UPDATE-PARAM-RENAME', path, oldParamName, newParamName, existingNewName);
    if (null == existingNewName) {
        paramRenameCapture.rename[oldParamName] = newParamName;
        if (!existingWhy.includes(why)) {
            existingWhy.push(why);
        }
    }
    else if (newParamName == existingNewName) {
    }
    else {
        ctx.warn({
            paramRenameCapture, oldParamName, newParamName, why,
            note: 'Param rename mismatch: existing: ' +
                oldParamName + ' -> ' + existingNewName + ' (why: ' + existingNewName + ') ' +
                ' proposed: ' + newParamName + ' (why: ' + why + ') ' +
                'for path: ' + path + '. method: ' + method
        });
    }
}
function isParam(partStr) {
    const part = partStr.replace(/^\./, '').replace(/\}\.[A-Za-z0-9]+$/, '}');
    return '{' === part[0] && '}' === part[part.length - 1];
}
// A segment holding a placeholder, whole or beside other text, names no verb.
function isVerb(partStr) {
    return !String(partStr ?? '').includes('{');
}
const CUSTOM_METHOD_RE = /^(.+):([A-Za-z][\w-]*)$/;
// A custom method (`/schedules:count`, `/users/{id}:activate`) reads as a
// trailing verb segment after what it acts on.
function verbParts(parts) {
    const m = (parts[parts.length - 1] ?? '').match(CUSTOM_METHOD_RE);
    return null == m ? parts : [...parts.slice(0, -1), m[1], m[2]];
}
// A parameter whose own name says it holds a name, such as `project_name`,
// which a derived `<parent>_id` would misdescribe.
function isNameParam(param) {
    return /(^|_)name$/.test((0, jostraca_2.snakify)((0, utility_2.normalizeFieldName)(param)));
}
function nameEntityParams(entity) {
    const given = {};
    for (const [pathStr, guidePath] of Object.entries(entity.path ?? {})) {
        given[pathStr] = {};
        for (const [param, rename] of Object.entries(guidePath.rename?.param ?? {})) {
            given[pathStr][param] = rename.target;
        }
    }
    const named = entityParamNames(given);
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
// An entity's paths with the renames of their parameters, given back with one
// name for each parameter at the same place in several paths: its own name,
// snake-cased as the paths would, unless some path makes it the entity's `id`.
function entityParamNames(paths) {
    const out = {};
    const places = {};
    for (const pathStr of Object.keys(paths).sort(refcount_1.byCodePoint)) {
        out[pathStr] = { ...paths[pathStr] };
        const parts = verbParts((0, utility_1.pathParts)(pathStr));
        parts.forEach((part, partI) => {
            if (isParam(part)) {
                const place = parts.slice(0, partI + 1).join('/');
                (places[place] = places[place] ?? []).push({ pathStr, param: (0, utility_1.paramOf)(part) });
            }
        });
    }
    for (const place of Object.keys(places).sort(refcount_1.byCodePoint)) {
        const uses = places[place];
        const names = uses.map((use) => out[use.pathStr][use.param] ?? use.param);
        const param = uses[0].param;
        const snake = (0, utility_2.depluralize)((0, jostraca_2.snakify)((0, utility_2.normalizeFieldName)(param)));
        const name = names.includes('id') ? null :
            names.includes(snake) ? snake :
                names.includes(param) ? param : null;
        if (null == name || names.every((n) => n === name)) {
            continue;
        }
        for (const use of uses) {
            const renames = out[use.pathStr];
            if (paramNameTaken(use.pathStr, renames, use.param, name)) {
                continue;
            }
            if (name === use.param) {
                delete renames[use.param];
            }
            else {
                renames[use.param] = name;
            }
        }
    }
    return out;
}
// As updateParamRename judges a clash: by what the path's other parameters
// end up called.
function paramNameTaken(pathStr, renames, param, name) {
    return Object.keys(renames).some((other) => other !== param && renames[other] === name) ||
        (pathStr.match(/\{([^}]+)\}/g) || [])
            .map((seg) => (0, utility_1.paramOf)(seg))
            .some((other) => other !== param && null == renames[other] &&
            (0, utility_2.canonize)(other) === name);
}
function findcmps(data, pathStr, underprops, opts) {
    const cmplist = [];
    const cmpset = new Set();
    (0, jostraca_1.each)(data.def.paths[pathStr])
        .map((md) => {
        underprops.map((up) => {
            let found = (0, utility_2.find)(md[up], 'x-ref');
            found.map((xref) => {
                let m = xref.val.match(/\/(components\/schemas|definitions)\/(.+)$/);
                if (m) {
                    cmplist.push(m[2]);
                    cmpset.add(m[2]);
                }
            });
        });
    });
    return (opts?.uniq ? Array.from(cmpset) : cmplist).map(n => ({ cmp: (0, utility_2.canonizeCmpName)(n), origcmp: n }));
}
function makeMethodEntityDesc(desc) {
    let ment = {
        cmp: desc.cmp ?? null,
        origcmp: desc.origcmp ?? null,
        origcmpref: desc.origcmpref ?? null,
        ref: desc.ref ?? '',
        why_cmp: desc.why_cmp ?? [],
        cmpoccur: desc.cmpoccur ?? 0,
        path_rate: desc.path_rate ?? 0,
        method_rate: desc.method_rate ?? 0,
        entname: desc.entname ?? '',
        why_op: desc.why_op ?? [],
        rename: desc.rename ?? { param: {} },
        why_rename: desc.why_rename ?? { why_param: {} },
        rename_orig: desc.rename_orig ?? [],
        opname: desc.opname ?? '',
        why_opname: desc.why_opname ?? [],
    };
    return ment;
}
function findPotentialSchemaRefs(pathStr, methodName, responses, envelope, answered, why) {
    const xrefs = [];
    for (const schema of namingSchemas(methodName, responses, answered, envelope)) {
        // An envelope component names its wrapping, not the entity: the
        // component it carries takes its place.
        const ref = namingRef(schema, envelope);
        if (null != ref) {
            if (null != schema['x-ref'] && ref !== schema['x-ref']) {
                why.push('envelope=' + (0, utility_2.cmpRefName)(schema['x-ref']));
            }
            xrefs.push(ref);
        }
    }
    (0, utility_2.debugpath)(pathStr, methodName, 'POTENTIAL-SCHEMA-REFS', xrefs);
    return xrefs;
}
// An array request body is sent from a field named for the records it lists:
// its items' component, or the one their allOf parts name, cleaned as an
// entity's is, else the entity itself. A pointer into a component names a
// part of it, not a record. A name another route of the operation has is taken.
function arrayBodyField(schema, entname, taken = []) {
    const refs = [...new Set(itemRefs(schema?.items, new Set()))];
    const cmp = String(1 === refs.length ? refs[0] : '').match(utility_2.CMP_REF_RE)?.[2];
    const cleaned = null == cmp || cmp.includes('/') ? '' :
        (0, utility_2.prefixLeadingDigit)((0, utility_2.cleanComponentName)((0, utility_2.canonizeCmpName)(cmp)));
    const record = '' === cleaned ? entname : cleaned;
    let name = (0, utility_2.pluralize)(record);
    for (let n = 1; taken.includes(name); n++) {
        name = record + '_list' + (1 < n ? n : '');
    }
    return name;
}
function itemRefs(items, seen) {
    if (null == items || 'object' !== typeof items || seen.has(items)) {
        return [];
    }
    seen.add(items);
    if ('string' === typeof items['x-ref']) {
        return [items['x-ref']];
    }
    return (Array.isArray(items.allOf) ? items.allOf : []).flatMap((part) => itemRefs(part, seen));
}
function hasMethod(def, pathStr, methodName) {
    const pathDef = def?.paths?.[pathStr];
    const found = (null != pathDef
        && (null != pathDef[methodName.toLowerCase()]
            || null != pathDef[methodName.toUpperCase()]));
    return found;
}
//# sourceMappingURL=heuristic01.js.map