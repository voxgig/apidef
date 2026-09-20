"use strict";
/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const field_1 = require("../dist/transform/field");
function runFieldTransform(entity, def) {
    const apimodel = { main: { kit: { entity: { [entity.name]: entity } } } };
    return (0, field_1.fieldTransform)({ apimodel, def }).then(() => entity.fields);
}
function fieldsByName(fields) {
    const out = {};
    for (const f of Object.values(fields)) {
        out[f.n] = f;
    }
    return out;
}
function loadOnly(schema) {
    return {
        entity: {
            name: 'planet',
            fields: {},
            op: {
                load: {
                    name: 'load',
                    points: [{ o: '/planets/{id}', m: 'GET', k: 'json' }],
                },
            },
        },
        def: {
            paths: {
                '/planets/{id}': {
                    get: {
                        responses: {
                            200: { content: { 'application/json': { schema } } },
                        },
                    },
                },
            },
        },
    };
}
(0, node_test_1.describe)('field-spec-facts', () => {
    (0, node_test_1.test)('entity fields use compact attributes and preserve schema facts', async () => {
        const { entity, def } = loadOnly({
            type: 'object',
            properties: {
                id: {
                    key$: 'id', type: 'string', required: true,
                    description: 'Stable identifier. More details.',
                    readOnly: true, writeOnly: true, deprecated: true, format: ' uuid ',
                },
            },
        });
        const property = def.paths['/planets/{id}'].get.responses[200].content['application/json'].schema.properties.id;
        const before = JSON.stringify(property);
        const fields = await runFieldTransform(entity, def);
        node_assert_1.default.deepStrictEqual(fields, { id: {
                n: 'id', h: 'Id', t: '`$STRING`', r: true, op: {},
                sh: 'Stable identifier.', ro: true, wo: true, de: true, fo: 'uuid',
            } });
        node_assert_1.default.strictEqual(JSON.stringify(property), before);
    });
    (0, node_test_1.test)('fields are keyed by wire name with derived titles', async () => {
        const { entity, def } = loadOnly({
            type: 'object',
            properties: Object.fromEntries(['userName', 'created_at', 'constructor', 'active'].map(n => [n, { key$: n, type: 'string' }])),
        });
        const fields = await runFieldTransform(entity, def);
        node_assert_1.default.strictEqual(Array.isArray(fields), false);
        node_assert_1.default.deepStrictEqual(Object.keys(fields), ['active', 'constructor', 'created_at', 'userName']);
        node_assert_1.default.deepStrictEqual(Object.values(fields).map((f) => [f.n, f.h]), [
            ['active', 'Active'], ['constructor', 'Constructor'],
            ['created_at', 'Created At'], ['userName', 'User Name'],
        ]);
    });
    (0, node_test_1.test)('the four keywords are carried through', async () => {
        const { entity, def } = loadOnly({
            type: 'object',
            properties: {
                id: { key$: 'id', type: 'string', readOnly: true },
                secret: { key$: 'secret', type: 'string', writeOnly: true },
                legacy: { key$: 'legacy', type: 'string', deprecated: true },
                created: { key$: 'created', type: 'string', format: 'date-time' },
            },
        });
        const fields = fieldsByName(await runFieldTransform(entity, def));
        node_assert_1.default.strictEqual(fields.id.ro, true, 'readOnly is the whole point of this change');
        node_assert_1.default.strictEqual(fields.secret.wo, true);
        node_assert_1.default.strictEqual(fields.legacy.de, true);
        node_assert_1.default.strictEqual(fields.created.fo, 'date-time');
    });
    (0, node_test_1.test)('a false or absent keyword adds no key', async () => {
        const { entity, def } = loadOnly({
            type: 'object',
            properties: {
                plain: { key$: 'plain', type: 'string' },
                stated: {
                    key$: 'stated', type: 'string',
                    readOnly: false, writeOnly: false, deprecated: false,
                },
            },
        });
        const fields = fieldsByName(await runFieldTransform(entity, def));
        for (const name of ['plain', 'stated']) {
            for (const key of ['ro', 'wo', 'de', 'fo']) {
                node_assert_1.default.ok(!(key in fields[name]), name + ': ' + key + ' was emitted for a field the spec did not flag');
            }
        }
    });
    // A non-string or blank `format` is not a format.
    (0, node_test_1.test)('a blank or non-string format is not carried', async () => {
        const { entity, def } = loadOnly({
            type: 'object',
            properties: {
                blank: { key$: 'blank', type: 'string', format: '   ' },
                wrong: { key$: 'wrong', type: 'string', format: 7 },
                real: { key$: 'real', type: 'string', format: '  password  ' },
            },
        });
        const fields = fieldsByName(await runFieldTransform(entity, def));
        node_assert_1.default.ok(!('fo' in fields.blank));
        node_assert_1.default.ok(!('fo' in fields.wrong));
        node_assert_1.default.strictEqual(fields.real.fo, 'password', 'a real format is trimmed, like short');
    });
    (0, node_test_1.test)('an annotation on a later op survives the merge', async () => {
        const entity = {
            name: 'planet',
            fields: {},
            op: {
                // load comes first in opFieldPrecedence and annotates nothing.
                load: {
                    name: 'load',
                    points: [{ o: '/planets/{id}', m: 'GET', k: 'json' }],
                },
                create: {
                    name: 'create',
                    points: [{ o: '/planets', m: 'POST', k: 'json' }],
                },
            },
        };
        const bare = {
            type: 'object',
            properties: {
                id: { key$: 'id', type: 'string' },
                token: { key$: 'token', type: 'string' },
            },
        };
        const annotated = {
            type: 'object',
            properties: {
                id: { key$: 'id', type: 'string', readOnly: true },
                token: { key$: 'token', type: 'string', format: 'password', writeOnly: true },
            },
        };
        const def = {
            paths: {
                '/planets/{id}': {
                    get: {
                        responses: { 200: { content: { 'application/json': { schema: bare } } } },
                    },
                },
                '/planets': {
                    post: {
                        requestBody: { content: { 'application/json': { schema: annotated } } },
                    },
                },
            },
        };
        const fields = fieldsByName(await runFieldTransform(entity, def));
        node_assert_1.default.strictEqual(fields.id.ro, true, 'a later op\'s readOnly must survive the merge');
        node_assert_1.default.strictEqual(fields.token.wo, true);
        node_assert_1.default.strictEqual(fields.token.fo, 'password');
    });
    (0, node_test_1.test)('a readOnly response beats a request that omits it', async () => {
        const entity = {
            name: 'planet',
            fields: {},
            op: {
                load: {
                    name: 'load',
                    points: [{ o: '/planets/{id}', m: 'GET', k: 'json' }],
                },
                create: {
                    name: 'create',
                    points: [{ o: '/planets', m: 'POST', k: 'json' }],
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
                                                id: { key$: 'id', type: 'string', readOnly: true },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                '/planets': {
                    post: {
                        requestBody: {
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: { id: { key$: 'id', type: 'string' } },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };
        const fields = fieldsByName(await runFieldTransform(entity, def));
        node_assert_1.default.strictEqual(fields.id.ro, true, 'the restriction lost to a schema that merely omitted it');
    });
    (0, node_test_1.test)('the parsed schema keeps its own keys', async () => {
        const schema = {
            type: 'object',
            properties: {
                id: { key$: 'id', type: 'string', readOnly: true },
            },
        };
        const own = (o) => null == o || 'object' !== typeof o ? o :
            Array.isArray(o) ? o.map(own) :
                Object.fromEntries(Object.entries(o)
                    .filter(([k]) => !k.endsWith('$'))
                    .map(([k, v]) => [k, own(v)]));
        const before = JSON.stringify(own(schema));
        const { entity, def } = loadOnly(schema);
        await runFieldTransform(entity, def);
        node_assert_1.default.strictEqual(JSON.stringify(own(schema)), before, 'the transform wrote back onto the shared schema');
    });
});
//# sourceMappingURL=field-spec-facts.test.js.map