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
const apidef_1 = require("../dist/apidef");
const guide_1 = require("../dist/guide/guide");
const PREFIX = 'solar-1.0.0-openapi-3.0.0-';
const DEF = PREFIX + 'def.yaml';
const HEAD = [
    '@"@voxgig/apidef/model/guide.aontu"',
    '@"./' + PREFIX + 'base-guide.aontu"',
    '',
].join('\n');
const staged = [];
function stage(entry, name = PREFIX + 'guide.aontu') {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-overlay-'));
    staged.push(dir);
    const folder = Path.join(dir, 'model');
    Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true });
    Fs.mkdirSync(Path.join(dir, 'def'));
    Fs.copyFileSync(Path.join(__dirname, '..', 'test', 'def', DEF), Path.join(dir, 'def', DEF));
    if (null != entry) {
        Fs.writeFileSync(Path.join(folder, 'guide', name), entry);
    }
    return folder;
}
async function run(folder, log) {
    const build = await apidef_1.ApiDef.makeBuild({ folder, outprefix: PREFIX });
    return build({ name: 'solar', def: DEF }, {
        log,
        spec: {
            base: folder,
            buildargs: {
                apidef: {
                    ctrl: {
                        step: {
                            parse: true, guide: true, transformers: true,
                            builders: false, generate: false,
                        }
                    }
                }
            }
        }
    }, {});
}
(0, node_test_1.describe)('guide-overlay', () => {
    (0, node_test_1.after)(() => {
        for (const dir of staged) {
            Fs.rmSync(dir, { recursive: true, force: true });
        }
    });
    (0, node_test_1.test)('customizations-honoured', async () => {
        const folder = stage(HEAD + [
            'guide: entity: moon: active: false',
            'guide: entity: planet: path: "/api/planet/{planet_id}": op: remove: active: false',
            '',
        ].join('\n'));
        const bres = await run(folder);
        node_assert_1.default.strictEqual(bres.ok, true, String(bres.err?.message));
        node_assert_1.default.strictEqual(bres.guide.entity.moon.active, false);
        node_assert_1.default.deepStrictEqual(Object.keys(bres.apimodel.main.kit.entity), ['planet']);
        node_assert_1.default.deepStrictEqual(Object.keys(bres.apimodel.main.kit.entity.planet.op).sort(), ['create', 'list', 'load', 'update']);
    });
    (0, node_test_1.test)('id-correction-reaches-guide', async () => {
        const bres = await run(stage(HEAD + [
            'guide: entity: planet: id: {',
            '  parts: [ "planet_id" ]',
            '  sep: ":"',
            '  composite: *true',
            '  from: planet_id: "id"',
            '}',
            '',
        ].join('\n')));
        node_assert_1.default.strictEqual(bres.ok, true, String(bres.err?.message));
        node_assert_1.default.deepStrictEqual(bres.guide.entity.planet.id, {
            parts: ['planet_id'], sep: ':', composite: true, from: { planet_id: 'id' },
        });
    });
    (0, node_test_1.test)('bare-overlay-matches-heuristic', async () => {
        const bres = await run(stage(HEAD + 'guide: {}\n'));
        node_assert_1.default.strictEqual(bres.ok, true, String(bres.err?.message));
        node_assert_1.default.deepStrictEqual(Object.keys(bres.apimodel.main.kit.entity).sort(), ['moon', 'planet']);
        node_assert_1.default.deepStrictEqual(Object.keys(bres.apimodel.main.kit.entity.planet.op).sort(), ['create', 'list', 'load', 'remove', 'update']);
    });
    (0, node_test_1.test)('base-guide-overwritten', async () => {
        const folder = stage(HEAD + 'guide: {}\n');
        const basepath = Path.join(folder, 'guide', PREFIX + 'base-guide.aontu');
        Fs.writeFileSync(basepath, [
            '<<<<<<< ours',
            'guide: entity: moon: active: false',
            '=======',
            '>>>>>>> theirs',
            '',
        ].join('\n'));
        const bres = await run(folder);
        node_assert_1.default.strictEqual(bres.ok, true, String(bres.err?.message));
        const base = Fs.readFileSync(basepath, 'utf8');
        node_assert_1.default.ok(base.startsWith((0, guide_1.baseGuideHeader)(PREFIX).join('\n') + '\n'), base);
        node_assert_1.default.ok(!base.includes('<<<<<<<'), base);
        node_assert_1.default.deepStrictEqual(Object.keys(bres.apimodel.main.kit.entity).sort(), ['moon', 'planet']);
    });
    (0, node_test_1.test)('no-guide-fails', async () => {
        for (const entry of ['', '# nothing\n', 'foo: 1\n']) {
            const folder = stage(entry);
            const bres = await run(folder);
            node_assert_1.default.strictEqual(bres.ok, false, JSON.stringify(entry));
            node_assert_1.default.ok(String(bres.err?.message).includes((0, guide_1.missingGuideMessage)(Path.join(folder, 'guide', PREFIX + 'guide.aontu'), PREFIX)), bres.err?.message);
        }
    });
    (0, node_test_1.test)('legacy-entry-migrated', async () => {
        for (const dir of ['', './']) {
            const folder = stage([
                '@"@voxgig/apidef/model/guide.aon"',
                '@"' + dir + PREFIX + 'base-guide.aon"',
                'guide: entity: moon: active: false',
                '',
            ].join('\n'), PREFIX + 'guide.aon');
            const bres = await run(folder);
            node_assert_1.default.strictEqual(bres.ok, true, String(bres.err?.message));
            const guidedir = Path.join(folder, 'guide');
            node_assert_1.default.ok(!Fs.existsSync(Path.join(guidedir, PREFIX + 'guide.aon')));
            const entry = Fs.readFileSync(Path.join(guidedir, PREFIX + 'guide.aontu'), 'utf8');
            node_assert_1.default.ok(entry.includes('@"@voxgig/apidef/model/guide.aontu"'), entry);
            node_assert_1.default.ok(entry.includes('@"./' + PREFIX + 'base-guide.aontu"'), entry);
            node_assert_1.default.deepStrictEqual(Object.keys(bres.apimodel.main.kit.entity), ['planet']);
        }
    });
    (0, node_test_1.test)('legacy-include-migrated', async () => {
        const folder = stage([
            '@"@voxgig/apidef/model/guide.aontu"',
            '@"./' + PREFIX + 'base-guide.aon"',
            'guide: entity: moon: active: false',
            '',
        ].join('\n'));
        const bres = await run(folder);
        node_assert_1.default.strictEqual(bres.ok, true, String(bres.err?.message));
        const entry = Fs.readFileSync(Path.join(folder, 'guide', PREFIX + 'guide.aontu'), 'utf8');
        node_assert_1.default.ok(entry.includes('@"./' + PREFIX + 'base-guide.aontu"'), entry);
        node_assert_1.default.deepStrictEqual(Object.keys(bres.apimodel.main.kit.entity), ['planet']);
    });
    (0, node_test_1.test)('bare-include-migrated', async () => {
        const folder = stage([
            '@"@voxgig/apidef/model/guide.aontu"',
            '@"' + PREFIX + 'base-guide.aontu"',
            'guide: entity: moon: active: false',
            '',
        ].join('\n'));
        const bres = await run(folder);
        node_assert_1.default.strictEqual(bres.ok, true, String(bres.err?.message));
        const entry = Fs.readFileSync(Path.join(folder, 'guide', PREFIX + 'guide.aontu'), 'utf8');
        node_assert_1.default.ok(entry.includes('@"./' + PREFIX + 'base-guide.aontu"'), entry);
        node_assert_1.default.deepStrictEqual(Object.keys(bres.apimodel.main.kit.entity), ['planet']);
    });
    (0, node_test_1.test)('schema-include-spellings', async () => {
        for (const include of [
            '@\'@voxgig/apidef/model/guide.aontu\'',
            '@ "@voxgig/apidef/model/guide.aontu"',
            '@`@voxgig/apidef/model/guide.aontu`',
            '@\n"@voxgig/apidef/model/guide.aontu"',
        ]) {
            const bres = await run(stage([
                include,
                '@"./' + PREFIX + 'base-guide.aontu"',
                'guide: entity: moon: active: false',
                '',
            ].join('\n')));
            node_assert_1.default.strictEqual(bres.ok, true, include + ': ' + String(bres.err?.message));
            node_assert_1.default.deepStrictEqual(Object.keys(bres.apimodel.main.kit.entity), ['planet']);
        }
    });
    (0, node_test_1.test)('nested-schema-include', async () => {
        const folder = stage([
            '@"./shared.aontu"',
            'guide: entity: moon: active: false',
            '',
        ].join('\n'));
        Fs.writeFileSync(Path.join(folder, 'guide', 'shared.aontu'), HEAD);
        const bres = await run(folder);
        node_assert_1.default.strictEqual(bres.ok, true, String(bres.err?.message));
        node_assert_1.default.deepStrictEqual(Object.keys(bres.apimodel.main.kit.entity), ['planet']);
    });
    (0, node_test_1.test)('missing-entry-fails', async () => {
        const bres = await run(stage(null));
        node_assert_1.default.strictEqual(bres.ok, false);
        node_assert_1.default.match(String(bres.err?.message), /guide\.aontu/);
    });
    (0, node_test_1.test)('conflict-marker-fails', async () => {
        const folder = stage(HEAD + [
            '<<<<<<< ours',
            'guide: entity: moon: active: false',
            '=======',
            '>>>>>>> theirs',
            '',
        ].join('\n'));
        const bres = await run(folder);
        const entry = Path.join(folder, 'guide', PREFIX + 'guide.aontu');
        node_assert_1.default.strictEqual(bres.ok, false);
        node_assert_1.default.ok(String(bres.err?.message).includes('@voxgig/apidef: guide: unresolved merge conflict at ' + entry + ':3\n' +
            '  <<<<<<< ours\n' +
            'Resolve the marked block in ' + entry + '.'), String(bres.err?.message));
    });
    (0, node_test_1.test)('type-error-fails', async () => {
        const bres = await run(stage(HEAD + 'guide: entity: moon: active: "no"\n'));
        node_assert_1.default.strictEqual(bres.ok, false);
        node_assert_1.default.match(String(bres.err?.message), /^SUMMARY \(1 errors\): /);
        node_assert_1.default.match(String(bres.err?.message), /no_scalar_unify/);
        const [aerr] = bres.err.errs();
        node_assert_1.default.strictEqual(aerr.aontu, true);
        node_assert_1.default.deepStrictEqual(aerr.errs().map((e) => e.why), ['no_scalar_unify']);
    });
    for (const [name, line, why, text] of [
        ['incomplete-value-fails', 'extra: string', 'mapval_no_gen', 'mapval_no_gen'],
        ['syntax-error-fails', '}}}', 'syntax', 'unexpected character'],
        ['missing-include-fails', '@"./nope.aontu"', 'multisource_not_found', 'source not found: ./nope.aontu'],
    ]) {
        (0, node_test_1.test)(name, async () => {
            const logged = [];
            const log = {
                child: () => log, info() { }, debug() { }, warn() { }, trace() { }, fatal() { },
                error: (e) => logged.push(e),
            };
            const bres = await run(stage(HEAD + line + '\n'), log);
            node_assert_1.default.strictEqual(bres.ok, false);
            node_assert_1.default.ok(String(bres.err?.message).startsWith('SUMMARY (1 errors): '), bres.err?.message);
            node_assert_1.default.ok(String(bres.err?.message).includes(text), bres.err?.message);
            node_assert_1.default.deepStrictEqual(bres.err.errs()[0].errs().map((e) => e.why), [why]);
            node_assert_1.default.ok(logged.includes(bres.err));
        });
    }
});
//# sourceMappingURL=guide-overlay.test.js.map