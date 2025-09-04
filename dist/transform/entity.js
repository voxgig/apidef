"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.entityTransform = void 0;
exports.resolvePathList = resolvePathList;
exports.buildRelations = buildRelations;
const jostraca_1 = require("jostraca");
const utility_1 = require("../utility");
const entityTransform = async function (ctx) {
    const { apimodel, guide } = ctx;
    let msg = '';
    (0, jostraca_1.each)(guide.entity, (guideEntity) => {
        console.log(guideEntity);
        const entityName = guideEntity.key$;
        ctx.log.debug({ point: 'guide-entity', note: entityName });
        const pathlist$ = resolvePathList(guideEntity);
        const relations = buildRelations(guideEntity, pathlist$);
        apimodel.main.sdk.entity[entityName] = {
            name: entityName,
            op: {},
            field: {},
            id: {
                name: 'id',
                field: 'id',
            },
            relations,
            pathlist$
        };
        msg += guideEntity.name + ' ';
    });
    console.log('=== entityTransform ===');
    console.log((0, utility_1.formatJSONIC)(apimodel.main.sdk.entity));
    return { ok: true, msg };
};
exports.entityTransform = entityTransform;
function resolvePathList(guideEntity) {
    const pathlist$ = [];
    (0, jostraca_1.each)(guideEntity.path, (guidePath, orig) => {
        const parts = orig.split('/').filter(p => '' != p);
        const rename = guidePath.rename ?? {};
        (0, jostraca_1.each)(rename.param, (param) => {
            const pI = parts.indexOf('{' + param.key$ + '}');
            parts[pI] = '{' + param.val$ + '}';
        });
        pathlist$.push({
            orig,
            parts,
            rename,
            op: guidePath.op
        });
    });
    guideEntity.pathlist$ = pathlist$;
    return pathlist$;
}
function buildRelations(guideEntity, pathlist$) {
    let ancestors = pathlist$
        .map(pli => pli.parts
        .map((p, i) => (pli.parts[i + 1]?.[0] === '{' && pli.parts[i + 1] !== '{id}') ? p : null)
        .filter(p => null != p))
        .filter(n => 0 < n.length)
        .sort((a, b) => a.length - b.length);
    // remove suffixes
    ancestors = ancestors
        .reduce((a, n, j) => ((0 < (ancestors.slice(j + 1).filter(p => suffix(p, n))).length
        ? null : a.push(n)), a), []);
    const relations = {
        ancestors
    };
    guideEntity.relations$ = relations;
    return relations;
}
// true if c is a suffix of p
function suffix(p, c) {
    return c.reduce((b, _, i) => (b && c[c.length - 1 - i] === p[p.length - 1 - i]), true);
}
//# sourceMappingURL=entity.js.map