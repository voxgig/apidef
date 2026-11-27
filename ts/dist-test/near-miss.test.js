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
const utility_1 = require("../dist/utility");
const DEF = 'collection-owner-def.json';
const SILENT = (0, util_1.Pino)({ level: 'silent' });
async function buildIn(dir, why) {
    const folder = Path.join(dir, 'model');
    Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true });
    Fs.mkdirSync(Path.join(dir, 'def'));
    Fs.copyFileSync(Path.join(__dirname, '..', 'test', 'def', DEF), Path.join(dir, 'def', DEF));
    Fs.writeFileSync(Path.join(folder, 'guide', 'guide.aontu'), '@"@voxgig/apidef/model/guide.aontu"\n@"./base-guide.aontu"\n');
    const build = await apidef_1.ApiDef.makeBuild({ folder, strategy: 'heuristic01', why });
    const cwd = process.cwd();
    process.chdir(dir);
    try {
        return await build({ name: 'near-miss', def: DEF }, {
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
    }
    finally {
        process.chdir(cwd);
    }
}
(0, node_test_1.describe)('near-miss', () => {
    (0, node_test_1.test)('report-written-with-why', async () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-near-miss-'));
        try {
            const bres = await buildIn(dir, { show: true });
            node_assert_1.default.ok(bres.ok, String(bres.err?.message));
            const text = Fs.readFileSync(Path.join(dir, 'apidef-near-misses.txt'), 'utf8');
            node_assert_1.default.strictEqual(text, (0, utility_1.nearMissText)(bres.ctx.nearmiss));
            node_assert_1.default.ok(text.split('\n').includes('-2\tGET /teams\tmember\tteam (path, response)'), text);
        }
        finally {
            Fs.rmSync(dir, { recursive: true, force: true });
        }
    });
    (0, node_test_1.test)('report-kept-in-memory-without-why', async () => {
        const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-near-miss-'));
        try {
            const bres = await buildIn(dir, undefined);
            node_assert_1.default.ok(bres.ok, String(bres.err?.message));
            node_assert_1.default.strictEqual(Fs.existsSync(Path.join(dir, 'apidef-near-misses.txt')), false);
            node_assert_1.default.deepStrictEqual(bres.ctx.nearmiss[0], {
                route: 'GET /teams',
                entity: 'member',
                margin: -2,
                support: [],
                alternatives: [{ name: 'team', sources: ['path', 'response'] }],
            });
        }
        finally {
            Fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
//# sourceMappingURL=near-miss.test.js.map