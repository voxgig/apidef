"use strict";
/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const casecollide_1 = require("../dist/transform/casecollide");
// See docs/design/derived-names.md
function run(entity, guide) {
    const logged = [];
    const ctx = {
        apimodel: { main: { kit: { entity } } },
        guide: guide || { entity: {} },
        log: {
            info: (e) => logged.push({ level: 'info', ...e }),
            warn: (e) => logged.push({ level: 'warn', ...e }),
            debug: () => undefined,
        },
    };
    return (0, casecollide_1.casecollideTransform)(ctx).then(() => ({ ctx, logged }));
}
(0, node_test_1.describe)('casecollide', () => {
    // See docs/design/derived-names.md
    (0, node_test_1.test)('drops the colliding entity that has no operations', async () => {
        const { ctx, logged } = await run({
            opt_out: { name: 'opt_out', op: { list: { method: 'GET' }, update: { method: 'PUT' } } },
            optout: { name: 'optout', op: {} },
            other: { name: 'other', op: { list: { method: 'GET' } } },
        }, { entity: { opt_out: {}, optout: {}, other: {} } });
        node_assert_1.default.deepEqual(Object.keys(ctx.apimodel.main.kit.entity).sort(), ['opt_out', 'other']);
        // The guide loses it too, or flow generation would still see it.
        node_assert_1.default.deepEqual(Object.keys(ctx.guide.entity).sort(), ['opt_out', 'other']);
        const drop = logged.find(l => 'entity-case-collision-drop' === l.point);
        node_assert_1.default.equal(drop.entity, 'optout');
        node_assert_1.default.deepEqual(drop.kept, ['opt_out']);
    });
    (0, node_test_1.test)('keeps both when both carry operations, and warns', async () => {
        const { ctx, logged } = await run({
            opt_out: { name: 'opt_out', op: { list: { method: 'GET' } } },
            optout: { name: 'optout', op: { load: { method: 'GET' } } },
        });
        // Dropping either would remove operations from the SDK — worse than a
        // build that fails loudly.
        node_assert_1.default.deepEqual(Object.keys(ctx.apimodel.main.kit.entity).sort(), ['opt_out', 'optout']);
        const warn = logged.find(l => 'entity-case-collision' === l.point);
        node_assert_1.default.equal(warn.level, 'warn');
        node_assert_1.default.deepEqual(warn.entity, ['opt_out', 'optout']);
    });
    (0, node_test_1.test)('leaves an op-less entity alone when nothing collides with it', async () => {
        const { ctx, logged } = await run({
            thing: { name: 'thing', op: { list: { method: 'GET' } } },
            spare: { name: 'spare', op: {} },
        });
        // Only colliding entities are in scope here.
        node_assert_1.default.deepEqual(Object.keys(ctx.apimodel.main.kit.entity).sort(), ['spare', 'thing']);
        node_assert_1.default.equal(logged.length, 0);
    });
    (0, node_test_1.test)('a group of three keeps every entity that has operations', async () => {
        const { ctx } = await run({
            opt_out: { name: 'opt_out', op: { list: { method: 'GET' } } },
            optout: { name: 'optout', op: {} },
            Opt_Out: { name: 'Opt_Out', op: {} },
        });
        node_assert_1.default.deepEqual(Object.keys(ctx.apimodel.main.kit.entity), ['opt_out']);
    });
    (0, node_test_1.test)('an op whose body is empty is not an operation', async () => {
        // See docs/design/derived-names.md
        const { ctx } = await run({
            opt_out: { name: 'opt_out', op: { list: { method: 'GET' } } },
            optout: { name: 'optout', op: { list: {}, update: { args: {} } } },
        });
        node_assert_1.default.deepEqual(Object.keys(ctx.apimodel.main.kit.entity), ['opt_out']);
    });
});
//# sourceMappingURL=casecollide.test.js.map