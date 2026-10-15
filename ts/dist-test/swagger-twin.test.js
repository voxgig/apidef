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
// The same operations written as Swagger 2 and as OpenAPI 3 build the same
// model: a body or formData parameter is the request body, never an argument.
// go/swagger_twin_test.go builds both and checks them against the same
// expectation and the base guides this writes.
(0, node_test_1.describe)('swagger-twin', () => {
    (0, node_test_1.test)('a Swagger 2 body builds the model its OpenAPI 3 twin does', async () => {
        const folder = __dirname + '/../test/swagger-twin';
        const kit = async (kind) => {
            const build = await apidef_1.ApiDef.makeBuild({ folder, outprefix: kind + '-' });
            const bres = await build({ name: 'twin', def: 'swagger-twin-' + kind + '-def.json' }, {
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
            node_assert_1.default.ok(bres.ok, kind + ' build failed: ' + bres.err?.message);
            return bres.apimodel.main.kit;
        };
        const swagger = await kit('swagger');
        const openapi = await kit('openapi');
        // A point's contract names the format it was read from, and nothing else differs.
        const unsourced = (entities) => JSON.parse(JSON.stringify(entities, (key, val) => 'source' === key ? undefined : val));
        node_assert_1.default.deepStrictEqual(unsourced(swagger.entity), unsourced(openapi.entity));
        node_assert_1.default.deepStrictEqual(swagger.flow, openapi.flow);
        // Each base guide's header names its own entry file.
        const guide = (kind) => {
            const src = Fs.readFileSync(folder + '/guide/' + kind + '-base-guide.aontu', 'utf8');
            return src.slice(src.indexOf('\nguide:'));
        };
        node_assert_1.default.strictEqual(guide('swagger'), guide('openapi'));
        const expected = JSON.parse(Fs.readFileSync(folder + '/expected.json', 'utf8'));
        const entities = swagger.entity;
        const names = Object.keys(entities).sort();
        const points = names.flatMap((ename) => Object.keys(entities[ename].op).sort().flatMap((opname) => entities[ename].op[opname].points.map((pt) => ename + '.' + opname + ' ' + pt.m + ' ' + pt.o +
            ' args=' + Object.keys(pt.g ?? {}).sort().flatMap((kind) => pt.g[kind])
            .map((arg) => arg.k + ':' + arg.n).join(',') +
            ' exist=' + (pt.q?.exist ?? []).join(',') +
            ' req=' + JSON.stringify(pt.t?.req) +
            ' rb=' + (pt.rb?.kind ?? '') +
            ' bf=' + JSON.stringify(pt.bf ?? null))));
        node_assert_1.default.deepStrictEqual(points, expected.points);
        const fields = Object.fromEntries(names.map((ename) => [ename, Object.fromEntries(Object.values(entities[ename].fields)
                .map((f) => [f.n, {
                    t: f.t, r: f.r,
                    ...(null == f.fo ? {} : { fo: f.fo }),
                    ...(0 === Object.keys(f.op ?? {}).length ? {} : { op: f.op }),
                }]))]));
        node_assert_1.default.deepStrictEqual(fields, expected.fields);
    });
});
//# sourceMappingURL=swagger-twin.test.js.map