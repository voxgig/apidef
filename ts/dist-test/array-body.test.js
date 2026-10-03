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
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const apidef_1 = require("../dist/apidef");
// go/array_body_test.go builds the same definition and checks it against the
// expectations and the base guide this writes.
(0, node_test_1.describe)('array-body', () => {
    (0, node_test_1.test)('an array request body is sent from one field', async () => {
        const folder = __dirname + '/../test/array-body';
        const build = await apidef_1.ApiDef.makeBuild({ folder });
        const bres = await build({ name: 'array-body', def: 'array-body-def.json' }, {
            spec: {
                base: folder,
                buildargs: {
                    apidef: {
                        ctrl: { step: {
                                parse: true, guide: true, transformers: true,
                                builders: false, generate: false,
                            } }
                    }
                }
            }
        }, {});
        node_assert_1.default.ok(bres.ok, 'build failed: ' + bres.err?.message);
        const expected = JSON.parse(Fs.readFileSync(folder + '/expected.json', 'utf8'));
        const entities = bres.apimodel.main.kit.entity;
        const names = Object.keys(entities).sort();
        const points = names.flatMap((ename) => Object.keys(entities[ename].op).sort().flatMap((opname) => entities[ename].op[opname].points.map((pt) => ename + '.' + opname + ' ' + pt.m + ' ' + pt.o +
            ' exist=' + (pt.q?.exist ?? []).join(',') +
            ' action=' + (pt.q?.$action ?? '') +
            ' req=' + JSON.stringify(pt.t?.req))));
        node_assert_1.default.deepStrictEqual(points, expected.points);
        const fields = Object.fromEntries(names.map((ename) => [ename, Object.fromEntries(Object.values(entities[ename].fields)
                .map((f) => [f.n, { t: f.t, r: f.r, ...(null == f.sh ? {} : { sh: f.sh }) }]))]));
        node_assert_1.default.deepStrictEqual(fields, expected.fields);
    });
});
//# sourceMappingURL=array-body.test.js.map