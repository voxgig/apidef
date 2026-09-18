"use strict";
/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const entity_1 = require("../../dist/transform/entity");
(0, node_test_1.describe)('transform-entity', () => {
    // resolvePathList is THE path construction site (ADR-003): the split, the
    // rename application and the segment typing happen there and nowhere else.
    (0, node_test_1.test)('resolvePathList: paths become typed segments', () => {
        node_assert_1.default.ok(entity_1.resolvePathList);
        const paths = (0, entity_1.resolvePathList)({
            path: {
                '/foo': {},
                '/bar/{bar}': {},
                '/zed/{f0}/dez/{f1}': { rename: { param: { f0: 't0', f1: 't1' } } },
            }
        }, { paths: {} });
        // each() iterates in SORTED key order, so the result is bar, foo, zed —
        // not declaration order.
        node_assert_1.default.deepStrictEqual(paths.map((p) => p.segments), [
            [{ lit: 'bar' }, { var: 'bar' }],
            [{ lit: 'foo' }],
            // Renames apply to the NAME, not by rewriting a braced string.
            [{ lit: 'zed' }, { var: 't0' }, { lit: 'dez' }, { var: 't1' }],
        ]);
        // No braced strings survive: a consumer never parses a segment.
        for (const p of paths) {
            for (const s of p.segments) {
                node_assert_1.default.ok(null == s.lit || !s.lit.startsWith('{'), 'a literal segment must not be a braced string: ' + JSON.stringify(s));
            }
        }
    });
    (0, node_test_1.test)('resolvePathList: renames do not chain', () => {
        const paths = (0, entity_1.resolvePathList)({
            path: {
                '/groups/{id}/badges/{badge_id}': {
                    rename: { param: { badge_id: 'id', id: 'project_id' } }
                },
            }
        }, { paths: {} });
        node_assert_1.default.deepStrictEqual(paths[0].segments, [
            { lit: 'groups' }, { var: 'project_id' },
            { lit: 'badges' }, { var: 'id' },
        ]);
    });
    (0, node_test_1.test)('resolvePathList: a repeated placeholder renames consistently', () => {
        const paths = (0, entity_1.resolvePathList)({
            path: { '/a/{id}/b/{id}': { rename: { param: { id: 'thing_id' } } } }
        }, { paths: {} });
        node_assert_1.default.deepStrictEqual(paths[0].segments, [
            { lit: 'a' }, { var: 'thing_id' },
            { lit: 'b' }, { var: 'thing_id' },
        ]);
    });
    (0, node_test_1.test)('resolvePathList: a compound element is a literal, not a bogus var', () => {
        const paths = (0, entity_1.resolvePathList)({
            path: {
                '/x/{a}.{b}': { rename: { param: { a: 'aa', b: 'bb' } } },
                '/y/{}': {},
                '/z/pre{c}': {},
            }
        }, { paths: {} });
        node_assert_1.default.deepStrictEqual(paths.map((p) => p.segments), [
            [{ lit: 'x' }, { lit: '{a}.{b}' }],
            [{ lit: 'y' }, { lit: '{}' }],
            [{ lit: 'z' }, { lit: 'pre{c}' }],
        ]);
    });
    (0, node_test_1.test)('resolvePathList: a partial-element placeholder stays literal (ADR-003 limit)', () => {
        const paths = (0, entity_1.resolvePathList)({
            path: {
                '/reports/{id}.json': { rename: { param: { id: 'report_id' } } },
                '/v{version}/items': {},
            }
        }, { paths: {} });
        node_assert_1.default.deepStrictEqual(paths.map((p) => p.segments), [
            [{ lit: 'reports' }, { lit: '{id}.json' }],
            [{ lit: 'v{version}' }, { lit: 'items' }],
        ]);
        const parts = (p) => p.segments.map((s) => null == s.var ? String(s.lit ?? '') : '{' + s.var + '}');
        node_assert_1.default.deepStrictEqual(paths.map(parts), [
            ['reports', '{id}.json'],
            ['v{version}', 'items'],
        ]);
    });
    (0, node_test_1.test)('buildRelations', () => {
        node_assert_1.default.ok(entity_1.buildRelations);
        const r0 = (0, entity_1.buildRelations)({}, [
            { segments: [{ lit: 'a' }] },
            { segments: [{ lit: 'b' }, { var: 'id' }] },
            { segments: [{ lit: 'd' }, { lit: 'c' }, { var: 'id' }] },
            { segments: [{ lit: 'f' }, { var: 'f_id' }, { lit: 'e' }, { var: 'id' }] },
            { segments: [{ lit: 'i' }, { lit: 'h' }, { var: 'h_id' }, { lit: 'g' }, { var: 'id' }] },
            { segments: [{ lit: 'ii' }, { lit: 'h' }, { var: 'h_id' }, { lit: 'g' }, { var: 'id' }] },
            { segments: [{ lit: 'l' }, { var: 'l_id' }, { lit: 'k' }, { var: 'k_id' }, { lit: 'j' }, { var: 'id' }] },
            { segments: [{ lit: 'p' }, { var: 'p_id' }, { lit: 'n' }, { var: 'n_id' }, { lit: 'm' }, { var: 'id' }] },
            { segments: [{ lit: 'q' }, { var: 'q_id' }, { lit: 'o' }, { var: 'o_id' }, { lit: 'n' }, { var: 'n_id' }, { lit: 'm' }, { var: 'id' }] },
            { segments: [{ lit: 'oo' }, { lit: 'o' }, { var: 'o_id' }, { lit: 'n' }, { var: 'n_id' }, { lit: 'm' }, { var: 'id' }] },
        ]);
        node_assert_1.default.deepStrictEqual(r0, {
            ancestors: [['f'], ['h'], ['l', 'k'], ['p', 'n'], ['q', 'o', 'n']]
        });
    });
});
//# sourceMappingURL=entity.test.js.map