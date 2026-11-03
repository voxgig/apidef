"use strict";
/* Copyright (c) 2026 Voxgig Ltd, MIT License */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Fs = __importStar(require("node:fs"));
const Os = __importStar(require("node:os"));
const Path = __importStar(require("node:path"));
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const util_1 = require("@voxgig/util");
const apidef_1 = require("../dist/apidef");
const nn_1 = require("../dist/guide/nn");
const safetensors_1 = require("../dist/guide/safetensors");
const utility_1 = require("../dist/utility");
const neural01_1 = require("../dist/guide/neural01");
const { buildGuideWeights } = require('../build/nn-weights.js');
const REPO = Path.resolve(__dirname, '..', '..');
const WEIGHTS = Path.join(__dirname, '..', 'nn', 'guide.safetensors');
const NETS = (0, neural01_1.guideNets)();
// The real corpus, found as the Go goldens find it: an apidef-validate
// checkout beside this one, or the v1 folder APIDEF_VALIDATE_DIR names.
const VALIDATE = process.env.APIDEF_VALIDATE_DIR ?? Path.join(REPO, '..', 'apidef-validate', 'v1');
const VALIDATE_DEFS = Path.join(VALIDATE, '..', 'def');
const validateDefs = Fs.existsSync(VALIDATE_DEFS) ? Fs.readdirSync(VALIDATE_DEFS)
    .filter((f) => /\.(json|yaml)$/.test(f) && !f.endsWith('.full.json') && !f.includes('graphql'))
    .sort() : [];
// The manual corpus, metsitaba/api-entity-corpus, checked out beside this one
// or named by API_ENTITY_CORPUS_DIR: each operation the analysts put on a
// resource, embedded or command entity, scored by whether the guide's entity
// shares that entity's name. Virtual and protocol entities are the analysts'
// readings of content the guide never names from, and are left out.
const CORPUS = process.env.API_ENTITY_CORPUS_DIR ?? Path.join(REPO, '..', 'api-entity-corpus');
const CORPUS_BATCH = Path.join(CORPUS, 'batches', 'batch-01');
const CORPUS_MANIFEST = Path.join(CORPUS_BATCH, 'manifest.json');
const corpusApis = Fs.existsSync(CORPUS_MANIFEST) ?
    JSON.parse(Fs.readFileSync(CORPUS_MANIFEST, 'utf8')).apis : [];
