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
const PREFIX = 'solar-1.0.0-openapi-3.0.0-';
const DEF = PREFIX + 'def.yaml';
const HEAD = [
    '@"@voxgig/apidef/model/guide.aontu"',
    '@"./' + PREFIX + 'base-guide.aontu"',
    '',
].join('\n');
const staged = [];
function stage(entry) {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-overlay-'));
    staged.push(dir);
    const folder = Path.join(dir, 'model');
    Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true });
    Fs.mkdirSync(Path.join(dir, 'def'));
    Fs.copyFileSync(Path.join(__dirname, '..', 'test', 'def', DEF), Path.join(dir, 'def', DEF));
    if (null != entry) {
        Fs.writeFileSync(Path.join(folder, 'guide', PREFIX + 'guide.aontu'), entry);
    }
    return folder;
}
async function run(folder) {
    const build = await apidef_1.ApiDef.makeBuild({ folder, outprefix: PREFIX });
    return build({ name: 'solar', def: DEF }, {
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
    (0, node_test_1.test)('missing-entry-fails', async () => {
        const bres = await run(stage(null));
        node_assert_1.default.strictEqual(bres.ok, false);
        node_assert_1.default.match(String(bres.err?.message), /guide\.aontu/);
    });
    (0, node_test_1.test)('conflict-marker-fails', async () => {
        const bres = await run(stage(HEAD + [
            '<<<<<<< ours',
            'guide: entity: moon: active: false',
            '=======',
            '>>>>>>> theirs',
            '',
        ].join('\n')));
        node_assert_1.default.strictEqual(bres.ok, false);
        node_assert_1.default.match(String(bres.err?.message), /unresolved merge conflict/);
    });
    (0, node_test_1.test)('type-error-fails', async () => {
        const bres = await run(stage(HEAD + 'guide: entity: moon: active: "no"\n'));
        node_assert_1.default.strictEqual(bres.ok, false);
        node_assert_1.default.match(String(bres.err?.message), /no_scalar_unify/);
    });
});
//# sourceMappingURL=guide-overlay.test.js.map