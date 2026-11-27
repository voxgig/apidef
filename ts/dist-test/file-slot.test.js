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
const DEF = 'file-slot-def.json';
const HEAD = [
    '@"@voxgig/apidef/model/guide.aontu"',
    '@"./base-guide.aontu"',
    '',
].join('\n');
const staged = [];
async function build(entry) {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-file-slot-'));
    staged.push(dir);
    const folder = Path.join(dir, 'model');
    Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true });
    Fs.mkdirSync(Path.join(dir, 'def'));
    Fs.copyFileSync(Path.join(__dirname, '..', 'test', 'def', DEF), Path.join(dir, 'def', DEF));
    Fs.writeFileSync(Path.join(folder, 'guide', 'guide.aontu'), HEAD + entry);
    const run = await apidef_1.ApiDef.makeBuild({ folder });
    const bres = await run({ name: 'file-slot', def: DEF }, {
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
    node_assert_1.default.strictEqual(bres.ok, true, String(bres.err?.message));
    return { bres, base: Fs.readFileSync(Path.join(folder, 'guide', 'base-guide.aontu'), 'utf8') };
}
function point(bres, entity, method, path) {
    return Object.values(bres.apimodel.main.kit.entity[entity].op)
        .flatMap((op) => op.points)
        .find((p) => method === p.m && path === p.o);
}
function headers(p) {
    return Object.fromEntries((p.g.header ?? []).map((arg) => [arg.n, false !== arg.a]));
}
(0, node_test_1.describe)('file-slot', () => {
    (0, node_test_1.after)(() => {
        for (const dir of staged) {
            Fs.rmSync(dir, { recursive: true, force: true });
        }
    });
    (0, node_test_1.test)('binary-points', async () => {
        const { bres, base } = await build('guide: {}\n');
        const audio = '/tracks/{track_id}/audio';
        node_assert_1.default.deepStrictEqual(point(bres, 'track', 'GET', audio).bn, { field: 'audio', head: true, max: 4194304 });
        node_assert_1.default.deepStrictEqual(point(bres, 'track', 'PUT', audio).bn, { field: 'audio', max: 4194304 });
        node_assert_1.default.strictEqual(point(bres, 'track', 'GET', '/tracks/{track_id}/cover').bn, undefined);
        node_assert_1.default.strictEqual(point(bres, 'track_lyric', 'GET', '/tracks/{track_id}/lyrics').bn, undefined);
        node_assert_1.default.strictEqual(point(bres, 'upload', 'PATCH', '/uploads/{upload_id}').bn, undefined);
        node_assert_1.default.ok(Object.values(bres.apimodel.main.kit.entity.track.op)
            .flatMap((op) => op.points).every((p) => 'HEAD' !== p.m));
        node_assert_1.default.match(base, /\n +action: "audio": binary: field: \*"audio"\|top\n/);
        node_assert_1.default.match(base, /\n +action: "audio": binary: head: \*true\n/);
        node_assert_1.default.match(base, /\n +action: "audio": binary: max: \*4194304\|top\n/);
        node_assert_1.default.match(base, /\n +action: "cover": binary: active: \*false\n/);
    });
    (0, node_test_1.test)('binary-guide', async () => {
        const audio = '/tracks/{track_id}/audio';
        const entry = (facts) => 'guide: entity: track: path: "' + audio + '": action: "audio": binary: ' + facts + '\n';
        const refused = (await build(entry('{ field: false, head: false, max: false }'))).bres;
        node_assert_1.default.strictEqual(point(refused, 'track', 'GET', audio).bn, undefined);
        const set = (await build(entry('{ field: "meta", max: 10 }'))).bres;
        node_assert_1.default.deepStrictEqual(point(set, 'track', 'GET', audio).bn, { field: 'meta', head: true, max: 10 });
        const off = (await build(entry('active: false'))).bres;
        node_assert_1.default.strictEqual(point(off, 'track', 'PUT', audio).bn, undefined);
    });
    (0, node_test_1.test)('sessions', async () => {
        const { bres, base } = await build('guide: {}\n');
        const kit = bres.apimodel.main.kit;
        node_assert_1.default.deepStrictEqual(kit.entity.upload.session, { dialect: 'tus', append: 'update', offset: 'load' });
        const append = point(bres, 'upload', 'PATCH', '/uploads/{upload_id}');
        node_assert_1.default.deepStrictEqual(append.q.exist, ['id']);
        node_assert_1.default.deepStrictEqual(headers(append), { tus_resumable: false, upload_checksum: false, upload_offset: false, x_trace: true });
        node_assert_1.default.deepStrictEqual(kit.entity.draft.session, { dialect: 'ietf', append: 'update', offset: 'load' });
        const draft = point(bres, 'draft', 'PATCH', '/drafts/{draft_id}');
        node_assert_1.default.deepStrictEqual(draft.q.exist, ['id']);
        node_assert_1.default.deepStrictEqual(headers(draft), { upload_complete: false, upload_offset: false });
        node_assert_1.default.strictEqual(kit.entity.part.session, undefined);
        node_assert_1.default.deepStrictEqual(point(bres, 'part', 'PATCH', '/parts/{part_id}').q.exist, ['id', 'tus_resumable']);
        node_assert_1.default.strictEqual(kit.entity.track.session, undefined);
        node_assert_1.default.match(base, /\n  entity: upload: \{\n(.*\n)*? +session: dialect: \*"tus"\n/);
        node_assert_1.default.match(base, /\n  entity: part: \{\n(.*\n)*? +session: active: \*false\n/);
    });
    (0, node_test_1.test)('session-guide', async () => {
        const off = (await build('guide: entity: upload: session: active: false\n')).bres;
        node_assert_1.default.strictEqual(off.apimodel.main.kit.entity.upload.session, undefined);
        node_assert_1.default.deepStrictEqual(point(off, 'upload', 'PATCH', '/uploads/{upload_id}').q.exist, ['id', 'tus_resumable', 'upload_offset']);
        const on = (await build('guide: entity: part: session: active: true\n')).bres;
        node_assert_1.default.deepStrictEqual(on.apimodel.main.kit.entity.part.session, { dialect: 'tus', append: 'update', offset: 'load' });
        node_assert_1.default.deepStrictEqual(point(on, 'part', 'PATCH', '/parts/{part_id}').q.exist, ['id']);
        const slot = (await build('guide: entity: upload: session: slot: { entity: "track", action: "audio" }\n')).bres;
        node_assert_1.default.deepStrictEqual(slot.apimodel.main.kit.entity.upload.session, { dialect: 'tus', append: 'update', offset: 'load', slot: { entity: 'track', action: 'audio' } });
    });
});
//# sourceMappingURL=file-slot.test.js.map