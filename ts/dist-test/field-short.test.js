"use strict";
/* Copyright (c) 2024 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const field_1 = require("../dist/transform/field");
// The paths a spec's `description` takes to reach ModelField.short.
//
// The first cut of this feature read the description in resolveOpFields and
// stopped there, which covers the common case — one schema, one operation —
// and silently drops it in three others. Each test below is one of those.
function runFieldTransform(entity, def) {
    const apimodel = { main: { kit: { entity: { [entity.name]: entity } } } };
    return (0, field_1.fieldTransform)({ apimodel, def }).then(() => entity.fields);
}
function fieldsByName(fields) {
    const out = {};
    for (const f of fields) {
        out[f.name] = f;
    }
    return out;
}
(0, node_test_1.describe)('field-short', () => {
    // A field is first seen under a higher-precedence op that does not describe
    // it, and described under a later one. Field identity is first-writer-wins
    // (that is what `seen` is for) and mergeField carried only req/type, so the
    // description the spec DOES supply was thrown away and the generated
    // Description cell stayed blank.
    (0, node_test_1.test)('merge-keeps-first-description', async () => {
        const entity = {
            name: 'planet',
            fields: [],
            op: {
                // load comes first in opFieldPrecedence, and describes nothing.
                load: {
                    name: 'load',
                    points: [{ orig: '/planets/{id}', method: 'GET', kind: 'json' }],
                },
                // create describes both.
                create: {
                    name: 'create',
                    points: [{ orig: '/planets', method: 'POST', kind: 'json' }],
                },
            },
        };
        const undescribed = {
            type: 'object',
            properties: {
                id: { key$: 'id', type: 'string' },
                name: { key$: 'name', type: 'string' },
            },
        };
        const described = {
            type: 'object',
            properties: {
                id: { key$: 'id', type: 'string', description: 'Stable identifier.' },
                name: { key$: 'name', type: 'string', description: '  Common name.  ' },
            },
        };
        const def = {
            paths: {
                '/planets/{id}': {
                    get: {
                        responses: {
                            200: { content: { 'application/json': { schema: undescribed } } },
                        },
                    },
                },
                '/planets': {
                    post: {
                        requestBody: { content: { 'application/json': { schema: described } } },
                    },
                },
            },
        };
        const fields = fieldsByName(await runFieldTransform(entity, def));
        node_assert_1.default.strictEqual(fields.name.short, 'Common name.', 'a later op\'s description must survive the merge, trimmed');
        node_assert_1.default.strictEqual(fields.id.short, 'Stable identifier.');
    });
    // The reverse: the FIRST description wins, and a later op must not overwrite
    // it. Precedence exists so that load/create describe the entity; without
    // this, whichever op happened to be last would decide.
    (0, node_test_1.test)('merge-does-not-overwrite-an-existing-description', async () => {
        const entity = {
            name: 'planet',
            fields: [],
            op: {
                load: {
                    name: 'load',
                    points: [{ orig: '/planets/{id}', method: 'GET', kind: 'json' }],
                },
                list: {
                    name: 'list',
                    points: [{ orig: '/planets', method: 'GET', kind: 'json' }],
                },
            },
        };
        const def = {
            paths: {
                '/planets/{id}': {
                    get: {
                        responses: {
                            200: {
                                content: {
                                    'application/json': {
                                        schema: {
                                            type: 'object',
                                            properties: {
                                                name: { key$: 'name', type: 'string', description: 'The one that wins.' },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                '/planets': {
                    get: {
                        responses: {
                            200: {
                                content: {
                                    'application/json': {
                                        schema: {
                                            type: 'array',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    name: { key$: 'name', type: 'string', description: 'The one that loses.' },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };
        const fields = fieldsByName(await runFieldTransform(entity, def));
        node_assert_1.default.strictEqual(fields.name.short, 'The one that wins.');
    });
    // GraphQL field descriptions live on GqlField.desc — parse/graphql.ts puts
    // them there. findGraphqlFieldDefs built field defs with key$/type/required
    // only, so the description lookup in resolveOpFields always read undefined
    // and no GraphQL-sourced SDK ever got a Description column.
    (0, node_test_1.test)('graphql-description-reaches-short', async () => {
        const entity = {
            name: 'planet',
            orig$: 'Planet',
            fields: [],
            op: {
                load: {
                    name: 'load',
                    points: [{ kind: 'graphql', graphql: { entityType$: 'Planet' } }],
                },
            },
        };
        const def = {
            paths: {},
            types: {
                String: { name: 'String', kind: 'SCALAR', fields: {} },
                Planet: {
                    name: 'Planet',
                    kind: 'OBJECT',
                    fields: {
                        id: {
                            name: 'id', gqltype: 'String!', type: 'String',
                            reqd: true, list: false, args: [], deprecated: false,
                        },
                        name: {
                            name: 'name', gqltype: 'String', type: 'String',
                            reqd: false, list: false, args: [], deprecated: false,
                            desc: '  Common name.  ',
                        },
                    },
                },
            },
        };
        const fields = fieldsByName(await runFieldTransform(entity, def));
        node_assert_1.default.strictEqual(fields.name.short, 'Common name.', 'GqlField.desc must reach ModelField.short, trimmed');
        node_assert_1.default.strictEqual(fields.id.short, undefined, 'an undescribed GraphQL field must not acquire an invented description');
    });
    // A description is prose the spec author wrote for a docs page, not a table
    // cell. `short` is rendered by every generated Readme as one cell of a
    // markdown row, where a raw newline ends the row and orphans the rest of the
    // table. The validation corpus has 194 multi-line descriptions and one of
    // 1725 characters, so this is the common case, not the pathological one.
    (0, node_test_1.test)('short-is-reduced-to-one-capped-line', async () => {
        const bullets = [
            'The status of the user',
            '- `joined`, the user has joined the space',
            '- `invited`, the user has been sent an invitation',
        ].join('\n');
        const entity = {
            name: 'planet',
            fields: [],
            op: {
                load: {
                    name: 'load',
                    points: [{ orig: '/planets/{id}', method: 'GET', kind: 'json' }],
                },
            },
        };
        const def = {
            paths: {
                '/planets/{id}': {
                    get: {
                        responses: {
                            200: {
                                content: {
                                    'application/json': {
                                        schema: {
                                            type: 'object',
                                            properties: {
                                                status: { key$: 'status', type: 'string', description: bullets },
                                                note: {
                                                    key$: 'note', type: 'string',
                                                    description: 'First sentence here. Second one should not appear.',
                                                },
                                                long: {
                                                    key$: 'long', type: 'string',
                                                    description: 'x'.repeat(400),
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };
        const fields = fieldsByName(await runFieldTransform(entity, def));
        for (const name of ['status', 'note', 'long']) {
            node_assert_1.default.ok(!fields[name].short.includes('\n'), `${name}.short must not contain a newline — it lands in a markdown table cell`);
        }
        node_assert_1.default.strictEqual(fields.status.short, 'The status of the user - `joined`, the user has joined the space - `invited`, the user has been sent an invitation', 'newlines collapse to spaces rather than being dropped or truncating the text');
        node_assert_1.default.strictEqual(fields.note.short, 'First sentence here.', 'a description with real sentences is cut at the first one');
        node_assert_1.default.strictEqual(fields.long.short.length, 240, 'an over-long description is capped');
        node_assert_1.default.ok(fields.long.short.endsWith('\u2026'), 'the cap is marked with an ellipsis rather than cutting silently');
    });
});
//# sourceMappingURL=field-short.test.js.map