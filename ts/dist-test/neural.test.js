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
const neural01_1 = require("../dist/guide/neural01");
const DEFDIR = Path.join(__dirname, '..', 'test', 'def');
const SILENT = (0, util_1.Pino)({ level: 'silent' });
const staged = [];
function stage(def) {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-neural-'));
    staged.push(dir);
    const folder = Path.join(dir, 'model');
    Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true });
    Fs.mkdirSync(Path.join(dir, 'def'));
    Fs.copyFileSync(Path.join(DEFDIR, def), Path.join(dir, 'def', def));
    Fs.writeFileSync(Path.join(folder, 'guide', 'guide.aontu'), '@"@voxgig/apidef/model/guide.aontu"\n@"./base-guide.aontu"\n');
    return folder;
}
async function run(def, strategy, why) {
    const folder = stage(def);
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
        const name = (x) => (0, nn_1.decide)(neural01_1.NETS.name, x).cls;
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
    (0, node_test_1.test)('strategy-nets-are-well-formed', () => {
        for (const [name, net] of Object.entries(neural01_1.NETS)) {
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
    // The whole corpus, route by route, against the canonical heuristic.
    (0, node_test_1.test)('agrees-with-heuristic01-on-the-corpus', async () => {
        const defs = Fs.readdirSync(DEFDIR)
            .filter((f) => /-def\.(json|yaml)$/.test(f) && !f.includes('graphql'))
            .sort();
        node_assert_1.default.ok(30 < defs.length, 'corpus: ' + defs.length);
        for (const def of defs) {
            const h = await run(def, 'heuristic01');
            const n = await run(def, 'neural01');
            node_assert_1.default.strictEqual(h.bres.ok, true, def + ': ' + String(h.bres.err?.message));
            node_assert_1.default.strictEqual(n.bres.ok, true, def + ': ' + String(n.bres.err?.message));
            node_assert_1.default.deepStrictEqual(routes(n.bres.guide), routes(h.bres.guide), def);
            node_assert_1.default.deepStrictEqual(Object.keys(n.bres.guide.entity).sort(), Object.keys(h.bres.guide.entity).sort(), def);
            node_assert_1.default.deepStrictEqual(n.bres.guide.metrics.count, h.bres.guide.metrics.count, def);
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