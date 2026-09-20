"use strict";
/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// The shared aontu model is canonical at top-level model/ and mirrored into
// ts/model/ (for npm) and go/model/ (for the Go module) — see AGENTS.md.
// Each packaging system can only ship files under its own root, so the copies
// are physically duplicated. This test fails if they drift; run
// `make sync-model` to re-sync from the canonical model/.
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const aontu_1 = require("aontu");
const REPO = node_path_1.default.resolve(__dirname, '..', '..');
const MODEL_FILES = ['apidef.aon', 'guide.aon'];
(0, node_test_1.describe)('model-mirror', () => {
    (0, node_test_1.test)('op-points and point-args aliases apply compact keys and defaults', () => {
        const point = {
            m: 'GET', o: '/widgets/{id}', s: [{ var: 'id' }],
            g: {
                params: [{ n: 'id', or: 'widget_id', r: true, t: '`$STRING`' }],
                query: [{ n: 'limit', r: false, t: '`$NUMBER`', ex: 0, a: false }],
                header: [{ n: 'trace', r: false, t: '`$STRING`' }],
                cookie: [{ n: 'session', r: false, t: '`$STRING`' }],
            },
            q: { exist: ['id'] }, r: { param: { widget_id: 'id' } },
            t: { req: '`reqdata`', res: '`body`' },
            co: { version: 2, id: 'GET /widgets/{id}', source: 'openapi3' }, li: false,
        };
        const source = (0, node_fs_1.readFileSync)(node_path_1.default.join(REPO, 'model', 'apidef.aon'), 'utf8') + '\n' +
            'main:kit:entity:widget:op:load:' + JSON.stringify({ name: 'load', points: [point] });
        const model = new aontu_1.Aontu().generate(source);
        const result = model.main.kit.entity.widget.op.load.points[0];
        node_assert_1.default.deepStrictEqual(result, {
            ...point, a: true, k: 'http',
            g: Object.fromEntries(Object.entries(point.g).map(([kind, args]) => [kind, args.map(arg => ({ a: true, ...arg, k: kind === 'params' ? 'param' : kind }))])),
        });
    });
    (0, node_test_1.test)('entity-field alias uses compact keys and defaults activation', () => {
        const fields = {
            id: { n: 'id', h: 'Id', r: true, t: '`$STRING`' },
            secret: { n: 'secret', h: 'Secret', r: false, t: '`$STRING`', a: false,
                sh: 'A secret.', ro: true, wo: true, de: true, fo: 'password' },
        };
        const source = (0, node_fs_1.readFileSync)(node_path_1.default.join(REPO, 'model', 'apidef.aon'), 'utf8') + '\n' +
            'main:kit:entity:widget:fields:' + JSON.stringify(fields);
        const model = new aontu_1.Aontu().generate(source);
        node_assert_1.default.deepStrictEqual(model.main.kit.entity.widget.fields, { id: { ...fields.id, a: true }, secret: fields.secret });
    });
    for (const file of MODEL_FILES) {
        (0, node_test_1.test)(`ts/model/${file} matches canonical model/${file}`, () => {
            const canonical = (0, node_fs_1.readFileSync)(node_path_1.default.join(REPO, 'model', file), 'utf8');
            const tsMirror = (0, node_fs_1.readFileSync)(node_path_1.default.join(REPO, 'ts', 'model', file), 'utf8');
            node_assert_1.default.strictEqual(tsMirror, canonical, `ts/model/${file} drifted from model/${file} — run: make sync-model`);
        });
        (0, node_test_1.test)(`go/model/${file} matches canonical model/${file}`, () => {
            const canonical = (0, node_fs_1.readFileSync)(node_path_1.default.join(REPO, 'model', file), 'utf8');
            const goMirror = (0, node_fs_1.readFileSync)(node_path_1.default.join(REPO, 'go', 'model', file), 'utf8');
            node_assert_1.default.strictEqual(goMirror, canonical, `go/model/${file} drifted from model/${file} — run: make sync-model`);
        });
    }
});
//# sourceMappingURL=model-mirror.test.js.map