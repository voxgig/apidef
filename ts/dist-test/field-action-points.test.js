"use strict";
/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const field_1 = require("../dist/transform/field");
// An ACTION POINT contributes no fields to the entity.
//
// A custom action — `POST /api/planet/{planet_id}/terraform` — is classified
// under `create` and marked with `select.$action`. Every point of an op was
// harvested for fields, so the action's request body (that verb's arguments)
// and its response (that verb's result) were read as though each described a
// planet. solar's planet, four properties in the spec, came out with ten
// fields; the six extra reached the generated `Planet` type, its create and
// update data types, and the generated reference's field table.
//
// The rule this pins is already stated twice in the same transform:
// `identityParams` skips action points because they are verbs rather than
// addresses, and `responseCandidates` skips them because an action's response
// is not a representation of the entity. The field list now agrees.
function runFieldTransform(entity, def) {
    const apimodel = { main: { kit: { entity: { [entity.name]: entity } } } };
    return (0, field_1.fieldTransform)({ apimodel, def }).then(() => entity.fields);
}
function names(fields) {
    return fields.map((f) => f.name).sort();
}
// A planet shaped like solar's: a plain create alongside two action points,
// all three under `create`, plus the load that carries the entity proper.
function planetWithActions() {
    const planet = {
        type: 'object',
        required: ['id', 'name', 'kind', 'diameter'],
        properties: {
            id: { key$: 'id', type: 'string' },
            name: { key$: 'name', type: 'string' },
            kind: { key$: 'kind', type: 'string' },
            diameter: { key$: 'diameter', type: 'number' },
        },
    };
    // `{ok, state}` — the shared reply of both actions. Two properties, so it
    // is not an envelope, and envelopeProp leaves it whole.
    const actionResponse = {
        type: 'object',
        properties: {
            ok: { key$: 'ok', type: 'boolean' },
            state: { key$: 'state', type: 'string' },
        },
    };
    const json = (schema) => ({ content: { 'application/json': { schema } } });
    return {
        entity: {
            name: 'planet',
            fields: [],
            op: {
                load: {
                    name: 'load',
                    points: [
                        { orig: '/api/planet/{id}', method: 'GET', kind: 'json' },
                    ],
                },
                create: {
                    name: 'create',
                    points: [
                        {
                            orig: '/api/planet/{id}/forbid', method: 'POST', kind: 'json',
                            select: { $action: 'forbid', exist: ['id'] },
                        },
                        {
                            orig: '/api/planet/{id}/terraform', method: 'POST', kind: 'json',
                            select: { $action: 'terraform', exist: ['id'] },
                        },
                        { orig: '/api/planet', method: 'POST', kind: 'json' },
                    ],
                },
            },
        },
        def: {
            paths: {
                '/api/planet/{id}': {
                    get: { responses: { 200: json(planet) } },
                },
                '/api/planet': {
                    post: {
                        requestBody: json(planet),
                        responses: { 201: json(planet) },
                    },
                },
                '/api/planet/{id}/terraform': {
                    post: {
                        requestBody: json({
                            type: 'object',
                            properties: {
                                start: { key$: 'start', type: 'boolean' },
                                stop: { key$: 'stop', type: 'boolean' },
                            },
                        }),
                        responses: { 200: json(actionResponse) },
                    },
                },
                '/api/planet/{id}/forbid': {
                    post: {
                        requestBody: json({
                            type: 'object',
                            required: ['forbid'],
                            properties: {
                                forbid: { key$: 'forbid', type: 'boolean' },
                                why: { key$: 'why', type: 'string' },
                            },
                        }),
                        responses: { 200: json(actionResponse) },
                    },
                },
            },
        },
    };
}
(0, node_test_1.describe)('field-action-points', () => {
    (0, node_test_1.test)('an action point contributes no fields', async () => {
        const { entity, def } = planetWithActions();
        const fields = await runFieldTransform(entity, def);
        node_assert_1.default.deepStrictEqual(names(fields), ['diameter', 'id', 'kind', 'name'], 'the entity is what the spec says a planet is, not that plus two ' +
            'action payloads and their reply envelope');
        for (const stray of ['forbid', 'ok', 'start', 'state', 'stop', 'why']) {
            node_assert_1.default.ok(!names(fields).includes(stray), stray + ' is an action argument or result, never a planet field');
        }
    });
    // The plain create is a point of the same op, and it is the one that
    // carries the entity. Skipping the action points must not take it too.
    (0, node_test_1.test)('the plain create beside the actions is still harvested', async () => {
        const { entity, def } = planetWithActions();
        // Drop the load, leaving `create` as the only op: its three points are
        // then the sole source of fields.
        delete entity.op.load;
        const fields = await runFieldTransform(entity, def);
        node_assert_1.default.deepStrictEqual(names(fields), ['diameter', 'id', 'kind', 'name']);
        node_assert_1.default.strictEqual(fields.find((f) => 'name' === f.name)?.req, true, 'requiredness comes from the plain create body, which is still read');
    });
    // An entity with no actions is untouched — the six fields solar's planet
    // lost are not a general narrowing of what a field list may contain.
    (0, node_test_1.test)('an entity without actions is unaffected', async () => {
        const { entity, def } = planetWithActions();
        entity.op.create.points = [
            { orig: '/api/planet', method: 'POST', kind: 'json' },
        ];
        const fields = await runFieldTransform(entity, def);
        node_assert_1.default.deepStrictEqual(names(fields), ['diameter', 'id', 'kind', 'name']);
    });
});
//# sourceMappingURL=field-action-points.test.js.map