"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.entityTransform = void 0;
exports.resolvePathList = resolvePathList;
exports.buildRelations = buildRelations;
const jostraca_1 = require("jostraca");
const entityTransform = async function (ctx) {
    const { apimodel, guide } = ctx;
    let msg = '';
    (0, jostraca_1.each)(guide.entity, (guideEntity, entname) => {
        ctx.log.debug({ point: 'guide-entity', note: entname });
        const paths$ = resolvePathList(guideEntity, ctx.def);
        const relations = buildRelations(guideEntity, paths$);
        const modelent = {
            name: entname,
            op: {},
            fields: [],
            id: {
                name: 'id',
                field: 'id',
            },
            relations,
        };
        apimodel.main.sdk.entity[entname] = modelent;
        msg += guideEntity.name + ' ';
    });
    return { ok: true, msg };
};
exports.entityTransform = entityTransform;
function resolvePathList(guideEntity, def) {
    const paths$ = [];
    (0, jostraca_1.each)(guideEntity.path, (guidePath, orig) => {
        const parts = orig.split('/').filter(p => '' != p);
        const rename = guidePath.rename ?? {};
        (0, jostraca_1.each)(rename.param, (param) => {
            const pI = parts.indexOf('{' + param.key$ + '}');
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
    let ancestors = paths$
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
// True if array c is a suffix of array p,
function suffix(p, c) {
    return c.reduce((b, _, i) => (b && c[c.length - 1 - i] === p[p.length - 1 - i]), true);
}
//# sourceMappingURL=entity.js.map