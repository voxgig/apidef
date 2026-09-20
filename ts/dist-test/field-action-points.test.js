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
function names(fields) {
    return Object.keys(fields).sort();
}
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
            fields: {},
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
function installmentByAction(withBody = false) {
    const installment = {
        type: 'object',
        'x-ref': '#/components/schemas/Installment',
        properties: {
            id: { key$: 'id', type: 'string' },
            amount: { key$: 'amount', type: 'number' },
            ends_at: { key$: 'ends_at', type: 'string' },
        },
    };
    const json = (schema) => ({ content: { 'application/json': { schema } } });
    const opdef = {
        responses: {
            200: json({
                type: 'object',
                properties: {
                    data: { key$: 'data', type: 'array', items: installment },
                    meta: { key$: 'meta', type: 'object', properties: {} },
                },
            }),
        },
    };
    if (withBody) {
        // The verb's arguments, which describe the call and not the record.
        opdef.requestBody = json({
            type: 'object',
            properties: {
                notify: { key$: 'notify', type: 'boolean' },
                reason: { key$: 'reason', type: 'string' },
            },
        });
    }
    return {
        entity: {
            name: 'installment',
            fields: {},
            op: {
                list: {
                    name: 'list',
                    points: [
                        {
                            orig: '/v2/installments/active',
                            method: withBody ? 'POST' : 'GET',
                            kind: 'json',
                            select: { $action: 'active', exist: [] },
                        },
                    ],
                },
            },
        },
        def: { paths: { '/v2/installments/active': { [withBody ? 'post' : 'get']: opdef } } },
    };
}
// A GRAPHQL ACTION POINT. Its fields never come from the response: the
// transform reads the entity's own object type, which transform/graphql
// resolved from the root field's return shape and left on `entityType$`.
function commitByMutation() {
    return {
        entity: {
            name: 'commit',
            fields: {},
            op: {
                create: {
                    name: 'create',
                    points: [
                        {
                            orig: 'createCommitOnBranch',
                            method: 'POST',
                            kind: 'graphql',
                            graphql: { entityType$: 'Commit' },
                            select: { $action: 'create_commit_on_branch', exist: [] },
                        },
                    ],
                },
            },
        },
        def: {
            paths: {},
            types: {
                String: { kind: 'SCALAR', name: 'String', fields: {} },
                Boolean: { kind: 'SCALAR', name: 'Boolean', fields: {} },
                Commit: {
                    kind: 'OBJECT',
                    name: 'Commit',
                    fields: {
                        oid: { name: 'oid', type: 'String', reqd: true, list: false, args: [], desc: '' },
                        message: { name: 'message', type: 'String', reqd: false, list: false, args: [], desc: '' },
                        committedViaWeb: {
                            name: 'committedViaWeb', type: 'Boolean', reqd: false, list: false, args: [], desc: '',
                        },
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
        delete entity.op.load;
        const fields = await runFieldTransform(entity, def);
        node_assert_1.default.deepStrictEqual(names(fields), ['diameter', 'id', 'kind', 'name']);
        node_assert_1.default.strictEqual(fields.name?.r, true, 'requiredness comes from the plain create body, which is still read');
    });
    (0, node_test_1.test)('an entity without actions is unaffected', async () => {
        const { entity, def } = planetWithActions();
        entity.op.create.points = [
            { orig: '/api/planet', method: 'POST', kind: 'json' },
        ];
        const fields = await runFieldTransform(entity, def);
        node_assert_1.default.deepStrictEqual(names(fields), ['diameter', 'id', 'kind', 'name']);
    });
    (0, node_test_1.test)('an action whose response IS the entity contributes its fields', async () => {
        const { entity, def } = installmentByAction();
        const fields = await runFieldTransform(entity, def);
        // Without this the entity has no fields at all: `/v2/installments/active`
        // is its only point, so skipping the action skipped everything.
        node_assert_1.default.deepEqual(names(fields), ['amount', 'ends_at', 'id']);
    });
    (0, node_test_1.test)("an action's request body is never harvested, response or not", async () => {
        const { entity, def } = installmentByAction(true);
        const fields = await runFieldTransform(entity, def);
        // `notify` and `reason` are what the caller passes, not what an
        // installment carries, and the response naming the entity does not
        // license the body alongside it.
        node_assert_1.default.deepEqual(names(fields), ['amount', 'ends_at', 'id']);
    });
    (0, node_test_1.test)("a graphql action point contributes the entity's own type", async () => {
        const { entity, def } = commitByMutation();
        const fields = await runFieldTransform(entity, def);
        node_assert_1.default.deepEqual(names(fields), ['committedViaWeb', 'message', 'oid']);
    });
});
//# sourceMappingURL=field-action-points.test.js.map