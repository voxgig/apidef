"use strict";
/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const flowstep_1 = require("../dist/transform/flowstep");
// WHICH FIELD THE BASIC FLOW MARKS.
//
// The update step writes a text field, appends a mark, and the load step
// after it asserts the mark came back. The field is chosen by walking the
// entity's fields, which are sorted by name — so which one it lands on is
// alphabetical accident, and any field it may land on has to be one a client
// can actually write.
//
// `readOnly` is the spec's statement that a client may not. solar's planet
// declared `forbidReason` once its spec described what the server returns,
// and the flow moved from `kind` to it: a step that writes a value the
// server discards and then asserts it was kept.
function runFlowstep(entity) {
    const flow = {
        name: 'Basic' + entity.name + 'Flow',
        entity: entity.name,
        kind: 'basic',
        step: [],
    };
    const apimodel = {
        main: {
            kit: {
                entity: { [entity.name]: entity },
                flow: { [flow.name]: flow },
            },
        },
    };
    const log = { debug: () => undefined };
    return (0, flowstep_1.flowstepTransform)({ apimodel, guide: {}, log }).then(() => flow);
}
function markedField(flow) {
    for (const step of flow.step) {
        const tf = step?.input?.textfield;
        if (null != tf) {
            return tf;
        }
    }
}
// One CRUD entity whose alphabetically-first string field is the one under
// test, so the walk reaches it before `kind`.
function entityWith(first) {
    const point = (orig, method) => ({
        orig, method, kind: 'json',
        args: { params: [{ kind: 'param', name: 'id', reqd: true, type: '`$STRING`' }] },
    });
    return {
        name: 'planet',
        fields: [
            { name: 'diameter', type: '`$NUMBER`', req: true },
            first,
            { name: 'id', type: '`$STRING`', req: true },
            { name: 'kind', type: '`$STRING`', req: true },
            { name: 'name', type: '`$STRING`', req: true },
        ],
        id: { name: 'id', field: 'id' },
        op: {
            create: { name: 'create', points: [point('/api/planet', 'POST')] },
            list: { name: 'list', points: [point('/api/planet', 'GET')] },
            load: { name: 'load', points: [point('/api/planet/{id}', 'GET')] },
            update: { name: 'update', points: [point('/api/planet/{id}', 'PUT')] },
            remove: { name: 'remove', points: [point('/api/planet/{id}', 'DELETE')] },
        },
    };
}
(0, node_test_1.describe)('flow-textfield', () => {
    (0, node_test_1.test)('a readOnly field is not the one the flow marks', async () => {
        const entity = entityWith({ name: 'forbidReason', type: '`$STRING`', req: false, readOnly: true });
        const flow = await runFlowstep(entity);
        node_assert_1.default.strictEqual(markedField(flow), 'kind', 'the walk must pass over the readOnly field and take the next writable one');
    });
    // The same field WITHOUT the flag is a perfectly good choice — this skips
    // what the spec says a client may not send, not every optional field.
    (0, node_test_1.test)('a writable field in the same position is chosen', async () => {
        const entity = entityWith({ name: 'forbidReason', type: '`$STRING`', req: false });
        const flow = await runFlowstep(entity);
        node_assert_1.default.strictEqual(markedField(flow), 'forbidReason');
    });
    // Every string field being readOnly leaves nothing to mark, and that has to
    // be an absent textfield rather than a readOnly one.
    (0, node_test_1.test)('no writable text field leaves the flow without one', async () => {
        const entity = entityWith({ name: 'forbidReason', type: '`$STRING`', req: false, readOnly: true });
        for (const f of entity.fields) {
            if ('`$STRING`' === f.type && 'id' !== f.name) {
                f.readOnly = true;
            }
        }
        const flow = await runFlowstep(entity);
        node_assert_1.default.strictEqual(markedField(flow), undefined);
    });
});
//# sourceMappingURL=flow-textfield.test.js.map