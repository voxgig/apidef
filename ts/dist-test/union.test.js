"use strict";
/* Copyright (c) 2024-2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = require("node:assert");
// Built module, matching the other suites: the compiled test runs from
// dist-test/, where a ../src path does not resolve.
const utility_1 = require("../dist/utility");
const parse_1 = require("../dist/parse");
const heuristic01_1 = require("../dist/guide/heuristic01");
(0, node_test_1.describe)('untagged-union', () => {
    (0, node_test_1.describe)('untaggedUnionBranches', () => {
        (0, node_test_1.test)('counts real branches of oneOf and anyOf', () => {
            (0, node_assert_1.equal)((0, utility_1.untaggedUnionBranches)({ oneOf: [{ type: 'string' }, { type: 'number' }] }), 2);
            (0, node_assert_1.equal)((0, utility_1.untaggedUnionBranches)({ anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] }), 3);
        });
        (0, node_test_1.test)('a discriminated union is resolvable, so not counted', () => {
            (0, node_assert_1.equal)((0, utility_1.untaggedUnionBranches)({
                oneOf: [{ type: 'object' }, { type: 'object' }],
                discriminator: { propertyName: 'kind' },
            }), 0);
        });
        (0, node_test_1.test)('the nullable idiom is one type, not a choice', () => {
            // anyOf: [X, null] means "X, possibly absent" — there is no variant to
            // pick, so flagging it would bury the real unions in noise.
            (0, node_assert_1.equal)((0, utility_1.untaggedUnionBranches)({ anyOf: [{ type: 'string' }, { type: 'null' }] }), 0);
            (0, node_assert_1.equal)((0, utility_1.untaggedUnionBranches)({ oneOf: [{ type: 'object' }, { type: 'null' }] }), 0);
        });
        (0, node_test_1.test)('ignores non-unions', () => {
            (0, node_assert_1.equal)((0, utility_1.untaggedUnionBranches)({ type: 'string' }), 0);
            (0, node_assert_1.equal)((0, utility_1.untaggedUnionBranches)({ allOf: [{ type: 'object' }, { type: 'object' }] }), 0);
            (0, node_assert_1.equal)((0, utility_1.untaggedUnionBranches)({ oneOf: [{ type: 'string' }] }), 0);
            (0, node_assert_1.equal)((0, utility_1.untaggedUnionBranches)({ oneOf: [] }), 0);
            (0, node_assert_1.equal)((0, utility_1.untaggedUnionBranches)(null), 0);
            (0, node_assert_1.equal)((0, utility_1.untaggedUnionBranches)('nope'), 0);
        });
    });
    (0, node_test_1.describe)('scanUntaggedUnion', () => {
        (0, node_test_1.test)('null when nothing beneath the field is a union', () => {
            (0, node_assert_1.equal)((0, utility_1.scanUntaggedUnion)({ type: 'object', properties: { a: { type: 'string' } } }), null);
            (0, node_assert_1.equal)((0, utility_1.scanUntaggedUnion)(null), null);
        });
        (0, node_test_1.test)('finds a union at the field itself', () => {
            (0, node_assert_1.deepEqual)((0, utility_1.scanUntaggedUnion)({ oneOf: [{ type: 'string' }, { type: 'number' }] }), { count: 1, branches: 2, depth: 0 });
        });
        (0, node_test_1.test)('finds a union nested below the field, reporting its depth', () => {
            const schema = {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        blocks: {
                            type: 'array',
                            items: { anyOf: [{ type: 'object' }, { type: 'object' }, { type: 'object' }] },
                        },
                    },
                },
            };
            const found = (0, utility_1.scanUntaggedUnion)(schema);
            (0, node_assert_1.equal)(found?.count, 1);
            (0, node_assert_1.equal)(found?.branches, 3);
            // The walk is generic over object values, so the `properties` container
            // counts as a level of its own: schema -> items -> properties -> blocks
            // -> items. Depth is a relative "how far down", not a JSON-Pointer hop
            // count, and is only ever compared against other depths.
            (0, node_assert_1.equal)(found?.depth, 4);
        });
        (0, node_test_1.test)('reports the WIDEST union and the total count', () => {
            const schema = {
                a: { oneOf: [{ type: 'string' }, { type: 'number' }] },
                b: { anyOf: [{ type: 'a' }, { type: 'b' }, { type: 'c' }, { type: 'd' }] },
            };
            const found = (0, utility_1.scanUntaggedUnion)(schema);
            (0, node_assert_1.equal)(found?.count, 2);
            (0, node_assert_1.equal)(found?.branches, 4);
        });
        (0, node_test_1.test)('survives a self-referential schema', () => {
            const node = { type: 'object', properties: {} };
            node.properties.self = node;
            node.properties.choice = { oneOf: [{ type: 'string' }, { type: 'number' }] };
            const found = (0, utility_1.scanUntaggedUnion)(node);
            (0, node_assert_1.equal)(found?.count, 1);
            (0, node_assert_1.equal)(found?.branches, 2);
        });
    });
});
const SHARED_UNION_SPEC = `
openapi: 3.0.0
info: { title: Shared, version: '1' }
paths:
  /thing:
    get:
      responses:
        '200':
          description: The thing.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Thing' }
components:
  schemas:
    App:
      type: object
      properties:
        owner: { oneOf: [{ type: string }, { type: integer }] }
    Thing:
      type: object
      properties:
        id: { type: string }
        a: { type: object, properties: { apps: { type: array, items: { $ref: '#/components/schemas/App' } } } }
        b: { type: object, properties: { apps: { type: array, items: { $ref: '#/components/schemas/App' } } } }
`;
(0, node_test_1.describe)('a union the definition shares', () => {
    // The guide reads a response's properties through struct's merge, which
    // rewrites each list element it walks, so it once gave every reference to
    // a schema a copy of its own and the union was counted once per copy.
    (0, node_test_1.test)('stays one object, counted once, after the guide has run', async () => {
        const def = await (0, parse_1.parse)('OpenAPI', SHARED_UNION_SPEC, { file: 'shared-union.yaml' });
        const thing = def.paths['/thing'].get.responses['200'].content['application/json'].schema;
        const app = (side) => thing.properties[side].properties.apps.items;
        (0, node_assert_1.strictEqual)(app('a').properties, app('b').properties);
        const quiet = () => undefined;
        await (0, heuristic01_1.heuristic01)({
            def,
            log: { info: quiet, debug: quiet, warn: quiet, error: quiet },
            warn: quiet,
        });
        (0, node_assert_1.strictEqual)(app('a').properties, app('b').properties);
        (0, node_assert_1.deepEqual)((0, utility_1.scanUntaggedUnion)(thing), { count: 1, branches: 2, depth: 7 });
    });
});
//# sourceMappingURL=union.test.js.map