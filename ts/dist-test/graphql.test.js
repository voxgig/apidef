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
// End-to-end GraphQL ingestion: SDL in, apimodel out.
//
// The final test here is the one that keeps the canonical schema honest — it
// unifies the EMITTED model through @voxgig/apidef/model/apidef.aontu, so a
// point shape the schema does not accept fails the suite rather than
// surfacing downstream in sdkgen. (No such assertion existed for the REST
// path: apidef.test.ts's `full-solar` is disabled.)
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const aontu_1 = require("aontu");
const apidef_1 = require("../dist/apidef");
const OUTPREFIX = 'graphql-linearish-';
const FOLDER = Path.join(__dirname, '..', 'test', 'graphql');
const ENDPOINT = 'https://api.example.test/graphql';
async function buildGraphql(step) {
    const build = await apidef_1.ApiDef.makeBuild({
        folder: FOLDER,
        outprefix: OUTPREFIX,
        debug: 'debug',
        kind: 'GraphQL',
        endpoint: ENDPOINT,
        auth: { scheme: 'apikey', prefix: '' },
    });
    return await build({ name: 'graphql', def: OUTPREFIX + 'def.graphql' }, {
        spec: {
            base: FOLDER,
            buildargs: {
                apidef: {
                    ctrl: {
                        step: {
                            parse: true,
                            guide: true,
                            transformers: true,
                            builders: true,
                            generate: true,
                            ...(step ?? {}),
                        },
                    },
                },
            },
        },
    }, {});
}
(0, node_test_1.describe)('graphql', () => {
    // Classification: shape drives the op, the entity/op split comes out of
    // the root-field names, and the command mutation folds onto update as an
    // action rather than being dropped or forced into CRUD.
    (0, node_test_1.test)('guide-graphql', async () => {
        const bres = await buildGraphql({
            transformers: false, builders: false, generate: false,
        });
        node_assert_1.default.equal(bres.ok, true);
        const gent = bres.guide.entity;
        node_assert_1.default.deepStrictEqual(Object.keys(gent).sort(), ['comment', 'issue', 'team']);
        const issue = gent.issue.field;
        node_assert_1.default.deepStrictEqual(Object.keys(issue).sort(), [
            'issue', 'issueArchive', 'issueCreate', 'issueDelete', 'issueUpdate', 'issues',
        ]);
        // query issue(id:) -> load; issues(...): IssueConnection -> list
        node_assert_1.default.equal(issue.issue.op.load.optype, 'query');
        node_assert_1.default.equal(issue.issues.op.list.optype, 'query');
        // Input-object shapes drive create/update; delete verb drives remove.
        node_assert_1.default.equal(issue.issueCreate.op.create.optype, 'mutation');
        node_assert_1.default.equal(issue.issueUpdate.op.update.optype, 'mutation');
        node_assert_1.default.equal(issue.issueDelete.op.remove.optype, 'mutation');
        // The command mutation folds onto update as an $action point.
        node_assert_1.default.deepStrictEqual(Object.keys(issue.issueArchive.action), ['archive']);
        node_assert_1.default.equal(issue.issueArchive.op.update.optype, 'mutation');
        // Ragged op sets are the norm: Team is read-only, Comment create-only.
        node_assert_1.default.deepStrictEqual(Object.keys(gent.team.field).sort(), ['team', 'teams']);
        node_assert_1.default.deepStrictEqual(Object.keys(gent.comment.field).sort(), ['commentCreate']);
        // Root fields, not paths, are what got classified.
        node_assert_1.default.equal(bres.guide.metrics.count.entity, 3);
        node_assert_1.default.equal(bres.guide.metrics.count.path, 0);
        node_assert_1.default.ok(0 < bres.guide.metrics.count.field);
    });
    // Entity fields come from the object type: non-deprecated scalars, no
    // required-argument fields, to-one relations as id stubs.
    (0, node_test_1.test)('fields-graphql', async () => {
        const bres = await buildGraphql({ generate: false });
        node_assert_1.default.equal(bres.ok, true);
        const issue = bres.apimodel.main.kit.entity.issue;
        const names = issue.fields.map((f) => f.name);
        node_assert_1.default.deepStrictEqual(names, [
            'archived_at', 'created_at', 'id', 'identifier', 'priority',
            'team_id', 'title',
        ]);
        // `legacyCode` is deprecated and `icon(size: Int!)` needs an argument:
        // selecting either in a fixed fragment is wrong (the latter is a hard
        // GraphQL validation error), so neither may appear.
        node_assert_1.default.ok(!names.includes('legacy_code'));
        node_assert_1.default.ok(!names.includes('icon'));
        node_assert_1.default.deepStrictEqual(issue.id, { field: 'id', name: 'id' });
    });
    // Wire data: the document is complete and single-line, and the response
    // unwrap path rides the existing transform.res mechanism.
    (0, node_test_1.test)('points-graphql', async () => {
        const bres = await buildGraphql({ generate: false });
        node_assert_1.default.equal(bres.ok, true);
        const ops = bres.apimodel.main.kit.entity.issue.op;
        const load = ops.load.points[0];
        node_assert_1.default.equal(load.kind, 'graphql');
        // GraphQL points ride the HTTP machinery: one POST, no path parts.
        node_assert_1.default.equal(load.method, 'POST');
        node_assert_1.default.deepStrictEqual(load.parts, undefined);
        node_assert_1.default.equal(load.graphql.optype, 'query');
        node_assert_1.default.equal(load.graphql.field, 'issue');
        node_assert_1.default.equal(load.graphql.doc, 'query IssueLoad($id: String!) { issue(id: $id) { ...IssueFields } }' +
            ' fragment IssueFields on Issue' +
            ' { archivedAt createdAt id identifier priority team { id } title }');
        node_assert_1.default.equal(load.transform.res, '`body.data.issue`');
        node_assert_1.default.deepStrictEqual(load.graphql.vars, [
            { name: 'id', from: 'id', gqltype: 'String!' },
        ]);
        // Documents are single-line: byte-stable output, and the string survives
        // the JSONIC round-trip into the emitted model.
        node_assert_1.default.ok(!load.graphql.doc.includes('\n'));
        // Relay connection -> list, with the pagination descriptor recorded and
        // the unwrap pointing at the node array.
        const list = ops.list.points[0];
        node_assert_1.default.equal(list.transform.res, '`body.data.issues.nodes`');
        node_assert_1.default.deepStrictEqual(list.graphql.page, {
            style: 'relay',
            nodes: 'nodes',
            cursor: 'pageInfo.endCursor',
            more: 'pageInfo.hasNextPage',
        });
        node_assert_1.default.ok(list.graphql.doc.includes('pageInfo { endCursor hasNextPage }'));
        // Mutation payload is unwrapped, so create returns the entity itself —
        // exactly as a REST create does.
        const create = ops.create.points[0];
        node_assert_1.default.equal(create.graphql.optype, 'mutation');
        node_assert_1.default.equal(create.transform.res, '`body.data.issueCreate.issue`');
        // The command mutation is a second point on update, selected at runtime
        // by $action (the mechanism REST action paths already use).
        const updatePoints = ops.update.points;
        node_assert_1.default.equal(updatePoints.length, 2);
        const archive = updatePoints.find((p) => 'archive' === p.select?.$action);
        node_assert_1.default.ok(null != archive, 'archive action point');
        node_assert_1.default.equal(archive.graphql.field, 'issueArchive');
        node_assert_1.default.equal(archive.transform.res, '`body.data.issueArchive.issue`');
    });
    // A GraphQL schema declares no auth and no server URL; both come from
    // build options, and the no-auth signal must NOT be emitted just because
    // the schema is silent (that would suppress all generated auth code).
    (0, node_test_1.test)('info-graphql', async () => {
        const bres = await buildGraphql({ generate: false });
        node_assert_1.default.equal(bres.ok, true);
        const info = bres.apimodel.main.kit.info;
        node_assert_1.default.equal(info.servers[0].url, ENDPOINT);
        node_assert_1.default.notEqual(info.auth, false);
        node_assert_1.default.equal(info.security.prefix, '');
        node_assert_1.default.equal(info.security.name, 'Authorization');
    });
    // THE SCHEMA GATE: unify the emitted model through the canonical apidef
    // schema. Any point shape the schema rejects fails here.
    (0, node_test_1.test)('unify-graphql', async () => {
        const bres = await buildGraphql();
        node_assert_1.default.equal(bres.ok, true);
        const modelpath = Path.join(FOLDER, 'graphql.aontu');
        const src = Fs.readFileSync(modelpath, 'utf8');
        const errs = [];
        const out = new aontu_1.Aontu({ fs: Fs }).generate(src, { path: modelpath, errs });
        node_assert_1.default.deepStrictEqual(errs.map((e) => String(e).split('\n')[0]), [], 'emitted GraphQL model must unify against model/apidef.aontu');
        const point = out.main.kit.entity.issue.op.load.points[0];
        node_assert_1.default.equal(point.kind, 'graphql');
        node_assert_1.default.equal(point.method, 'POST');
        node_assert_1.default.deepStrictEqual(point.parts, []);
        node_assert_1.default.ok(point.graphql.doc.startsWith('query IssueLoad'));
    });
});
//# sourceMappingURL=graphql.test.js.map