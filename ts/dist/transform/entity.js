"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.entityTransform = void 0;
exports.filterEntityAncestors = filterEntityAncestors;
exports.resolvePathList = resolvePathList;
exports.buildRelations = buildRelations;
exports.mergeCollectionPaths = mergeCollectionPaths;
const jostraca_1 = require("jostraca");
const types_1 = require("../types");
const utility_1 = require("../utility");
const refcount_1 = require("../refcount");
const entityTransform = async function (ctx) {
    const { apimodel, guide } = ctx;
    const kit = apimodel.main[types_1.KIT];
    let msg = '';
    (0, jostraca_1.each)(guide.entity, (guideEntity, entname) => {
        if (!(0, utility_1.guideActive)(guideEntity)) {
            ctx.log.debug({ point: 'guide-entity', note: entname, active: false });
            return;
        }
        ctx.log.debug({ point: 'guide-entity', note: entname });
        const graphql = true === ctx.def?.graphql;
        const paths$ = graphql ?
            resolveFieldList(guideEntity, ctx.def) :
            resolvePathList(guideEntity, ctx.def);
        const relations = graphql ?
            { ancestors: [] } :
            buildRelations(guideEntity, paths$);
        const modelent = {
            name: entname,
            op: {},
            fields: {},
            relations,
        };
        kit.entity[entname] = modelent;
        msg += guideEntity.name + ' ';
    });
    filterEntityAncestors(kit.entity);
    return { ok: true, msg };
};
exports.entityTransform = entityTransform;
function filterEntityAncestors(entities) {
    for (const [name, entity] of Object.entries(entities)) {
        if (null == entity.relations)
            continue;
        entity.relations.ancestors = (entity.relations.ancestors ?? [])
            .map((chain) => chain.filter(ancestor => ancestor !== name &&
            Object.prototype.hasOwnProperty.call(entities, ancestor)))
            .filter((chain) => 0 < chain.length);
    }
}
// Move a collection path ("/X", "/api/v1/X", a trailing slash allowed) onto
// the entity owning the item path beneath it ("/X/{id}", or a composite key
// such as "/X/{owner}/{repo}"), when the two sit on different entities.
// Returns the entities the moves emptied, which are removed. Guide stage
// only: on the unified guide it would override guide.aontu.
function mergeCollectionPaths(guide, log, recordRef) {
    const entities = guide.entity;
    const emptied = [];
    // Every route beneath a collection's literals, nearest first.
    const owners = {};
    for (const [ename, entity] of Object.entries(entities)) {
        for (const pathStr of Object.keys(entity.path ?? {})) {
            const m = pathStr.match(/^((?:\/[^\/{}]+)+)\/\{[^}]+\}(\/.*)?$/);
            if (!m)
                continue;
            const rest = (m[2] ?? '').split('/').filter(Boolean);
            const item = rest.every((seg) => /^\{[^}]+\}$/.test(seg));
            (owners[m[1]] = owners[m[1]] ?? []).push({ ename, depth: rest.length, route: pathStr, item });
        }
    }
    for (const candidates of Object.values(owners)) {
        candidates.sort((a, b) => a.depth - b.depth || (0, refcount_1.byCodePoint)(a.ename, b.ename) || (0, refcount_1.byCodePoint)(a.route, b.route));
    }
    // The record a path's operations answer with, a read first.
    const answers = (pathStr, pathDesc) => {
        const methods = Object.values(pathDesc?.op ?? {})
            .map((op) => String(op?.method ?? '').toUpperCase())
            .sort((a, b) => Number('GET' !== a) - Number('GET' !== b) || (0, refcount_1.byCodePoint)(a, b));
        for (const method of methods) {
            const ref = recordRef?.(pathStr, method);
            if (null != ref) {
                return ref;
            }
        }
        return null;
    };
    // The nearest item route owns the collection, one answering with the
    // collection's own record first. With no item route, a deeper route owns
    // it only on the record: a verb such as a token refresh returns the token,
    // while a sub-collection such as GitHub's plan accounts lists purchases.
    const ownerOf = (pathStr, pathDesc, candidates) => {
        const mine = answers(pathStr, pathDesc);
        const same = (c) => null != mine && mine === answers(c.route, entities[c.ename]?.path?.[c.route]);
        const items = candidates.filter((c) => c.item);
        return items.find(same) ?? items[0] ?? candidates.find(same);
    };
    // Second pass: for each entity with a "/X" path, if X has an owner
    // elsewhere, move the path there.
    for (const [ename, entity] of Object.entries(entities)) {
        if (entity.path == null)
            continue;
        const pathsToMove = [];
        for (const pathStr of Object.keys(entity.path)) {
            const root = collectionRoot(pathStr);
            const candidates = null == root ? undefined : owners[root];
            const owner = null == candidates ? undefined :
                ownerOf(pathStr, entity.path[pathStr], candidates);
            if (null != owner && owner.ename !== ename) {
                pathsToMove.push([pathStr, owner]);
            }
        }
        for (const [pathStr, owner] of pathsToMove) {
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
        if (0 < pathsToMove.length && 0 === Object.keys(entity.path).length) {
            emptied.push(ename);
        }
    }
    // With no path left it names nothing guide.aontu could switch back on.
    for (const ename of emptied) {
        delete entities[ename];
        log?.debug?.({ point: 'merge-collection-drop', entity: ename });
    }
    return emptied;
}
// A path of literals only, less any trailing slash, is a collection path.
function collectionRoot(pathStr) {
    const key = pathStr.replace(/\/+$/, '');
    return /^(?:\/[^\/{}]+)+$/.test(key) ? key : null;
}
function resolvePathList(guideEntity, def) {
    const paths$ = [];
    (0, jostraca_1.each)(guideEntity.path, (guidePath, orig) => {
        // Path-level opt-out (see the entity-level note above).
        if (!(0, utility_1.guideActive)(guidePath)) {
            return;
        }
        const rename = guidePath.rename ?? {};
        const segments = orig
            .split('/')
            .filter(p => '' != p)
            .map(p => {
            if ('{' !== p[0] || '}' !== p[p.length - 1]) {
                return { lit: p };
            }
            const raw = p.slice(1, -1);
            if ('' === raw || raw.includes('{') || raw.includes('}')) {
                return { lit: p };
            }
            // Renames map the spec's parameter name to the model's. Applied
            // here, on the NAME, rather than by rewriting a braced string.
            const renamed = rename.param?.[raw];
            return { var: null == renamed ? raw : String(renamed) };
        });
        const pathdesc = {
            orig,
            segments,
            rename,
            method: '', // operation collectOps will copy and assign per op
            op: guidePath.op,
            action: guidePath.action,
            def: def.paths[orig],
        };
        paths$.push(pathdesc);
    });
    guideEntity.paths$ = paths$;
    return paths$;
}
// Root-field equivalent of resolvePathList for GraphQL guides. A root field
// has no path to split, so `segments` stays empty (GraphQL points address the
// single endpoint and carry their operation document instead) and `def` is
// the normalised root-field descriptor rather than a path item.
function resolveFieldList(guideEntity, def) {
    const paths$ = [];
    (0, jostraca_1.each)(guideEntity.field, (guideField, orig) => {
        if (!(0, utility_1.guideActive)(guideField)) {
            return;
        }
        // The root field lives under query or mutation depending on the op type
        // the guide recorded.
        const optype = Object.values(guideField.op ?? {})
            .map((o) => o.optype)
            .find((t) => null != t) ?? 'query';
        const fielddef = 'mutation' === optype ?
            def.mutation?.[orig] : def.query?.[orig];
        // The guide expresses GraphQL renames as `rename: arg:` (root fields
        // have arguments, not path params), while the model's arg machinery
        // reads `rename.param`. Translate so a user override actually applies.
        const grename = guideField.rename ?? {};
        const rename = null != grename.arg ?
            { ...grename, param: { ...(grename.param ?? {}), ...grename.arg } } :
            grename;
        const pathdesc = {
            orig,
            segments: [],
            rename,
            method: '', // operation collectOps will copy and assign per op
            op: guideField.op,
            def: fielddef,
        };
        paths$.push(pathdesc);
    });
    guideEntity.paths$ = paths$;
    return paths$;
}
function buildRelations(guideEntity, paths$) {
    let ancestors = paths$
        .map(pli => pli.segments
        .map((s, i) => {
        const next = pli.segments[i + 1];
        return (null != s.lit && null != next?.var && 'id' !== next.var)
            ? (0, utility_1.depluralize)((0, jostraca_1.snakify)(s.lit)) : null;
    })
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