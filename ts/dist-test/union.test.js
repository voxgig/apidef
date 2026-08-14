"use strict";
/* Copyright (c) 2024-2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
// An UNTAGGED union — oneOf/anyOf, two or more real branches, no
// `discriminator` — cannot be resolved to a variant by any generator: nothing
// in the schema says which branch a given value is. The field can only be
// modelled as an open type, and the point of detecting it is to let the
// generated documentation SAY why the type is open.
//
// The live case is the Typebot Builder spec, whose `groups` field is an array
// whose item schema carries 18 untagged unions, the widest 19 branches, 12
// levels down — which is why the scan has to recurse rather than look at the
// field's own schema.
const node_test_1 = require("node:test");
const node_assert_1 = require("node:assert");
// Built module, matching the other suites: the compiled test runs from
// dist-test/, where a ../src path does not resolve.
const utility_1 = require("../dist/utility");
(0, node_test_1.describe)('untagged-union', () => {
    (0, node_test_1.describe)('untaggedUnionBranches', () => {
        (0, node_test_1.test)('counts real branches of oneOf and anyOf', () => {
            (0, node_assert_1.equal)((0, utility_1.untaggedUnionBranches)({ oneOf: [{ type: 'string' }, { type: 'number' }] }), 2);
            (0, node_assert_1.equal)((0, utility_1.untaggedUnionBranches)({ anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] }), 3);
        });
        (0, node_test_1.test)('a discriminated union is resolvable, so not counted', () => {
            // The discriminator names the property that decides the branch, which
            // is precisely what an untagged union lacks.
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
            // The shape of the Typebot `groups` field: an array whose items carry
            // the union.
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
            // These specs reference themselves freely; an unguarded walk would spin.
            const node = { type: 'object', properties: {} };
            node.properties.self = node;
            node.properties.choice = { oneOf: [{ type: 'string' }, { type: 'number' }] };
            const found = (0, utility_1.scanUntaggedUnion)(node);
            (0, node_assert_1.equal)(found?.count, 1);
            (0, node_assert_1.equal)(found?.branches, 2);
        });
    });
});
//# sourceMappingURL=union.test.js.map