// The share of routes on which the guide's entity shares the analysts' name,
// as a run of whole words (contact for student_contact), that a change may
// not fall below.
const CORPUS_FLOOR = 0.65;
const CORPUS_KINDS = ['resource', 'embedded', 'command'];
function sharesName(a, b) {
    const wa = a.split('_').filter(Boolean);
    const wb = b.split('_').filter(Boolean);
    const [s, l] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
    for (let i = 0; 0 < s.length && i + s.length <= l.length; i++) {
        if (s.every((w, j) => w === l[i + j])) {
            return true;
        }
    }
    return false;
}
const DEFDIR = Path.join(__dirname, '..', 'test', 'def');
const SILENT = (0, util_1.Pino)({ level: 'silent' });
const staged = [];
function stage(def, srcdir = DEFDIR) {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-neural-'));
    staged.push(dir);
    const folder = Path.join(dir, 'model');
    Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true });
    Fs.mkdirSync(Path.join(dir, 'def'));
    Fs.copyFileSync(Path.join(srcdir, def), Path.join(dir, 'def', def));
    Fs.writeFileSync(Path.join(folder, 'guide', 'guide.aontu'), '@"@voxgig/apidef/model/guide.aontu"\n@"./base-guide.aontu"\n');
    return folder;
}
async function run(def, strategy, why, srcdir) {
    const folder = stage(def, srcdir);
    const build = await apidef_1.ApiDef.makeBuild({ folder, strategy, why: { show: true === why } });
    const bres = await build({ name: 'neural', def }, {
        log: SILENT,
        spec: {
            base: folder,
            buildargs: {
                apidef: {
                    ctrl: {
                        step: {
                            parse: true, guide: true, transformers: false, builders: false, generate: false,
                        }
                    }
                }
            }
        }
    }, {});
    const basepath = Path.join(folder, 'guide', 'base-guide.aontu');
    const base = Fs.existsSync(basepath) ? Fs.readFileSync(basepath, 'utf8') : '';
    return { bres, base };
}
// Every classification of a guide, keyed by route, in a comparable form.
function routes(guide) {
    const out = {};
    for (const [ename, ent] of Object.entries(guide.entity ?? {})) {
        for (const [p, gp] of Object.entries(ent.path ?? {})) {
            for (const [opname, op] of Object.entries(gp.op ?? {})) {
                out[p + ' ' + op.method] = {
                    entity: ename,
                    op: opname,
                    active: ent.active,
                    actions: Object.keys(gp.action ?? {}).sort(),
                    renames: Object.entries(gp.rename?.param ?? {})
                        .map(([k, v]) => k + '->' + (v?.target ?? v)).sort(),
                    transform: op.transform,
                };
            }
        }
    }
    return out;
}
// A file from a header object and raw tensor bytes, as a tool would write it.
function file(header, data) {
    const json = new TextEncoder().encode(JSON.stringify(header));
    const out = new Uint8Array(8 + json.length + data.length);
    new DataView(out.buffer).setBigUint64(0, BigInt(json.length), true);
    out.set(json, 8);
    out.set(data, 8 + json.length);
    return out;
}
(0, node_test_1.describe)('safetensors', () => {
    (0, node_test_1.test)('round-trip', () => {
        const st = {
            metadata: { format: 'test/1', names: '["a","b"]' },
            tensors: {
                w: { dtype: 'F32', shape: [2, 3], data: [1, -2, 0.5, 0, 3, -0.25] },
                b: { dtype: 'F64', shape: [2], data: [0.1, -7] },
                i: { dtype: 'I64', shape: [3], data: [1, -2, 3] },
                c: { dtype: 'I32', shape: [2], data: [2147483647, -5] },
                s: { dtype: 'I16', shape: [1], data: [-300] },
                y: { dtype: 'I8', shape: [2], data: [-1, 127] },
                u: { dtype: 'U8', shape: [1], data: [200] },
                k: { dtype: 'BOOL', shape: [2], data: [1, 0] },
                e: { dtype: 'F32', shape: [0], data: [] },
            },
        };
        const bytes = (0, safetensors_1.serializeSafetensors)(st);
        const hlen = Number(new DataView(bytes.buffer).getBigUint64(0, true));
        node_assert_1.default.strictEqual(hlen % 8, 0);
        node_assert_1.default.deepStrictEqual((0, safetensors_1.parseSafetensors)(bytes), st);
        node_assert_1.default.deepStrictEqual((0, safetensors_1.serializeSafetensors)((0, safetensors_1.parseSafetensors)(bytes)), bytes);
        node_assert_1.default.deepStrictEqual((0, safetensors_1.parseSafetensors)((0, safetensors_1.serializeSafetensors)({ metadata: {}, tensors: {} })), { metadata: {}, tensors: {} });
    });
    (0, node_test_1.test)('half-precision-reads', () => {
        const bytes = file({
            h: { dtype: 'F16', shape: [4], data_offsets: [0, 8] },
            g: { dtype: 'BF16', shape: [2], data_offsets: [8, 12] },
        }, [0x00, 0x3c, 0x00, 0xc1, 0x00, 0x38, 0x01, 0x00, 0x80, 0x3f, 0x00, 0xc0]);
        const st = (0, safetensors_1.parseSafetensors)(bytes);
        node_assert_1.default.deepStrictEqual(st.tensors.h.data, [1, -2.5, 0.5, 2 ** -24]);
        node_assert_1.default.deepStrictEqual(st.tensors.g.data, [1, -2]);
    });
    (0, node_test_1.test)('rejects-malformed', () => {
        const one = { dtype: 'F32', shape: [1], data_offsets: [0, 4] };
        const four = [0, 0, 0x80, 0x3f];
        node_assert_1.default.throws(() => (0, safetensors_1.parseSafetensors)(new Uint8Array(4)), /shorter/);
        node_assert_1.default.throws(() => (0, safetensors_1.parseSafetensors)(file({ a: one }, [])), /range exceeds the file/);
        node_assert_1.default.throws(() => (0, safetensors_1.parseSafetensors)(file({ a: one }, four).subarray(0, 9)), /header length \d+ exceeds the file/);
        node_assert_1.default.throws(() => (0, safetensors_1.parseSafetensors)(file({ a: { ...one, dtype: 'F128' } }, four)), /unknown dtype/);
        node_assert_1.default.throws(() => (0, safetensors_1.parseSafetensors)(file({ a: { ...one, shape: [-1] } }, four)), /invalid shape/);
        node_assert_1.default.throws(() => (0, safetensors_1.parseSafetensors)(file({ a: { ...one, data_offsets: [4, 0] } }, four)), /invalid data offsets/);
        node_assert_1.default.throws(() => (0, safetensors_1.parseSafetensors)(file({ a: one, b: { ...one, data_offsets: [8, 12] } }, [...four, ...four, ...four])), /does not follow/);
        node_assert_1.default.throws(() => (0, safetensors_1.parseSafetensors)(file({ a: { ...one, shape: [2] } }, four)), /does not match its shape/);
        node_assert_1.default.throws(() => (0, safetensors_1.parseSafetensors)(file({ a: one }, [...four, 0])), /do not fill/);
        node_assert_1.default.throws(() => (0, safetensors_1.parseSafetensors)(file({ __metadata__: { n: 1 }, a: one }, four)), /not a string/);
        node_assert_1.default.throws(() => (0, safetensors_1.parseSafetensors)(file([1], [])), /not an object/);
        node_assert_1.default.throws(() => (0, safetensors_1.serializeSafetensors)({ metadata: {}, tensors: {
                a: { dtype: 'F32', shape: [2], data: [1] }
            } }), /1 values for shape/);
        node_assert_1.default.throws(() => (0, safetensors_1.serializeSafetensors)({ metadata: {}, tensors: {
                a: { dtype: 'F16', shape: [1], data: [1] }
            } }), /not supported/);
    });
});
(0, node_test_1.describe)('nn', () => {
    (0, node_test_1.test)('dense-rejects-unknown-input', () => {
        node_assert_1.default.throws(() => (0, nn_1.dense)(['a'], { u: { b: 0, w: { nope: 1 } } }, 'relu'), /unknown input nope/);
    });
    (0, node_test_1.test)('gates', () => {
        const layer = (0, nn_1.dense)(['a', 'b', 'c'], {
            and3: { b: -2, w: { a: 1, b: 1, c: 1 } },
            or2: { b: 0, w: { a: 1, b: 1 } },
            a_not_b: { b: 0, w: { a: 1, b: -1 } },
            not_a: { b: 1, w: { a: -1 } },
        }, 'relu');
        const at = (a, b, c) => (0, nn_1.forward)([layer], [a, b, c])[1];
        node_assert_1.default.deepStrictEqual(at(1, 1, 1), [1, 2, 0, 0]);
        node_assert_1.default.deepStrictEqual(at(1, 1, 0), [0, 2, 0, 0]);
        node_assert_1.default.deepStrictEqual(at(1, 0, 0), [0, 1, 1, 0]);
        node_assert_1.default.deepStrictEqual(at(0, 0, 0), [0, 0, 0, 1]);
    });
    (0, node_test_1.test)('softmax-argmax', () => {
        const p = (0, nn_1.softmax)([1, 2, 3]);
        node_assert_1.default.ok(Math.abs(p.reduce((a, v) => a + v, 0) - 1) < 1e-12);
        node_assert_1.default.ok(p[2] > p[1] && p[1] > p[0]);
        node_assert_1.default.strictEqual((0, nn_1.argmax)([0, 2, 2, 1]), 1);
        node_assert_1.default.strictEqual((0, nn_1.argmax)([-1]), 0);
    });
    (0, node_test_1.test)('decide-explains', () => {
        const net = (0, nn_1.makeNet)(['x', 'y'], {
            both: { b: -1, w: { x: 1, y: 1 } },
            either: { b: 0, w: { x: 1, y: 1 } },
        }, {
            YES: { b: 0, w: { both: 4, either: 1 } },
            NO: { b: 1, w: {} },
        });
        const yes = (0, nn_1.decide)(net, { x: 1, y: 1 });
        node_assert_1.default.strictEqual(yes.cls, 'YES');
        node_assert_1.default.deepStrictEqual(yes.evidence.map((e) => e.unit), ['both', 'either']);
        node_assert_1.default.strictEqual((0, nn_1.explain)('t', yes), 'nn:t=YES(0.99)[both=4.0,either=2.0]');
        // A tie resolves to the earlier class.
        const tie = (0, nn_1.decide)(net, { x: 1 });
        node_assert_1.default.deepStrictEqual(tie.logits, [1, 1]);
        node_assert_1.default.strictEqual(tie.cls, 'YES');
        node_assert_1.default.deepStrictEqual(tie.evidence.map((e) => e.unit), ['either']);
        const no = (0, nn_1.decide)(net, {});
        node_assert_1.default.strictEqual(no.cls, 'NO');
        node_assert_1.default.deepStrictEqual(no.evidence, []);
    });
    // The read-out encodes the heuristic's if/else-if order: a branch's gate
    // beats any number of gates for the branches below it.
    (0, node_test_1.test)('name-net-precedence', () => {
        const name = (x) => (0, nn_1.decide)(NETS.name, x).cls;
        const cmp = { shaped: 1, shape_tp: 1, cmp_avail: 1, cmp_ne_path: 1 };
        node_assert_1.default.strictEqual(name({ ...cmp, cmp_qualifies: 1, cmp_infrequent: 1, cmp_in_path: 1 }), 'CMPQ');
        node_assert_1.default.strictEqual(name({ ...cmp, cmp_infrequent: 1, cmp_in_path: 1 }), 'CMP');
        node_assert_1.default.strictEqual(name({ ...cmp, cmp_infrequent: 1, cmp_shared: 1 }), 'PATH');
        node_assert_1.default.strictEqual(name({ ...cmp, cmp_infrequent: 1, cmp_shared: 1, cmp_in_path: 1 }), 'CMP');
        node_assert_1.default.strictEqual(name({ ...cmp }), 'PATH');
        const tpt = { shaped: 1, shape_tpt: 1, probable: 1 };
        const del = { ...tpt, m_delete: 1, m_write: 1, delcmp_avail: 1 };
        node_assert_1.default.strictEqual(name({ ...del, last_is_cmp: 1, path_has_children: 1 }), 'DELCMP');
        node_assert_1.default.strictEqual(name({ ...tpt, last_is_cmp: 1, path_has_children: 1 }), 'LAST');
        node_assert_1.default.strictEqual(name({ ...tpt, path_has_children: 1 }), 'LAST');
        node_assert_1.default.strictEqual(name(tpt), 'PART');
        node_assert_1.default.strictEqual(name({ shaped: 1, shape_tpt: 1 }), 'ACT');
        node_assert_1.default.strictEqual(name({ shaped: 1, shape_tpt: 1, cmp_avail: 1, cmp_from_tag: 1, same_path_avail: 1 }), 'SAMEPATH');
        node_assert_1.default.strictEqual(name({ opid_avail: 1, title_avail: 1, seg_avail: 1 }), 'OPID');
        node_assert_1.default.strictEqual(name({}), 'NONE');
    });
    (0, node_test_1.test)('nets-round-trip', () => {
        const nets = {
            tiny: (0, nn_1.makeNet)(['x', 'y'], {
                both: { b: -1, w: { x: 1, y: 1 } },
                either: { b: 0, w: { x: 1, y: 1 } },
            }, {
                YES: { b: 0, w: { both: 4, either: 1 } },
                NO: { b: 1, w: {} },
            }),
        };
        const back = (0, nn_1.loadNets)((0, nn_1.saveNets)(nets));
        node_assert_1.default.deepStrictEqual(back, nets);
        node_assert_1.default.strictEqual((0, nn_1.decide)(back.tiny, { x: 1, y: 1 }).cls, 'YES');
        node_assert_1.default.throws(() => (0, nn_1.loadNets)((0, safetensors_1.serializeSafetensors)({ metadata: { format: 'other/1' }, tensors: {} })), /format is other\/1/);
        node_assert_1.default.throws(() => (0, nn_1.loadNets)((0, safetensors_1.serializeSafetensors)({ metadata: {
                format: nn_1.WEIGHTS_FORMAT, nets: '["t"]', 't.features': '["x"]', 't.hidden': '["h"]',
                't.classes': '["A"]', 't.activation': 'relu',
            }, tensors: {} })), /lack tensor t.hidden/);
    });
    // The shipped file is what the authored tables write, byte for byte.
    (0, node_test_1.test)('guide-weights-match-authored-tables', () => {
        node_assert_1.default.strictEqual(Buffer.compare(Fs.readFileSync(WEIGHTS), Buffer.from(buildGuideWeights())), 0, 'nn/guide.safetensors differs from ts/build/nn-weights.js (run: make nn)');
    });
    // nn/ is canonical; ts/nn/ ships in the npm package and go/nn/ is embedded
    // in the Go module. Checked here so CI holds it, as it does for the model.
    (0, node_test_1.test)('guide-weights-mirrors', () => {
        const canonical = Fs.readFileSync(Path.join(REPO, 'nn', 'guide.safetensors'));
        for (const root of ['ts', 'go']) {
            const mirror = Fs.readFileSync(Path.join(REPO, root, 'nn', 'guide.safetensors'));
            node_assert_1.default.strictEqual(Buffer.compare(canonical, mirror), 0, root + '/nn/guide.safetensors drifted from nn/guide.safetensors (run: make sync-nn)');
        }
    });
    (0, node_test_1.test)('guide-weights-file', () => {
        const st = (0, safetensors_1.parseSafetensors)(Fs.readFileSync(WEIGHTS));
        node_assert_1.default.strictEqual(st.metadata.format, nn_1.WEIGHTS_FORMAT);
        node_assert_1.default.deepStrictEqual(JSON.parse(st.metadata.nets), neural01_1.GUIDE_NETS);
        for (const [name, tensor] of Object.entries(st.tensors)) {
            node_assert_1.default.strictEqual(tensor.dtype, 'F32', name);
            node_assert_1.default.ok(tensor.data.every((v) => Number.isInteger(2 * v)), name);
        }
        node_assert_1.default.deepStrictEqual(st.tensors['name.hidden.weight'].shape, [NETS.name.layers[0].outputs.length, NETS.name.features.length]);
    });
    (0, node_test_1.test)('strategy-nets-are-well-formed', () => {
        for (const [name, net] of Object.entries(NETS)) {
            node_assert_1.default.strictEqual(net.layers.length, 2, name);
            node_assert_1.default.ok(0 < net.classes.length, name);
            const d = (0, nn_1.decide)(net, {});
            node_assert_1.default.ok(d.logits.every((v) => Number.isFinite(v)), name);
            node_assert_1.default.ok(net.classes.includes(d.cls), name);
        }
    });
});
(0, node_test_1.describe)('neural01', () => {
    (0, node_test_1.after)(() => {
        for (const dir of staged) {
            Fs.rmSync(dir, { recursive: true, force: true });
        }
    });
    (0, node_test_1.test)('guide-solar', async () => {
        const { bres } = await run('solar-1.0.0-openapi-3.0.0-def.yaml', 'neural01');
        node_assert_1.default.strictEqual(bres.ok, true, String(bres.err?.message));
        node_assert_1.default.deepStrictEqual(bres.guide.entity, SOLAR_GUIDE.entity);
        node_assert_1.default.strictEqual(bres.guide.metrics.count.entity, 2);
        node_assert_1.default.strictEqual(bres.guide.metrics.count.path, 6);
        node_assert_1.default.strictEqual(bres.guide.metrics.count.method, 12);
    });
    (0, node_test_1.test)('guide-verb-on-parent', async () => {
        const { bres } = await run('verb-def.json', 'neural01');
        node_assert_1.default.strictEqual(bres.ok, true, String(bres.err?.message));
        node_assert_1.default.deepStrictEqual(Object.keys(bres.guide.entity).sort(), ['note', 'thing']);
        const merge = bres.guide.entity.thing.path['/things/{thing_number}/merge'];
        node_assert_1.default.ok(null != merge, 'merge path did not join thing');
        node_assert_1.default.deepStrictEqual(Object.keys(merge.action ?? {}), ['merge']);
        node_assert_1.default.deepStrictEqual(Object.keys(merge.op).sort(), ['load', 'update']);
        node_assert_1.default.strictEqual(merge.rename.param.thing_number, 'id');
        const notes = bres.guide.entity.note.path['/things/{thing_number}/notes'];
        node_assert_1.default.ok(null != notes, 'nested collection lost');
        node_assert_1.default.ok(null == notes.action || 0 === Object.keys(notes.action).length);
    });
    (0, node_test_1.test)('traces-name-the-deciding-units', async () => {
        const { bres, base } = await run('verb-def.json', 'neural01', true);
        node_assert_1.default.strictEqual(bres.ok, true, String(bres.err?.message));
        node_assert_1.default.ok(base.includes('nn:name=PARENT('), base);
        node_assert_1.default.ok(base.includes('[vop='), base);
        node_assert_1.default.ok(base.includes('nn:op=list('), base);
        node_assert_1.default.ok(base.includes('nn:param=ID('), base);
        node_assert_1.default.ok(base.includes('nn:action=LAST('), base);
    });
    (0, node_test_1.test)('unknown-strategy-is-refused', async () => {
        const { bres } = await run('verb-def.json', 'neural02');
        node_assert_1.default.strictEqual(bres.ok, false);
        node_assert_1.default.ok(String(bres.err?.message).includes('Unknown guide strategy: neural02'));
    });
    async function assertParity(def, srcdir) {
        const h = await run(def, 'heuristic01', false, srcdir);
        const n = await run(def, 'neural01', false, srcdir);
        node_assert_1.default.strictEqual(h.bres.ok, true, def + ': ' + String(h.bres.err?.message));
        node_assert_1.default.strictEqual(n.bres.ok, true, def + ': ' + String(n.bres.err?.message));
        node_assert_1.default.deepStrictEqual(routes(n.bres.guide), routes(h.bres.guide), def);
        node_assert_1.default.deepStrictEqual(Object.keys(n.bres.guide.entity).sort(), Object.keys(h.bres.guide.entity).sort(), def);
        node_assert_1.default.deepStrictEqual(n.bres.guide.metrics.count, h.bres.guide.metrics.count, def);
    }
    // The whole corpus, route by route, against the canonical heuristic.
    (0, node_test_1.test)('agrees-with-heuristic01-on-the-corpus', async () => {
        const defs = Fs.readdirSync(DEFDIR)
            .filter((f) => /-def\.(json|yaml)$/.test(f) && !f.includes('graphql'))
            .sort();
        node_assert_1.default.ok(30 < defs.length, 'corpus: ' + defs.length);
        for (const def of defs) {
            await assertParity(def);
        }
    });
    (0, node_test_1.test)('scores-against-api-entity-corpus', {
        skip: 0 === corpusApis.length ? 'no api-entity-corpus manifest at ' + CORPUS_MANIFEST : false,
    }, async (t) => {
        let scored = 0;
        let agreed = 0;
        for (const api of corpusApis) {
            const doc = JSON.parse(Fs.readFileSync(Path.join(CORPUS_BATCH, api.entitiesFile), 'utf8'));
            const { bres } = await run(Path.basename(api.specFile), 'neural01', false, Path.join(CORPUS_BATCH, Path.dirname(api.specFile)));
            node_assert_1.default.strictEqual(bres.ok, true, api.name + ': ' + String(bres.err?.message));
            // A route the analysts put on several entities agrees through any of them.
            const named = {};
            for (const ent of doc.entities ?? []) {
                if (!CORPUS_KINDS.includes(ent.kind)) {
                    continue;
                }
                for (const op of ent.operations ?? []) {
                    const key = op.path + ' ' + String(op.method).toUpperCase();
                    (named[key] = named[key] ?? []).push((0, utility_1.canonize)(ent.name));
                }
            }
            const got = routes(bres.guide);
            for (const [key, names] of Object.entries(named)) {
                if (null == got[key]) {
                    continue;
                }
                scored++;
                agreed += names.some((name) => sharesName(name, got[key].entity)) ? 1 : 0;
            }
        }
        const rate = agreed / Math.max(1, scored);
        t.diagnostic('api-entity-corpus: ' + agreed + ' of ' + scored + ' routes share the analysts\' ' +
            'entity name (' + (100 * rate).toFixed(1) + '%)');
        node_assert_1.default.ok(CORPUS_FLOOR <= rate, 'api-entity-corpus agreement ' + (100 * rate).toFixed(1) +
            '% is below the floor of ' + (100 * CORPUS_FLOOR) + '%');
    });
    (0, node_test_1.test)('agrees-with-heuristic01-on-apidef-validate', {
        skip: 0 === validateDefs.length ? 'no apidef-validate definitions at ' + VALIDATE_DEFS : false,
    }, async () => {
        for (const def of validateDefs) {
            await assertParity(def, VALIDATE_DEFS);
        }
    });
});
const SOLAR_GUIDE = {
    entity: {
        moon: {
            path: {
                '/api/planet/{planet_id}/moon': {
                    op: {
                        create: { method: 'POST' },
                        list: { method: 'GET' }
                    }
                },
                '/api/planet/{planet_id}/moon/{moon_id}': {
                    rename: { param: { moon_id: 'id' } },
                    op: {
                        load: { method: 'GET' },
                        remove: { method: 'DELETE' },
                        update: { method: 'PUT' }
                    }
                }
            },
            name: 'moon'
        },
        planet: {
            path: {
                '/api/planet': {
                    op: {
                        create: { method: 'POST' },
                        list: { method: 'GET' }
                    }
                },
                '/api/planet/{planet_id}': {
                    rename: { param: { planet_id: 'id' } },
                    op: {
                        load: { method: 'GET' },
                        remove: { method: 'DELETE' },
                        update: { method: 'PUT' }
                    }
                },
                '/api/planet/{planet_id}/forbid': {
                    action: { forbid: {} },
                    rename: { param: { planet_id: 'id' } },
                    op: { create: { method: 'POST' } }
                },
                '/api/planet/{planet_id}/terraform': {
                    action: { terraform: {} },
                    rename: { param: { planet_id: 'id' } },
                    op: { create: { method: 'POST' } }
                }
            },
            name: 'planet'
        }
    },
};
//# sourceMappingURL=neural.test.js.map