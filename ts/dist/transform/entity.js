"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.entityTransform = void 0;
exports.resolvePathList = resolvePathList;
exports.buildRelations = buildRelations;
exports.mergeCollectionPaths = mergeCollectionPaths;
const jostraca_1 = require("jostraca");
const types_1 = require("../types");
const utility_1 = require("../utility");
const entityTransform = async function (ctx) {
    const { apimodel, guide } = ctx;
    const kit = apimodel.main[types_1.KIT];
    let msg = '';
    // Pre-pass: merge collection paths into the entity that owns the
    // per-instance paths. Heuristic01 sometimes assigns "/people" to a
    // separate "*_search" entity (because the response wraps Person in
    // a search/pagination component) while "/people/{id}" and
    // "/people/{id}/anime" land on "person". Result: the person entity has
    // no primary list endpoint, so direct-load tests can't bootstrap an
    // ID. Move "/people" onto person here; this also clears the way for
    // sensible flow generation (one entity, one collection, multiple
    // sub-resources).
    mergeCollectionPaths(guide, ctx.log);
    (0, jostraca_1.each)(guide.entity, (guideEntity, entname) => {
        ctx.log.debug({ point: 'guide-entity', note: entname });
        const paths$ = resolvePathList(guideEntity, ctx.def);
        const relations = buildRelations(guideEntity, paths$);
        const modelent = {
            name: entname,
            op: {},
            fields: [],
            relations,
        };
        kit.entity[entname] = modelent;
        msg += guideEntity.name + ' ';
    });
    return { ok: true, msg };
};
exports.entityTransform = entityTransform;
// Move "/X" paths onto the entity that owns "/X/{id}" or "/X/{id}/sub".
// Only acts when the path "/X" sits on a different entity than the
// per-instance paths — leaves correctly-classified APIs alone.
function mergeCollectionPaths(guide, log) {
    const entities = guide.entity;
    // First pass: build collectionRoot -> owner-entity-name map.
    // owner is the entity whose name contains "/X/{...}" paths; we prefer
    // the owner whose direct-load path is "/X/{id}" (no further segments)
    // so that nested-resource entities don't claim the root.
    const rootOwners = {};
    for (const [ename, entity] of Object.entries(entities)) {
        for (const pathStr of Object.keys(entity.path ?? {})) {
            // Match /A/{...} or /A/{...}/...
            const m = pathStr.match(/^\/([^\/{}]+)\/\{[^}]+\}(\/.*)?$/);
            if (!m)
                continue;
            const root = m[1];
            const trailing = m[2] ?? '';
            // Depth = number of segments after the {id} placeholder. Lower
            // depth wins (e.g. "/people/{id}" beats "/people/{id}/anime").
            const depth = trailing === '' ? 0 : trailing.split('/').filter(Boolean).length;
            const cur = rootOwners[root];
            if (!cur || depth < cur.depth) {
                rootOwners[root] = { ename, depth };
            }
        }
    }
    // Second pass: for each entity with a "/X" path, if X has an owner
    // elsewhere, move the path there.
    for (const [ename, entity] of Object.entries(entities)) {
        if (entity.path == null)
            continue;
        const pathsToMove = [];
        for (const pathStr of Object.keys(entity.path)) {
            // Match exactly /X (one literal segment, no params).
            const m = pathStr.match(/^\/([^\/{}]+)$/);
            if (!m)
                continue;
            const root = m[1];
            const owner = rootOwners[root];
            if (owner && owner.ename !== ename) {
                pathsToMove.push(pathStr);
            }
        }
        for (const pathStr of pathsToMove) {
            const owner = rootOwners[pathStr.slice(1)];
            const targetEntity = entities[owner.ename];
            if (targetEntity == null)
                continue;
            targetEntity.path = targetEntity.path ?? {};
            const srcPath = entity.path[pathStr];
            const tgtPath = targetEntity.path[pathStr];
            if (tgtPath == null) {
                targetEntity.path[pathStr] = srcPath;
            }
            else {
                // Target already owns this path under a different heuristic-discovered
                // entity (e.g. `/gists` GET on `base_gist`, `/gists` POST on `gist`).
                // Merge op/action/rename sets so no method is silently lost — without
                // this, the second source's contribution drops on the floor and the
                // base-guide loses paths that were in the original spec.
                if (srcPath?.op) {
                    tgtPath.op = tgtPath.op ?? {};
                    for (const opname of Object.keys(srcPath.op)) {
                        if (tgtPath.op[opname] == null) {
                            tgtPath.op[opname] = srcPath.op[opname];
                        }
                    }
                }
                if (srcPath?.action) {
                    tgtPath.action = tgtPath.action ?? {};
                    for (const aname of Object.keys(srcPath.action)) {
                        if (tgtPath.action[aname] == null) {
                            tgtPath.action[aname] = srcPath.action[aname];
                        }
                    }
                }
                if (srcPath?.rename?.param) {
                    tgtPath.rename = tgtPath.rename ?? {};
                    tgtPath.rename.param = tgtPath.rename.param ?? {};
                    for (const p of Object.keys(srcPath.rename.param)) {
                        if (tgtPath.rename.param[p] == null) {
                            tgtPath.rename.param[p] = srcPath.rename.param[p];
                        }
                    }
                }
            }
            delete entity.path[pathStr];
            log?.debug?.({
                point: 'merge-collection-path',
                path: pathStr,
                from: ename,
                to: owner.ename,
            });
        }
    }
}
function resolvePathList(guideEntity, def) {
    const paths$ = [];
    (0, jostraca_1.each)(guideEntity.path, (guidePath, orig) => {
        const parts = orig.split('/').filter(p => '' != p);
        const rename = guidePath.rename ?? {};
        (0, jostraca_1.each)(rename.param, (param) => {
            const pI = parts.indexOf('{' + param.key$ + '}');
            if (pI >= 0)
                parts[pI] = '{' + param.val$ + '}';
        });
        const pathdesc = {
            orig,
            parts,
            rename,
            method: '', // operation collectOps will copy and assign per op
            op: guidePath.op,
            def: def.paths[orig],
        };
        paths$.push(pathdesc);
    });
    guideEntity.paths$ = paths$;
    return paths$;
}
function buildRelations(guideEntity, paths$) {
    // An ancestor is a literal collection segment (e.g. "rems") followed by
    // a path-param placeholder that names an instance ID. We only collect
    // the literal parts — placeholder parts like "{año}" must be excluded
    // even when they're themselves followed by another placeholder, otherwise
    // downstream code treats `{año}` as an ancestor name and emits broken
    // idmap entries / match keys.
    //
    // Each captured segment is then normalised to its entity name —
    // depluralize+snakify — so that "files"/"audit-log" become "file"/"audit_log",
    // i.e. the same keys downstream code uses to look up entities. Without this,
    // `apimodel.main.kit.entity[ancestorName]` misses the parent entity for
    // pluralised path segments.
    let ancestors = paths$
        .map(pli => pli.parts
        .map((p, i) => ('{' !== p[0] &&
        pli.parts[i + 1]?.[0] === '{' &&
        pli.parts[i + 1] !== '{id}') ? (0, utility_1.depluralize)((0, jostraca_1.snakify)(p)) : null)
        .filter(p => null != p))
        .filter(n => 0 < n.length)
        .sort((a, b) => a.length - b.length);
    // remove suffixes: keep only ancestors that are not a suffix of any later ancestor
    ancestors = ancestors
        .filter((n, j) => {
        for (let k = j + 1; k < ancestors.length; k++) {
            if (suffix(ancestors[k], n))
                return false;
        }
        return true;
    });
    const relations = {
        ancestors
    };
    guideEntity.relations$ = relations;
    return relations;
}
// True if array c is a suffix of array p.
function suffix(p, c) {
    if (c.length > p.length)
        return false;
    for (let i = 0; i < c.length; i++) {
        if (c[c.length - 1 - i] !== p[p.length - 1 - i])
            return false;
    }
    return true;
}
//# sourceMappingURL=entity.js.map