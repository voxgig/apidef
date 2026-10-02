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
// A point records its request body when the body is not JSON alone, and the
// media types its success response declares; the guide chooses either.
const Fs = __importStar(require("node:fs"));
const Os = __importStar(require("node:os"));
const Path = __importStar(require("node:path"));
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const apidef_1 = require("../dist/apidef");
const DEF = 'request-body-def.json';
// Alone, the heuristic chooses text/markdown, first in code point order, and JSON.
const GUIDE = 'guide: entity: render: path: "/renders": op: create: body: media: "text/plain"\n' +
    'guide: entity: avatar: path: "/avatars/{avatar_id}": op: load: response: media: "image/png"\n';
const JSON_BODY = { kind: 'json', media: 'application/json' };
(0, node_test_1.describe)('body', () => {
    let dir;
    let bres;
    (0, node_test_1.before)(async () => {
        dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-body-'));
        const folder = Path.join(dir, 'model');
        Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true });
        Fs.mkdirSync(Path.join(dir, 'def'));
        Fs.copyFileSync(Path.join(__dirname, '..', 'test', 'def', DEF), Path.join(dir, 'def', DEF));
        Fs.writeFileSync(Path.join(folder, 'guide', 'guide.aontu'), '@"@voxgig/apidef/model/guide.aontu"\n@"./base-guide.aontu"\n' + GUIDE);
        const build = await apidef_1.ApiDef.makeBuild({ folder });
        bres = await build({ name: 'request-body', def: DEF }, {
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
    });
    (0, node_test_1.after)(() => {
        Fs.rmSync(dir, { recursive: true, force: true });
    });
    const bodies = (entity, op, key = 'rb') => bres.apimodel.main.kit.entity[entity].op[op].points
        .map((point) => [point.o, point[key] ?? null]);
    (0, node_test_1.test)('a JSON body and a read record nothing', () => {
        node_assert_1.default.ok(bres.ok, 'build failed: ' + bres.err?.message);
        node_assert_1.default.deepStrictEqual(bodies('note', 'create'), [['/notes', null]]);
        for (const entity of ['avatar', 'note', 'render', 'subscription', 'upload']) {
            node_assert_1.default.deepStrictEqual(bodies(entity, 'load').map(([, rb]) => rb), [null]);
        }
    });
    (0, node_test_1.test)('a raw, multipart or form body records its media type', () => {
        node_assert_1.default.deepStrictEqual(bodies('upload', 'create'), [['/uploads', {
                    kind: 'raw', media: 'application/octet-stream', binary: true,
                }]]);
        node_assert_1.default.deepStrictEqual(bodies('avatar', 'create'), [['/avatars', {
                    kind: 'multipart', media: 'multipart/form-data', fields: [
                        { name: 'caption' },
                        { name: 'image', binary: true, media: 'image/png' },
                    ],
                }]]);
        node_assert_1.default.deepStrictEqual(bodies('subscription', 'create'), [['/subscriptions', {
                    kind: 'form', media: 'application/x-www-form-urlencoded', fields: [
                        { name: 'email' },
                        { name: 'topics', list: true },
                    ],
                }]]);
    });
    (0, node_test_1.test)('a success response records its media types, and a bodiless one none', () => {
        for (const entity of ['note', 'render', 'subscription', 'upload']) {
            for (const op of ['create', 'load']) {
                node_assert_1.default.deepStrictEqual(bodies(entity, op, 'rs').map(([, rs]) => rs), [JSON_BODY]);
            }
        }
        node_assert_1.default.deepStrictEqual(bodies('avatar', 'create', 'rs'), [['/avatars', JSON_BODY]]);
        node_assert_1.default.deepStrictEqual(bodies('note', 'remove', 'rs'), [['/notes/{note_id}', null]]);
    });
    (0, node_test_1.test)('the guide chooses the media types a body is sent and answered in', () => {
        node_assert_1.default.deepStrictEqual(bodies('render', 'create'), [['/renders', {
                    kind: 'raw', media: 'text/plain',
                    alternatives: [{ kind: 'raw', media: 'text/markdown' }],
                }]]);
        node_assert_1.default.deepStrictEqual(bodies('avatar', 'load', 'rs'), [['/avatars/{avatar_id}', {
                    kind: 'raw', media: 'image/png', binary: true,
                    alternatives: [JSON_BODY],
                }]]);
    });
});
//# sourceMappingURL=body.test.js.map