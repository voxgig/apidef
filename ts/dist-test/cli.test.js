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
const node_child_process_1 = require("node:child_process");
const Fs = __importStar(require("node:fs"));
const Os = __importStar(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const cli_1 = require("../dist/cli");
const Pkg = require('../package.json');
const SOLAR_PREFIX = 'solar-1.0.0-openapi-3.0.0-';
const SOLAR_DEF = SOLAR_PREFIX + 'def.yaml';
const FIXTURES = node_path_1.default.join(__dirname, '..', 'test');
const PKG_MODEL = node_path_1.default.join(__dirname, '..', 'model');
// A throwaway project in the documented layout: <root>/def holds the
// definition, <root>/model the guide entry file and the generated output.
// The package model is copied under <root>/node_modules so the guide's
// package include resolves outside the repository.
function makeProject() {
    const root = Fs.mkdtempSync(node_path_1.default.join(Os.tmpdir(), 'apidef-cli-'));
    Fs.mkdirSync(node_path_1.default.join(root, 'def'));
    Fs.copyFileSync(node_path_1.default.join(FIXTURES, 'def', SOLAR_DEF), node_path_1.default.join(root, 'def', SOLAR_DEF));
    Fs.mkdirSync(node_path_1.default.join(root, 'model', 'guide'), { recursive: true });
    Fs.copyFileSync(node_path_1.default.join(FIXTURES, 'solar', 'guide', SOLAR_PREFIX + 'guide.aon'), node_path_1.default.join(root, 'model', 'guide', SOLAR_PREFIX + 'guide.aon'));
    const pkgmodel = node_path_1.default.join(root, 'node_modules', '@voxgig', 'apidef', 'model');
    Fs.mkdirSync(pkgmodel, { recursive: true });
    for (const file of Fs.readdirSync(PKG_MODEL)) {
        Fs.copyFileSync(node_path_1.default.join(PKG_MODEL, file), node_path_1.default.join(pkgmodel, file));
    }
    return root;
}
function captureIO() {
    const out = [];
    const err = [];
    return {
        out,
        err,
        io: {
            log: (...args) => out.push(args.join(' ')),
            error: (...args) => err.push(args.join(' ')),
        }
    };
}
(0, node_test_1.describe)('cli', () => {
    (0, node_test_1.test)('resolve-options', () => {
        const defaults = (0, cli_1.resolveOptions)(['petstore']);
        node_assert_1.default.equal(defaults.name, 'petstore');
        node_assert_1.default.equal(defaults.folder, 'petstore');
        node_assert_1.default.equal(defaults.def, '');
        node_assert_1.default.equal(defaults.prefix, undefined);
        node_assert_1.default.equal(defaults.watch, false);
        node_assert_1.default.equal(defaults.debug, undefined);
        const given = (0, cli_1.resolveOptions)([
            'petstore', '-f', 'proj', '-d', 'spec.yml', '-p', 'ps-', '-w', '-g', 'warn'
        ]);
        node_assert_1.default.equal(given.folder, 'proj');
        node_assert_1.default.equal(given.def, 'spec.yml');
        node_assert_1.default.equal(given.prefix, 'ps-');
        node_assert_1.default.equal(given.watch, true);
        node_assert_1.default.equal(given.debug, 'warn');
        node_assert_1.default.equal((0, cli_1.resolveOptions)(['-v']).version, true);
        node_assert_1.default.equal((0, cli_1.resolveOptions)(['-h']).help, true);
    });
    // The layout the CLI resolves, pinned: the model folder is <root>/model,
    // the guide entry file is <root>/model/guide/<prefix>guide.aon, and the
    // definition is named so that the pipeline's <base>/../def/<def> rule
    // finds it wherever it is.
    (0, node_test_1.test)('resolve-project', () => {
        const root = node_path_1.default.resolve('proj');
        const def = node_path_1.default.join(root, 'def', 'petstore.yml');
        const project = (0, cli_1.resolveProject)({
            name: 'petstore', folder: 'proj', def,
            watch: false, debug: 'info', help: false, version: false,
        });
        node_assert_1.default.equal(project.root, root);
        node_assert_1.default.equal(project.folder, node_path_1.default.join(root, 'model'));
        node_assert_1.default.equal(project.outprefix, 'petstore-');
        node_assert_1.default.equal(project.def, def);
        node_assert_1.default.deepEqual(project.model, { name: 'petstore', def: 'petstore.yml' });
        node_assert_1.default.equal(project.guide, node_path_1.default.join(root, 'model', 'guide', 'petstore-guide.aon'));
        node_assert_1.default.equal(project.legacyguide, node_path_1.default.join(root, 'model', 'guide', 'petstore-guide.aontu'));
        node_assert_1.default.equal(node_path_1.default.join(project.folder, '..', 'def', project.model.def), def);
        const elsewhere = node_path_1.default.join(node_path_1.default.dirname(root), 'specs', 'v2', 'petstore.json');
        const away = (0, cli_1.resolveProject)({
            name: 'petstore', folder: 'proj', def: elsewhere, prefix: '',
            watch: false, debug: 'info', help: false, version: false,
        });
        node_assert_1.default.equal(away.outprefix, '');
        node_assert_1.default.equal(away.guide, node_path_1.default.join(root, 'model', 'guide', 'guide.aon'));
        node_assert_1.default.equal(node_path_1.default.join(away.folder, '..', 'def', away.model.def), elsewhere);
    });
    // The definition name the pipeline joins onto <root>/def: relative on the
    // same drive wherever the file is, refused on another drive.
    (0, node_test_1.test)('def-name', () => {
        const W = node_path_1.default.win32;
        node_assert_1.default.equal((0, cli_1.defName)('C:\\work\\proj\\def', 'C:\\work\\proj\\def\\petstore.yml', W), 'petstore.yml');
        node_assert_1.default.equal((0, cli_1.defName)('C:\\work\\proj\\def', 'C:\\specs\\v2\\petstore.json', W), '..\\..\\..\\specs\\v2\\petstore.json');
        node_assert_1.default.throws(() => (0, cli_1.defName)('C:\\work\\proj\\def', 'D:\\specs\\petstore.yml', W), /same drive/);
        const P = node_path_1.default.posix;
        node_assert_1.default.equal((0, cli_1.defName)('/work/proj/def', '/work/proj/def/petstore.yml', P), 'petstore.yml');
        node_assert_1.default.equal((0, cli_1.defName)('/work/proj/def', '/specs/v2/petstore.json', P), '../../../specs/v2/petstore.json');
    });
    (0, node_test_1.test)('check-project', () => {
        const root = makeProject();
        const options = {
            name: 'solar', folder: root, prefix: SOLAR_PREFIX,
            def: node_path_1.default.join(root, 'def', SOLAR_DEF),
            watch: false, debug: 'warn', help: false, version: false,
        };
        (0, cli_1.checkProject)((0, cli_1.resolveProject)(options));
        const missing = (0, cli_1.resolveProject)({ ...options, prefix: 'other-' });
        node_assert_1.default.throws(() => (0, cli_1.checkProject)(missing), (err) => {
            node_assert_1.default.ok(err.message.includes(node_path_1.default.join(root, 'model', 'guide', 'other-guide.aon')), err.message);
            node_assert_1.default.ok(err.message.includes('@"./other-base-guide.aon"'), err.message);
            return true;
        });
    });
    (0, node_test_1.test)('version-help', async () => {
        const version = captureIO();
        node_assert_1.default.equal(await (0, cli_1.runCli)(['-v'], version.io), 0);
        node_assert_1.default.deepEqual(version.out, [Pkg.version]);
        const help = captureIO();
        node_assert_1.default.equal(await (0, cli_1.runCli)(['-h'], help.io), 0);
        node_assert_1.default.ok(help.out[0].startsWith('Usage: voxgig-apidef <name>'));
        node_assert_1.default.ok(help.out[0].includes('guide.aon'));
    });
    // The shims `bin/voxgig-apidef` and `cmd/bun/entry.js` are the only way a
    // user reaches the CLI, and runCli does not go through them: a wrong
    // require path or a missing export shows up nowhere else. Run them.
    (0, node_test_1.test)('entry-points', (t) => {
        const bin = node_path_1.default.join(__dirname, '..', 'bin', 'voxgig-apidef');
        const node = (0, node_child_process_1.spawnSync)(process.execPath, [bin, '-v'], { encoding: 'utf8' });
        node_assert_1.default.equal(node.status, 0, node.stderr);
        node_assert_1.default.equal(node.stdout.trim(), Pkg.version);
        // Bun is not installed everywhere. Where it is, its entry point runs the
        // same CLI. Deno's cannot be run here at all; see cmd/RESULTS.md.
        if (0 !== (0, node_child_process_1.spawnSync)('bun', ['--version'], { encoding: 'utf8' }).status) {
            t.diagnostic('bun not found: cmd/bun/entry.js not run');
            return;
        }
        const entry = node_path_1.default.join(__dirname, '..', 'cmd', 'bun', 'entry.js');
        const bun = (0, node_child_process_1.spawnSync)('bun', [entry, '-v'], { encoding: 'utf8' });
        node_assert_1.default.equal(bun.status, 0, bun.stderr);
        node_assert_1.default.equal(bun.stdout.trim(), Pkg.version);
    });
    (0, node_test_1.test)('bad-options', async () => {
        const noname = captureIO();
        node_assert_1.default.equal(await (0, cli_1.runCli)([], noname.io), 1);
        node_assert_1.default.ok(noname.err.join('\n').includes('project name'), noname.err.join('\n'));
        const nodef = captureIO();
        node_assert_1.default.equal(await (0, cli_1.runCli)(['solar'], nodef.io), 1);
        node_assert_1.default.ok(nodef.err.join('\n').includes('--def'), nodef.err.join('\n'));
        const nofile = captureIO();
        node_assert_1.default.equal(await (0, cli_1.runCli)(['solar', '-d', 'no-such-def.yml'], nofile.io), 1);
        node_assert_1.default.ok(nofile.err.join('\n').includes('Definition file not found'));
        const root = makeProject();
        const noguide = captureIO();
        node_assert_1.default.equal(await (0, cli_1.runCli)([
            'solar', '-f', root, '-d', node_path_1.default.join(root, 'def', SOLAR_DEF), '-g', 'warn',
        ], noguide.io), 1);
        node_assert_1.default.ok(noguide.err.join('\n').includes(node_path_1.default.join(root, 'model', 'guide', 'solar-guide.aon')), noguide.err.join('\n'));
    });
    (0, node_test_1.test)('run-solar', async () => {
        const root = makeProject();
        const { io, out } = captureIO();
        const code = await (0, cli_1.runCli)([
            'solar',
            '--folder', root,
            '--def', node_path_1.default.join(root, 'def', SOLAR_DEF),
            '--prefix', SOLAR_PREFIX,
            '--debug', 'warn',
        ], io);
        node_assert_1.default.equal(code, 0, out.join('\n'));
        node_assert_1.default.ok(out[0].startsWith('voxgig-apidef: ok'), out.join('\n'));
        node_assert_1.default.ok(out[0].includes('entities: moon planet'), out.join('\n'));
        const model = node_path_1.default.join(root, 'model');
        for (const file of [
            'guide/' + SOLAR_PREFIX + 'guide.aon',
            'guide/' + SOLAR_PREFIX + 'base-guide.aon',
            'api/' + SOLAR_PREFIX + 'api-info.aon',
            'entity/' + SOLAR_PREFIX + 'entity-index.aon',
            'entity/' + SOLAR_PREFIX + 'planet.aon',
            'entity/' + SOLAR_PREFIX + 'moon.aon',
            'flow/' + SOLAR_PREFIX + 'flow-index.aon',
        ]) {
            node_assert_1.default.ok(Fs.existsSync(node_path_1.default.join(model, file)), 'missing ' + file);
        }
        const written = Fs.readdirSync(model, { recursive: true });
        node_assert_1.default.deepEqual(written.filter((f) => f.endsWith('.aontu')), []);
        // An explicit --debug, at any level, also writes the resolved definition.
        node_assert_1.default.deepEqual(Fs.readdirSync(node_path_1.default.join(root, 'def')).sort(), [SOLAR_DEF, SOLAR_DEF + '.full.json']);
    });
    // Without --debug the library gets no debug option at all, so the
    // definition folder holds nothing but the definition afterwards.
    (0, node_test_1.test)('run-default', async () => {
        const root = makeProject();
        const { io, out } = captureIO();
        const code = await (0, cli_1.runCli)([
            'solar', '-f', root, '-d', node_path_1.default.join(root, 'def', SOLAR_DEF), '-p', SOLAR_PREFIX,
        ], io);
        node_assert_1.default.equal(code, 0, out.join('\n'));
        node_assert_1.default.deepEqual(Fs.readdirSync(node_path_1.default.join(root, 'def')), [SOLAR_DEF]);
        node_assert_1.default.ok(Fs.existsSync(node_path_1.default.join(root, 'model', 'entity', SOLAR_PREFIX + 'planet.aon')));
    });
    // A project created before the rename still carries <prefix>guide.aontu;
    // the CLI accepts it and the run leaves the migrated .aon in its place.
    (0, node_test_1.test)('run-legacy-guide', async () => {
        const root = makeProject();
        const guidefolder = node_path_1.default.join(root, 'model', 'guide');
        const guide = node_path_1.default.join(guidefolder, SOLAR_PREFIX + 'guide.aon');
        const legacy = node_path_1.default.join(guidefolder, SOLAR_PREFIX + 'guide.aontu');
        Fs.unlinkSync(guide);
        Fs.writeFileSync(legacy, [
            '@"@voxgig/apidef/model/guide.aontu"',
            '@"' + SOLAR_PREFIX + 'base-guide.aontu"',
            '',
        ].join('\n'));
        const { io, out } = captureIO();
        const code = await (0, cli_1.runCli)([
            'solar', '-f', root, '-d', node_path_1.default.join(root, 'def', SOLAR_DEF),
            '-p', SOLAR_PREFIX, '-g', 'warn',
        ], io);
        node_assert_1.default.equal(code, 0, out.join('\n'));
        node_assert_1.default.ok(Fs.existsSync(guide), 'guide.aon not written by the migration');
        node_assert_1.default.ok(!Fs.existsSync(legacy), 'guide.aontu left behind');
        node_assert_1.default.ok(Fs.existsSync(node_path_1.default.join(root, 'model', 'entity', SOLAR_PREFIX + 'planet.aon')));
    });
    // The same, for a legacy guide whose sibling include carries the `./`.
    (0, node_test_1.test)('run-legacy-guide-dotslash', async () => {
        const root = makeProject();
        const guidefolder = node_path_1.default.join(root, 'model', 'guide');
        const guide = node_path_1.default.join(guidefolder, SOLAR_PREFIX + 'guide.aon');
        const legacy = node_path_1.default.join(guidefolder, SOLAR_PREFIX + 'guide.aontu');
        Fs.unlinkSync(guide);
        Fs.writeFileSync(legacy, [
            '@"@voxgig/apidef/model/guide.aontu"',
            '@"./' + SOLAR_PREFIX + 'base-guide.aontu"',
            '',
        ].join('\n'));
        const { io, out } = captureIO();
        const code = await (0, cli_1.runCli)([
            'solar', '-f', root, '-d', node_path_1.default.join(root, 'def', SOLAR_DEF),
            '-p', SOLAR_PREFIX, '-g', 'warn',
        ], io);
        node_assert_1.default.equal(code, 0, out.join('\n'));
        node_assert_1.default.ok(!Fs.existsSync(legacy), 'guide.aontu left behind');
        const migrated = Fs.readFileSync(guide, 'utf8');
        node_assert_1.default.ok(migrated.includes('@"./' + SOLAR_PREFIX + 'base-guide.aon"'), migrated);
        node_assert_1.default.ok(!migrated.includes('.aontu'), migrated);
        node_assert_1.default.ok(Fs.existsSync(node_path_1.default.join(root, 'model', 'entity', SOLAR_PREFIX + 'planet.aon')));
    });
});
//# sourceMappingURL=cli.test.js.map