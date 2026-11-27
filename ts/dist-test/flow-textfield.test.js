"use strict";
/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const util_1 = require("@voxgig/util");
const apidef_1 = require("../dist/apidef");
const flowstep_1 = require("../dist/transform/flowstep");
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
        const tf = step?.i?.textfield;
        if (null != tf) {
            return tf;
        }
    }
}
// One CRUD entity whose alphabetically-first string field is the one under
// test, so the walk reaches it before `kind`.
function entityWith(first) {
    const point = (orig, method) => ({
        o: orig, m: method, k: 'http',
        g: { params: [{ k: 'param', n: 'id', r: true, t: '`$STRING`' }] },
    });
    return {
        name: 'planet',
        fields: Object.fromEntries([
            { n: 'diameter', t: '`$NUMBER`', r: true },
            first,
            { n: 'id', t: '`$STRING`', r: true },
            { n: 'kind', t: '`$STRING`', r: true },
            { n: 'name', t: '`$STRING`', r: true },
        ].map(f => [f.n, f])),
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
    (0, node_test_1.test)('flow steps match the shared compact-key fixture', async () => {
        const fixture = JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(__dirname, '..', 'test', 'flow-step.json'), 'utf8'));
        const flow = await runFlowstep(fixture.entity);
        node_assert_1.default.deepStrictEqual(flow.step, fixture.steps);
    });
    (0, node_test_1.test)('a readOnly field is not the one the flow marks', async () => {
        const entity = entityWith({ n: 'forbidReason', t: '`$STRING`', r: false, ro: true });
        const flow = await runFlowstep(entity);
        node_assert_1.default.strictEqual(markedField(flow), 'kind', 'the walk must pass over the readOnly field and take the next writable one');
    });
    (0, node_test_1.test)('a writable field in the same position is chosen', async () => {
        const entity = entityWith({ n: 'forbidReason', t: '`$STRING`', r: false });
        const flow = await runFlowstep(entity);
        node_assert_1.default.strictEqual(markedField(flow), 'forbidReason');
    });
    // Every string field being readOnly leaves nothing to mark, and that has to
    // be an absent textfield rather than a readOnly one.
    (0, node_test_1.test)('no writable text field leaves the flow without one', async () => {
        const entity = entityWith({ n: 'forbidReason', t: '`$STRING`', r: false, ro: true });
        for (const f of Object.values(entity.fields)) {
            if ('`$STRING`' === f.t && 'id' !== f.n) {
                f.ro = true;
            }
        }
        const flow = await runFlowstep(entity);
        node_assert_1.default.strictEqual(markedField(flow), undefined);
    });
});
// go/flow_step_test.go builds the same definition.
(0, node_test_1.describe)('flow-patch', () => {
    (0, node_test_1.test)('a route taking PUT and PATCH gets a patch step after the update', async () => {
        const def = 'patch-flow-def.json';
        const dir = (0, node_fs_1.mkdtempSync)(node_path_1.default.join((0, node_os_1.tmpdir)(), 'apidef-patch-flow-'));
        try {
            const folder = node_path_1.default.join(dir, 'model');
            (0, node_fs_1.mkdirSync)(node_path_1.default.join(folder, 'guide'), { recursive: true });
            (0, node_fs_1.mkdirSync)(node_path_1.default.join(dir, 'def'));
            (0, node_fs_1.copyFileSync)(node_path_1.default.join(__dirname, '..', 'test', 'def', def), node_path_1.default.join(dir, 'def', def));
            (0, node_fs_1.writeFileSync)(node_path_1.default.join(folder, 'guide', 'guide.aontu'), '@"@voxgig/apidef/model/guide.aontu"\n@"./base-guide.aontu"\n');
            const build = await apidef_1.ApiDef.makeBuild({ folder, strategy: 'heuristic01' });
            const bres = await build({ name: 'patch-flow', def }, {
                log: (0, util_1.Pino)({ level: 'silent' }),
                spec: {
                    base: folder,
                    buildargs: {
                        apidef: {
                            ctrl: {
                                step: {
                                    parse: true, guide: true, transformers: true, builders: false, generate: false,
                                }
                            }
                        }
                    }
                }
            }, {});
            node_assert_1.default.strictEqual(bres.ok, true, String(bres.err?.message));
            const { entity, flow } = bres.apimodel.main.kit;
            for (const name of ['note', 'page']) {
                node_assert_1.default.deepStrictEqual(Object.keys(entity[name].op).sort(), ['create', 'list', 'load', 'patch', 'remove', 'update']);
                node_assert_1.default.deepStrictEqual(entity[name].op.update.points.map((p) => p.m), ['PUT']);
                node_assert_1.default.deepStrictEqual(entity[name].op.patch.points.map((p) => p.m), ['PATCH']);
            }
            for (const name of ['BasicNoteFlow', 'BasicPageFlow']) {
                node_assert_1.default.deepStrictEqual(flow[name].step.map((step) => step.o), ['create', 'list', 'update', 'patch', 'load', 'remove', 'list']);
            }
            node_assert_1.default.deepStrictEqual(flow.BasicNoteFlow.step[3], {
                i: { ref: 'note_ref01', srcdatavar: 'note_ref01_data', suffix: '_pt0', textfield: 'body' },
                o: 'patch',
                s: [{ apply: 'TextFieldMark', def: { mark: 'Mark01-note_ref01' } }],
            });
            node_assert_1.default.deepStrictEqual(flow.BasicPageFlow.step[3], {
                d: { notebook_id: 'notebook01' },
                i: { ref: 'page_ref01', srcdatavar: 'page_ref01_data', suffix: '_pt0', textfield: 'heading' },
                o: 'patch',
                s: [{ apply: 'TextFieldMark', def: { mark: 'Mark01-page_ref01' } }],
            });
        }
        finally {
            (0, node_fs_1.rmSync)(dir, { recursive: true, force: true });
        }
    });
});
//# sourceMappingURL=flow-textfield.test.js.map