"use strict";
/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
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
                                        { o: path, m: 'GET', r: {}, g: {} },
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
    return [].concat(point.g.params ?? [], point.g.query ?? [], point.g.header ?? [], point.g.cookie ?? []);
}
(0, node_test_1.describe)('transform-args nameless parameters', () => {
    (0, node_test_1.test)('drops a dangling $ref parameter and names it in the warning', async () => {
        const ctx = makeCtx('/{year}/kingdom/{kingdom_id}', [
            { name: 'year', in: 'path', required: true, schema: { type: 'integer' } },
            { $ref: '#/components/parameters/KingdomId' },
        ]);
        const warnings = [];
        ctx.warn = (w) => warnings.push(w);
        await (0, args_1.argsTransform)(ctx);
        const args = allargs(ctx);
        node_assert_1.default.deepStrictEqual(args.map((a) => a.n), ['year']);
        node_assert_1.default.strictEqual(args.filter((a) => '' === a.n).length, 0);
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
        node_assert_1.default.deepStrictEqual(point.g.query.map((a) => a.n), ['page']);
        node_assert_1.default.deepStrictEqual(point.g.header.map((a) => a.n), ['x_trace']);
    });
});
(0, node_test_1.test)('compact point arguments preserve renames, order, nullable types and examples', async () => {
    const fixture = JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(__dirname, '../../test/point-args.json'), 'utf8'));
    const ctx = makeCtx('/pets/{petId}', fixture.parameters);
    const point = ctx.apimodel.main[types_1.KIT].entity.kingdom.op.load.points[0];
    point.r = fixture.rename;
    await (0, args_1.argsTransform)(ctx);
    node_assert_1.default.deepStrictEqual(point.g, fixture.expected);
});
//# sourceMappingURL=args.test.js.map