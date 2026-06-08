"use strict";
/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const operation_1 = require("../../dist/transform/operation");
const types_1 = require("../../dist/types");
// Build a minimal ctx whose guide has one entity with the given path ops.
// `paths$` is what collectOps reads (normally set by the entity transform).
function makeCtx(entname, op) {
    return {
        apimodel: { main: { [types_1.KIT]: { entity: { [entname]: {} } } } },
        guide: {
            entity: {
                [entname]: {
                    name: entname,
                    paths$: [
                        { orig: '/' + entname, parts: [entname], rename: {}, def: {}, op },
                    ],
                },
            },
        },
        log: { info: () => { }, debug: () => { }, warn: () => { } },
    };
}
(0, node_test_1.describe)('transform-operation transform propagation', () => {
    (0, node_test_1.test)('carries the guide-computed res transform onto the point', async () => {
        // Envelope-wrapping response: the guide put `body.pet` on the op.
        const ctx = makeCtx('pet', {
            list: { method: 'GET', transform: { res: '`body.pet`' } },
        });
        await (0, operation_1.operationTransform)(ctx);
        const pt = ctx.apimodel.main[types_1.KIT].entity.pet.op.list.points[0];
        node_assert_1.default.strictEqual(pt.transform.res, '`body.pet`');
        node_assert_1.default.strictEqual(pt.transform.req, '`reqdata`'); // req absent -> default
    });
    (0, node_test_1.test)('falls back to generic defaults when the op has no transform', async () => {
        const ctx = makeCtx('thing', {
            create: { method: 'POST' },
        });
        await (0, operation_1.operationTransform)(ctx);
        const pt = ctx.apimodel.main[types_1.KIT].entity.thing.op.create.points[0];
        node_assert_1.default.strictEqual(pt.transform.res, '`body`');
        node_assert_1.default.strictEqual(pt.transform.req, '`reqdata`');
    });
    (0, node_test_1.test)('does not mutate the shared guide op.transform across points', async () => {
        // Two paths share one op object reference; defaulting on one point
        // must not leak onto the other (the point spreads into a fresh object).
        const sharedOp = { method: 'GET', transform: { res: '`body.pet`' } };
        const ctx = makeCtx('pet', { list: sharedOp });
        ctx.guide.entity.pet.paths$.push({ orig: '/pets/{id}', parts: ['pets', '{id}'], rename: {}, def: {}, op: { list: sharedOp } });
        await (0, operation_1.operationTransform)(ctx);
        // The guide op's transform.req stays undefined (defaults applied on copies).
        node_assert_1.default.strictEqual(sharedOp.transform.res, '`body.pet`');
        node_assert_1.default.strictEqual(sharedOp.transform.req, undefined);
    });
});
//# sourceMappingURL=operation.test.js.map