"use strict";
/* Copyright (c) 2026 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const apidef_1 = require("../dist/apidef");
const entity_1 = require("../dist/transform/entity");
function routes(entities) {
    return Object.fromEntries(Object.keys(entities).sort()
        .map((name) => [name, Object.entries(entities[name].path ?? {})
            .flatMap(([path, pd]) => Object.keys(pd.op).map((op) => op + ' ' + path))
            .sort()]));
}
function entity(name, path, extra = {}) {
    return {
        name, ...extra,
        path: Object.fromEntries(Object.entries(path).map(([p, ops]) => [p, { op: Object.fromEntries(ops.map((op) => [op, { method: 'GET' }])) }])),
    };
}
(0, node_test_1.describe)('fold-merge', () => {
    // `/usecases/{id}.json` is named for its component, UseCase, and
    // `/usecases.json` for its segment. go/apidef_test.go reads the base guide
    // this writes.
    (0, node_test_1.test)('guide-fold-merge', async () => {
        const folder = __dirname + '/../test/fold-merge';
        const build = await apidef_1.ApiDef.makeBuild({ folder });
        const bres = await build({ name: 'fold-merge', def: 'fold-merge-def.json' }, { spec: { base: folder, buildargs: { apidef: { ctrl: { step: {
                                parse: true, guide: true, transformers: true, builders: false, generate: false,
                            } } } } } }, {});
        node_assert_1.default.ok(bres.ok, 'build failed: ' + bres.err?.message);
        node_assert_1.default.deepStrictEqual(routes(bres.guide.entity), {
            repo: ['list /repos.json'],
            use_case: ['list /usecases.json', 'list /usecases/{id}.json'],
        });
        node_assert_1.default.deepStrictEqual(Object.keys(bres.apimodel.main.kit.entity).sort(), ['repo', 'use_case']);
        node_assert_1.default.deepStrictEqual(bres.apimodel.main.kit.entity.use_case.op.list.points
            .map((p) => p.o).sort(), ['/usecases.json', '/usecases/{id}.json']);
    });
    (0, node_test_1.test)('the spelling with the most words keeps every path', () => {
        const guide = { entity: {
                usecase: entity('usecase', { '/usecases': ['list'] }),
                use_case: entity('use_case', { '/usecases/{id}': ['load'] }),
                UseCase: entity('UseCase', { '/v2/usecases': ['list'] }),
            } };
        node_assert_1.default.deepStrictEqual((0, entity_1.mergeFoldedEntities)(guide), ['UseCase', 'usecase']);
        node_assert_1.default.deepStrictEqual(routes(guide.entity), {
            use_case: ['list /usecases', 'list /v2/usecases', 'load /usecases/{id}'],
        });
    });
    (0, node_test_1.test)('one operation on one path keeps both apart', () => {
        const guide = { entity: {
                opt_out: entity('opt_out', { '/optouts': ['list'] }),
                optout: entity('optout', { '/optouts': ['list'], '/optouts/{id}': ['load'] }),
            } };
        node_assert_1.default.deepStrictEqual((0, entity_1.mergeFoldedEntities)(guide), []);
        node_assert_1.default.deepStrictEqual(Object.keys(guide.entity).sort(), ['opt_out', 'optout']);
    });
    (0, node_test_1.test)('an inactive entity is left to guide.aontu', () => {
        const guide = { entity: {
                opt_out: entity('opt_out', { '/optouts': ['list'] }),
                optout: entity('optout', { '/optouts/{id}': ['load'] }, { active: false }),
            } };
        node_assert_1.default.deepStrictEqual((0, entity_1.mergeFoldedEntities)(guide), []);
        node_assert_1.default.deepStrictEqual(Object.keys(guide.entity).sort(), ['opt_out', 'optout']);
    });
    (0, node_test_1.test)('names that fold apart are untouched', () => {
        const guide = { entity: {
                use: entity('use', { '/uses': ['list'] }),
                use_case: entity('use_case', { '/usecases': ['list'] }),
                case: entity('case', { '/cases': ['list'] }),
                constructor: entity('constructor', { '/constructors': ['list'] }),
            } };
        node_assert_1.default.deepStrictEqual((0, entity_1.mergeFoldedEntities)(guide), []);
        node_assert_1.default.deepStrictEqual(Object.keys(guide.entity).sort(), ['case', 'constructor', 'use', 'use_case']);
    });
});
//# sourceMappingURL=fold-merge.test.js.map