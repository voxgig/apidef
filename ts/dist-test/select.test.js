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
// A REST point is selected by its path parameters and required arguments;
// points of one operation that share a selector are a warning.
const Fs = __importStar(require("node:fs"));
const Os = __importStar(require("node:os"));
const Path = __importStar(require("node:path"));
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const apidef_1 = require("../dist/apidef");
const DEF = 'rest-select-def.json';
(0, node_test_1.describe)('select', () => {
    let dir;
    let bres;
    (0, node_test_1.before)(async () => {
        dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-select-'));
        const folder = Path.join(dir, 'model');
        Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true });
        Fs.mkdirSync(Path.join(dir, 'def'));
        Fs.copyFileSync(Path.join(__dirname, '..', 'test', 'def', DEF), Path.join(dir, 'def', DEF));
        Fs.writeFileSync(Path.join(folder, 'guide', 'guide.aontu'), '@"@voxgig/apidef/model/guide.aontu"\n@"./base-guide.aontu"\n');
        const build = await apidef_1.ApiDef.makeBuild({ folder });
        bres = await build({ name: 'rest-select', def: DEF }, {
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
    const selectors = (entity, op) => bres.apimodel.main.kit.entity[entity].op[op].points
        .map((point) => [point.o, point.q?.exist ?? []]);
    (0, node_test_1.test)('an optional argument never selects a route', () => {
        node_assert_1.default.ok(bres.ok, 'build failed: ' + bres.err?.message);
        node_assert_1.default.deepStrictEqual(selectors('permission', 'remove'), [
            ['/public/database/{id}/permission/{msisdn}', ['database_id', 'id']],
            ['/public/database/{id}/permission/permanent/{msisdn}', ['database_id', 'msisdn']],
        ]);
        node_assert_1.default.deepStrictEqual(selectors('permission', 'list'), [
            ['/public/database/{id}/permission', ['database_id']],
        ]);
    });
    (0, node_test_1.test)('points of one operation sharing a selector are a warning', () => {
        const shared = bres.ctx.warn.history
            .filter((warning) => /same selector/.test(warning.note))
            .map((warning) => [warning.entity, warning.op, warning.points]);
        node_assert_1.default.deepStrictEqual(shared, [
            ['disable', 'update', ['PUT /entity-templates/disable', 'PUT /iterations/disable']],
        ]);
    });
});
//# sourceMappingURL=select.test.js.map