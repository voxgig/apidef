"use strict";
/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const args_1 = require("../../dist/transform/args");
const types_1 = require("../../dist/types");
// A minimal ctx: one entity with one load point on `path`, and a def whose
// path carries `parameters`. This is the shape argsTransform walks.
function makeCtx(path, parameters) {
    return {
        apimodel: {
            main: {
                [types_1.KIT]: {
                    entity: {
                        kingdom: {
                            name: 'kingdom',
                            op: {
                                load: {
                                    name: 'load',
                                    points: [
                                        { orig: path, method: 'GET', rename: {}, args: {} },
                                    ],
                                },
                            },
                        },
                    },
                },
            },
        },
        def: {
            paths: {
                [path]: { get: { parameters } },
            },
        },
        log: { info: () => { }, debug: () => { }, warn: () => { } },
    };
}
function allargs(ctx) {
    const point = ctx.apimodel.main[types_1.KIT].entity.kingdom.op.load.points[0];
    return [].concat(point.args.params ?? [], point.args.query ?? [], point.args.header ?? [], point.args.cookie ?? []);
}
(0, node_test_1.describe)('transform-args nameless parameters', () => {
    // A `$ref` that resolves to nothing keeps its `$ref` key and has neither
    // `name` nor `in`. Left alone it becomes a nameless `query` arg that every
    // target has to render, and Ruby cannot: `Struct.new(:"")` raises when the
    // generated SDK loads. taxonomy-1.0.0-openapi-3.1.0 in the validation
    // corpus ships exactly this, pointing at a `KingdomId` component that its
    // `components.parameters` does not define.
    (0, node_test_1.test)('drops a dangling $ref parameter and names it in the warning', async () => {
        const ctx = makeCtx('/{year}/kingdom/{kingdom_id}', [
            { name: 'year', in: 'path', required: true, schema: { type: 'integer' } },
            { $ref: '#/components/parameters/KingdomId' },
        ]);
        const warnings = [];
        ctx.warn = (w) => warnings.push(w);
        await (0, args_1.argsTransform)(ctx);
        const args = allargs(ctx);
        node_assert_1.default.deepStrictEqual(args.map((a) => a.name), ['year']);
        node_assert_1.default.strictEqual(args.filter((a) => '' === a.name).length, 0);
        node_assert_1.default.strictEqual(warnings.length, 1);
        node_assert_1.default.strictEqual(warnings[0].entity, 'kingdom');
        node_assert_1.default.strictEqual(warnings[0].op, 'load');
        node_assert_1.default.strictEqual(warnings[0].path, '/{year}/kingdom/{kingdom_id}');
        node_assert_1.default.match(warnings[0].note, /KingdomId/);
        node_assert_1.default.match(warnings[0].note, /resolves to nothing/);
    });
    // Same drop, but there is no reference to name: an inline parameter that
    // simply omits `name`. The note must not promise a `$ref` it has not got.
    (0, node_test_1.test)('drops a parameter with no name at all', async () => {
        const ctx = makeCtx('/kingdom', [
            { in: 'query', schema: { type: 'string' } },
        ]);
        const warnings = [];
        ctx.warn = (w) => warnings.push(w);
        await (0, args_1.argsTransform)(ctx);
        node_assert_1.default.deepStrictEqual(allargs(ctx), []);
        node_assert_1.default.strictEqual(warnings.length, 1);
        node_assert_1.default.doesNotMatch(warnings[0].note, /\$ref/);
        node_assert_1.default.match(warnings[0].note, /needs a `name`/);
    });
    // The drop is narrow: a named parameter beside a nameless one survives
    // with its kind, and nothing else about resolution changes.
    (0, node_test_1.test)('keeps every named parameter', async () => {
        const ctx = makeCtx('/kingdom', [
            { name: 'page', in: 'query', schema: { type: 'integer' } },
            { $ref: '#/components/parameters/Missing' },
            { name: 'x-trace', in: 'header', schema: { type: 'string' } },
        ]);
        ctx.warn = () => { };
        await (0, args_1.argsTransform)(ctx);
        const point = ctx.apimodel.main[types_1.KIT].entity.kingdom.op.load.points[0];
        node_assert_1.default.deepStrictEqual(point.args.query.map((a) => a.name), ['page']);
        node_assert_1.default.deepStrictEqual(point.args.header.map((a) => a.name), ['x_trace']);
    });
});
//# sourceMappingURL=args.test.js.map