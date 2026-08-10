"use strict";
/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */
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
// GraphQL BASELINE: the solar demo API, ingested from GraphQL.
//
// solar is the reference API across the Voxgig repos, and it now exists as a
// matched pair — solar-1.0.0-openapi-3.0.0-def.yaml and
// solar-1.0.0-graphql-def.graphql describe the SAME API in the two formats.
//
// That pairing is what this file tests. The claim GraphQL support rests on is
// "a GraphQL API yields the same SDK surface as its REST equivalent", and the
// correspondence test below turns that into something that fails when it
// stops being true — entity for entity, op for op, action for action.
//
// The purpose-built edge-case fixture lives in graphql.test.ts
// (graphql-linearish): deprecated fields, required-argument fields,
// edges-only connections, error-collection payloads. Baseline here, edges
// there.
const Path = __importStar(require("node:path"));
const Fs = __importStar(require("node:fs"));
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const aontu_1 = require("aontu");
const apidef_1 = require("../dist/apidef");
const GQL_PREFIX = 'solar-1.0.0-graphql-';
const GQL_FOLDER = Path.join(__dirname, '..', 'test', 'graphql-solar');
const ENDPOINT = 'https://api.solardemo.test/api/graphql';
const REST_PREFIX = 'solar-1.0.0-openapi-3.0.0-';
const REST_FOLDER = Path.join(__dirname, '..', 'test', 'solar');
function steps(over) {
    return {
        spec: {
            base: '',
            buildargs: {
                apidef: {
                    ctrl: {
                        step: {
                            parse: true, guide: true, transformers: true,
                            builders: true, generate: true, ...(over ?? {}),
                        },
                    },
                },
            },
        },
    };
}
// NOTE: no `kind` option. The format is sniffed from the .graphql extension
// through the documented makeBuild path, which is how a real consumer builds.
async function buildGraphql(over) {
    const build = await apidef_1.ApiDef.makeBuild({
        folder: GQL_FOLDER,
        outprefix: GQL_PREFIX,
        debug: 'debug',
        endpoint: ENDPOINT,
        auth: { scheme: 'apikey', prefix: '' },
    });
    const spec = steps(over);
    spec.spec.base = GQL_FOLDER;
    return await build({ name: 'solar', def: GQL_PREFIX + 'def.graphql' }, spec, {});
}
async function buildRest() {
    const build = await apidef_1.ApiDef.makeBuild({
        folder: REST_FOLDER,
        outprefix: REST_PREFIX,
        debug: 'debug',
    });
    const spec = steps({ generate: false });
    spec.spec.base = REST_FOLDER;
    return await build({ name: 'solar', def: REST_PREFIX + 'def.yaml' }, spec, {});
}
(0, node_test_1.describe)('graphql-solar', () => {
    // The whole domain arrives: both entities, all five ops on each.
    (0, node_test_1.test)('baseline-entities', async () => {
        const bres = await buildGraphql({ generate: false });
        node_assert_1.default.equal(bres.ok, true);
        const ents = bres.apimodel.main.kit.entity;
        node_assert_1.default.deepStrictEqual(Object.keys(ents).sort(), ['moon', 'planet']);
        for (const name of ['moon', 'planet']) {
            node_assert_1.default.deepStrictEqual(Object.keys(ents[name].op).sort(), ['create', 'list', 'load', 'remove', 'update'], name + ' ops');
        }
        node_assert_1.default.deepStrictEqual(ents.planet.fields.map((f) => f.name), ['diameter', 'id', 'kind', 'name']);
    });
    // THE PAIRING TEST. Same API, two formats, same SDK surface.
    (0, node_test_1.test)('rest-graphql-correspondence', async () => {
        const [gres, rres] = await Promise.all([
            buildGraphql({ generate: false }), buildRest()
        ]);
        node_assert_1.default.equal(gres.ok, true);
        node_assert_1.default.equal(rres.ok, true);
        const gents = gres.apimodel.main.kit.entity;
        const rents = rres.apimodel.main.kit.entity;
        // Same entities.
        node_assert_1.default.deepStrictEqual(Object.keys(gents).sort(), Object.keys(rents).sort(), 'entity names must match across formats');
        for (const name of Object.keys(rents).sort()) {
            // Same operations per entity.
            node_assert_1.default.deepStrictEqual(Object.keys(gents[name].op).sort(), Object.keys(rents[name].op).sort(), name + ': op names must match across formats');
            // Same actions, reached the same way ($action-discriminated points).
            const actions = (ents) => {
                const out = [];
                for (const op of Object.values(ents[name].op)) {
                    for (const p of op.points ?? []) {
                        if (null != p.select?.$action) {
                            out.push(p.select.$action);
                        }
                    }
                }
                return out.sort();
            };
            node_assert_1.default.deepStrictEqual(actions(gents), actions(rents), name + ': actions must match across formats');
        }
        // The planet actions are the ones that matter: they are the reason a
        // command mutation must not be dropped or forced into CRUD.
        node_assert_1.default.deepStrictEqual(Object.values(gents.planet.op)
            .flatMap((op) => op.points ?? [])
            .map((p) => p.select?.$action)
            .filter((a) => null != a).sort(), ['forbid', 'terraform']);
    });
    // Wire data for the baseline: documents complete, single-line, unwrapping
    // through the existing transform.res mechanism.
    (0, node_test_1.test)('baseline-points', async () => {
        const bres = await buildGraphql({ generate: false });
        node_assert_1.default.equal(bres.ok, true);
        const ops = bres.apimodel.main.kit.entity.planet.op;
        const load = ops.load.points[0];
        node_assert_1.default.equal(load.kind, 'graphql');
        node_assert_1.default.equal(load.method, 'POST');
        node_assert_1.default.equal(load.graphql.doc, 'query PlanetLoad($id: String!) { planet(id: $id) { ...PlanetFields } }' +
            ' fragment PlanetFields on Planet' +
            ' { diameter id kind name }');
        node_assert_1.default.equal(load.transform.res, '`body.data.planet`');
        const list = ops.list.points[0];
        node_assert_1.default.equal(list.transform.res, '`body.data.planets.nodes`');
        node_assert_1.default.equal(list.graphql.page.style, 'relay');
        // Payload unwrapping: create returns the planet, as REST does.
        node_assert_1.default.equal(ops.create.points[0].transform.res, '`body.data.planetCreate.planet`');
        // Each action point is a distinct GraphQL operation. Operation names
        // reach server logs and tracing, so three points on `update` must not
        // all be called PlanetUpdate.
        const updocs = ops.update.points
            .map((p) => p.graphql.doc.split(/[\s(]/)[1]).sort();
        node_assert_1.default.deepStrictEqual(updocs, ['PlanetUpdate', 'PlanetUpdateForbid', 'PlanetUpdateTerraform']);
        // The action payload unwraps to the entity, not to the state wrapper.
        const terraform = ops.update.points
            .find((p) => 'terraform' === p.select?.$action);
        node_assert_1.default.ok(null != terraform);
        node_assert_1.default.equal(terraform.transform.res, '`body.data.planetTerraform.planet`');
    });
    // Schema gate: the emitted baseline model must unify against the canonical
    // apidef schema.
    (0, node_test_1.test)('unify-graphql-solar', async () => {
        const bres = await buildGraphql();
        node_assert_1.default.equal(bres.ok, true);
        const modelpath = Path.join(GQL_FOLDER, 'graphql-solar.aontu');
        const src = Fs.readFileSync(modelpath, 'utf8');
        const errs = [];
        // No fs injection: see the note in graphql.test.ts (multisource parses
        // Windows paths with POSIX semantics whenever an fs is present).
        const out = new aontu_1.Aontu().generate(src, { path: modelpath, errs });
        node_assert_1.default.deepStrictEqual(errs.map((e) => String(e).split('\n')[0]), [], 'emitted solar GraphQL model must unify against model/apidef.aontu');
        node_assert_1.default.equal(out.main.kit.entity.planet.op.load.points[0].kind, 'graphql');
    });
});
//# sourceMappingURL=graphql-solar.test.js.map