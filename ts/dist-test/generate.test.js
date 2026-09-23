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
const pino_1 = __importDefault(require("pino"));
const apidef_1 = require("../dist/apidef");
// The Go port pins the same behaviour in go/generate_test.go.
const NOW = 1790000000000;
const PREFIX = 'solar-1.0.0-openapi-3.0.0-';
const DEF = PREFIX + 'def.yaml';
// In the order the builders emit them, which is the order of the meta log.
const FILES = [
    'entity/' + PREFIX + 'moon.aontu',
    'entity/' + PREFIX + 'planet.aontu',
    'entity/' + PREFIX + 'entity-index.aontu',
    'api/' + PREFIX + 'api-info.aontu',
    'flow/' + PREFIX + 'BasicMoonFlow.aontu',
    'flow/' + PREFIX + 'BasicPlanetFlow.aontu',
    'flow/' + PREFIX + 'flow-index.aontu',
];
const staged = [];
// Laid out as a consumer project, with the package installed beside the
// model, so the package include resolves from any working directory.
function stage(guide = 'guide: {}') {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-generate-'));
    staged.push(dir);
    const folder = Path.join(dir, 'model');
    Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true });
    Fs.mkdirSync(Path.join(dir, 'def'));
    Fs.copyFileSync(Path.join(__dirname, '..', 'test', 'def', DEF), Path.join(dir, 'def', DEF));
    const installed = Path.join(dir, 'node_modules', '@voxgig', 'apidef', 'model');
    Fs.mkdirSync(installed, { recursive: true });
    Fs.copyFileSync(Path.join(__dirname, '..', 'model', 'guide.aontu'), Path.join(installed, 'guide.aontu'));
    Fs.writeFileSync(Path.join(folder, 'guide', PREFIX + 'guide.aontu'), [
        '@"@voxgig/apidef/model/guide.aontu"',
        '@"./' + PREFIX + 'base-guide.aontu"',
        '',
        guide,
        '',
    ].join('\n'));
    return folder;
}
async function generate(folder, def = DEF) {
    const apidef = (0, apidef_1.ApiDef)({ folder, outprefix: PREFIX, pino: (0, pino_1.default)({ level: 'silent' }) });
    return apidef.generate({
        model: { name: 'solar', def },
        build: { spec: { base: folder } },
        now: () => NOW,
    });
}
// apidef-warnings.txt is written to the working directory, so each run that
// reads it works from the project's own.
async function inProject(folder, run) {
    const cwd = process.cwd();
    process.chdir(Path.dirname(folder));
    try {
        return await run();
    }
    finally {
        process.chdir(cwd);
    }
}
function warnings(folder) {
    const file = Path.join(Path.dirname(folder), 'apidef-warnings.txt');
    return Fs.existsSync(file) ? Fs.readFileSync(file, 'utf8') : undefined;
}
function rel(folder, files) {
    return files.map((file) => Path.relative(folder, file).split(Path.sep).join('/')).sort();
}
function read(folder, file) {
    return Fs.readFileSync(Path.join(folder, file), 'utf8');
}
function meta(folder) {
    return JSON.parse(read(folder, '.jostraca/jostraca.meta.log'));
}
(0, node_test_1.describe)('generate', () => {
    (0, node_test_1.after)(() => {
        for (const dir of staged) {
            Fs.rmSync(dir, { recursive: true, force: true });
        }
    });
    (0, node_test_1.test)('first-run-writes-model-and-bookkeeping', async () => {
        const folder = stage();
        const res = await inProject(folder, () => generate(folder));
        node_assert_1.default.strictEqual(res.ok, true, String(res.err?.message));
        node_assert_1.default.strictEqual(res.reload, true);
        node_assert_1.default.deepStrictEqual(rel(folder, res.jres.files.written), [...FILES].sort());
        node_assert_1.default.deepStrictEqual(res.jres.files.unchanged, []);
        const log = meta(folder);
        node_assert_1.default.strictEqual(log.last, NOW);
        node_assert_1.default.deepStrictEqual(Object.keys(log.files), FILES);
        for (const file of FILES) {
            const entry = log.files[file];
            node_assert_1.default.deepStrictEqual([entry.action, entry.exists, entry.actions, entry.when], ['write', false, ['write'], NOW], file);
            node_assert_1.default.strictEqual(read(folder, '.jostraca/generated/' + file), read(folder, file), file);
        }
        node_assert_1.default.strictEqual(read(folder, '.jostraca/.gitignore'), '\njostraca.meta.log\ngenerated\n');
        node_assert_1.default.ok(read(folder, FILES[2]).includes('@"./' + PREFIX + 'moon.aontu"'));
        node_assert_1.default.strictEqual(read(folder, FILES[6]), [
            '# Flows\n',
            '@"./' + PREFIX + 'BasicMoonFlow.aontu"',
            '@"./' + PREFIX + 'BasicPlanetFlow.aontu"',
        ].join('\n'));
        node_assert_1.default.strictEqual(res.apimodel.main.kit.entity.moon.key$, 'moon');
        node_assert_1.default.strictEqual(warnings(folder), undefined);
    });
    (0, node_test_1.test)('rerun-over-own-output-changes-nothing', async () => {
        const folder = stage();
        await generate(folder);
        const before = FILES.map((file) => read(folder, file));
        const res = await generate(folder);
        node_assert_1.default.strictEqual(res.ok, true, String(res.err?.message));
        node_assert_1.default.strictEqual(res.reload, false);
        node_assert_1.default.deepStrictEqual(res.jres.files.written, []);
        node_assert_1.default.deepStrictEqual(rel(folder, res.jres.files.unchanged), [...FILES].sort());
        node_assert_1.default.deepStrictEqual(FILES.map((file) => read(folder, file)), before);
        const log = meta(folder);
        node_assert_1.default.deepStrictEqual(Object.keys(log.files), FILES);
        for (const file of FILES) {
            node_assert_1.default.strictEqual(log.files[file].exists, true, file);
        }
    });
    (0, node_test_1.test)('rerun-overwrites-hand-edit-and-collects-orphan', async () => {
        const folder = stage();
        await generate(folder);
        const moon = FILES[0];
        const generated = read(folder, moon);
        Fs.appendFileSync(Path.join(folder, moon), '\n# hand edit\n');
        const orphan = 'entity/' + PREFIX + 'comet.aontu';
        Fs.writeFileSync(Path.join(folder, orphan), '# Entity: comet\n');
        const res = await generate(folder);
        node_assert_1.default.strictEqual(res.ok, true, String(res.err?.message));
        node_assert_1.default.strictEqual(res.reload, true);
        node_assert_1.default.deepStrictEqual(rel(folder, res.jres.files.written), [moon]);
        node_assert_1.default.strictEqual(read(folder, moon), generated);
        node_assert_1.default.strictEqual(Fs.existsSync(Path.join(folder, orphan)), false);
    });
    (0, node_test_1.test)('warnings-file-is-written-on-success', async () => {
        const folder = stage('guide: entity: planet: path: "/api/planet": op: frob: method: "POST"');
        const res = await inProject(folder, () => generate(folder));
        node_assert_1.default.strictEqual(res.ok, true, String(res.err?.message));
        const text = warnings(folder);
        node_assert_1.default.ok(text?.includes('on entity=planet path=/api/planet is dropped'), text);
        node_assert_1.default.ok(!text?.includes('!! BUILD FAILED !!'), text);
    });
    (0, node_test_1.test)('write-failure-fails-build-and-writes-warnings', async () => {
        const folder = stage();
        Fs.writeFileSync(Path.join(folder, 'entity'), 'a file where the entity folder goes\n');
        const res = await inProject(folder, () => generate(folder));
        node_assert_1.default.strictEqual(res.ok, false);
        node_assert_1.default.ok(res.err);
        node_assert_1.default.deepStrictEqual(res.steps, ['parse', 'guide', 'transformers', 'builders']);
        node_assert_1.default.ok(warnings(folder)?.includes('!! BUILD FAILED !!'), warnings(folder));
    });
    (0, node_test_1.test)('pre-generate-failure-writes-warnings', async () => {
        const folder = stage();
        const res = await inProject(folder, () => generate(folder, 'missing-def.yaml'));
        node_assert_1.default.strictEqual(res.ok, false);
        node_assert_1.default.ok(res.err);
        node_assert_1.default.deepStrictEqual(res.steps, []);
        node_assert_1.default.ok(warnings(folder)?.includes('!! BUILD FAILED !!'), warnings(folder));
    });
    (0, node_test_1.test)('parse-failure-writes-warnings', async () => {
        const folder = stage();
        Fs.writeFileSync(Path.join(Path.dirname(folder), 'def', 'bad.yaml'), 'a: [\n  b: }\n');
        const res = await inProject(folder, () => generate(folder, 'bad.yaml'));
        node_assert_1.default.strictEqual(res.ok, false);
        node_assert_1.default.deepStrictEqual(res.steps, []);
        node_assert_1.default.ok(warnings(folder)?.includes('!! BUILD FAILED !!'), warnings(folder));
    });
    (0, node_test_1.test)('guide-failure-writes-warnings', async () => {
        const folder = stage('@"./nope.aontu"');
        const res = await inProject(folder, () => generate(folder));
        node_assert_1.default.strictEqual(res.ok, false);
        node_assert_1.default.deepStrictEqual(res.steps, ['parse']);
        node_assert_1.default.ok(warnings(folder)?.includes('!! BUILD FAILED !!'), warnings(folder));
    });
});
//# sourceMappingURL=generate.test.js.map