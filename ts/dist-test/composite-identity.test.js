"use strict";
/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const field_1 = require("../dist/transform/field");
// Composite entity identity: an API that addresses one record by SEVERAL
// adjacent path parameters, with no single parameter that is the id.
//
// ADJACENCY IS THE WHOLE HEURISTIC, and these tests pin it from both sides,
// because the first implementation took every path variable instead and made
// solar's `moon`, petstore's `order`/`pet`/`user` and taxonomy's `domain` all
// falsely composite. Nested resources are the common shape; a compound key is
// the exception, and only adjacency separates them.
//
// Go carries the same cases in go/composite_test.go — this file is the
// canonical statement of the behaviour that port is held to.
function seg(...parts) {
    return parts.map((p) => p.startsWith('{') ? { var: p.slice(1, -1) } : { lit: p });
}
// An entity whose load op has one point over the given path.
function entity(name, path, fields = [], guide) {
    const ent = {
        name,
        fields,
        op: {
            load: {
                points: [{
                        orig: '/' + path.join('/'),
                        method: 'GET',
                        segments: seg(...path),
                    }],
            },
        },
    };
    return { ent, guide };
}
async function run(name, path, fields = [], guide, model) {
    const { ent } = entity(name, path, fields);
    const apimodel = { main: { kit: { entity: { [name]: ent } } } };
    // Field extraction reads the response schema off the definition, so the
    // definition has to carry the point's path. The schema itself is empty:
    // these tests are about IDENTITY STRUCTURE, which comes from the route.
    const orig = '/' + path.join('/');
    const def = {
        paths: { [orig]: { get: { responses: { '200': { content: {} } } } } },
    };
    const ctx = { apimodel, def, guide, model };
    await (0, field_1.fieldTransform)(ctx);
    return ent;
}
// An entity with SEVERAL read routes, which is what a large specification
// actually produces.
async function runPoints(name, paths, model) {
    const ent = {
        name,
        fields: [],
        op: {
            load: {
                points: paths.map((path) => ({
                    orig: '/' + path.join('/'),
                    method: 'GET',
                    segments: seg(...path),
                })),
            },
        },
    };
    const apimodel = { main: { kit: { entity: { [name]: ent } } } };
    const def = { paths: {} };
    for (const path of paths) {
        def.paths['/' + path.join('/')] =
            { get: { responses: { '200': { content: {} } } } };
    }
    await (0, field_1.fieldTransform)({ apimodel, def, guide: undefined, model });
    return ent;
}
(0, node_test_1.describe)('composite-identity', () => {
    // /repos/{owner}/{repo} — two variables with nothing between them address
    // no sub-collection, so only the pair identifies a repository.
    (0, node_test_1.test)('adjacent parameters are a compound key', async () => {
        const ent = await run('repo', ['repos', '{owner}', '{repo}']);
        node_assert_1.default.deepStrictEqual(ent.id.parts, ['owner', 'repo']);
        node_assert_1.default.equal(ent.id.sep, '/');
    });
    // /api/planet/{planet_id}/moon/{moon_id} — the literal `moon` names a
    // sub-collection, so `planet_id` SCOPES the record and `moon_id` names it.
    (0, node_test_1.test)('a nested resource is not composite', async () => {
        const ent = await run('moon', ['api', 'planet', '{planet_id}', 'moon', '{moon_id}']);
        node_assert_1.default.equal(ent.id?.parts, undefined);
    });
    // A route ending in a literal is a verb ON the record, not its address.
    (0, node_test_1.test)('a trailing literal yields no parts', async () => {
        const ent = await run('geo', ['api', 'geo', '{id}', 'graphql']);
        node_assert_1.default.equal(ent.id?.parts, undefined);
    });
    // THE RECORD'S OWN ROUTE DECIDES, not the first one listed. github's repo
    // carries `/repos/{owner}/{repo}/attestations/{subject_digest}` ahead of
    // `/repos/{owner}/{repo}`, and reading the first gave the entity the single
    // part `subject_digest` — no compound key at all, for the case this feature
    // exists for. A one-path fixture cannot catch that: the defect only appears
    // once an entity has more than one read route, which is every entity in a
    // real specification.
    (0, node_test_1.test)('the least-qualified record route decides the parts', async () => {
        const ent = await runPoints('repo', [
            ['repos', '{owner}', '{repo}', 'attestations', '{subject_digest}'],
            ['repos', '{owner}', '{repo}', 'contents', '{path}'],
            ['repos', '{owner}', '{repo}'],
            ['repos', '{owner}', '{repo}', 'collaborators', '{username}'],
        ]);
        node_assert_1.default.deepStrictEqual(ent.id.parts, ['owner', 'repo']);
    });
    // And a route ending in a literal never wins: it is a verb on the record,
    // not the record's address.
    (0, node_test_1.test)('a non-record route does not win', async () => {
        const ent = await runPoints('repo', [
            ['repos', '{owner}', '{repo}', 'forks'],
            ['repos', '{owner}', '{repo}'],
        ]);
        node_assert_1.default.deepStrictEqual(ent.id.parts, ['owner', 'repo']);
    });
    // ENDING IN A VARIABLE IS NOT ENOUGH. cloudsmith reads an owner's
    // vulnerabilities from `/vulnerabilities/{owner}/` — a LIST, by any
    // measure the shortest route here that ends in a variable. Preferring the
    // shortest such route (the first attempt at the rule above) cut this
    // four-part key down to `owner` and dropped three more composites across
    // the validation corpus. The record's address is the route that carries
    // its whole key, so the longest run wins.
    (0, node_test_1.test)('a shorter list route does not beat the full address', async () => {
        const ent = await runPoints('vulnerability', [
            ['vulnerabilities', '{owner}'],
            ['vulnerabilities', '{owner}', '{repo}'],
            ['vulnerabilities', '{owner}', '{repo}', '{package}', '{identifier}'],
            ['vulnerabilities', '{owner}', '{repo}', '{package}'],
        ]);
        node_assert_1.default.deepStrictEqual(ent.id.parts, ['owner', 'repo', 'package', 'identifier']);
    });
    (0, node_test_1.test)('three adjacent parameters compose in path order', async () => {
        const ent = await run('entitlement', ['entitlements', '{owner}', '{repo}', '{identifier}']);
        node_assert_1.default.deepStrictEqual(ent.id.parts, ['owner', 'repo', 'identifier']);
    });
    // A COMPOSITE ENTITY NEED NOT EXPOSE AN `id`. Without this the descriptor
    // was only built inside the single-id gate, so such an entity got none at
    // all — and an explicit guide correction was silently ignored.
    (0, node_test_1.test)('a composite entity with no id field still gets one', async () => {
        const ent = await run('repo', ['repos', '{owner}', '{repo}'], [{ name: 'name', type: '`$STRING`', req: true }]);
        node_assert_1.default.deepStrictEqual(ent.id.parts, ['owner', 'repo']);
        const idf = ent.fields.find((f) => 'id' === f.name);
        node_assert_1.default.equal(idf.type, '`$STRING`');
    });
    // A COMPOSITE ID IS THE PARTS JOINED, so the field holding it is a string
    // whatever the API's own `id` happens to be — github's repo declares an
    // integer, its global database id.
    // THE API'S OWN id IS KEPT, not reinterpreted. `id` must hold a string
    // because that is what the joined value is; the spec's numeric property
    // moves to `<api>_id` with its type, format and per-op overrides intact,
    // and `alias.field` records where it went. Retyping in place claimed the
    // server's numeric id was a string; leaving it alone made `id.field` name
    // a declaration the runtime value cannot satisfy.
    (0, node_test_1.test)('the API id moves aside rather than being rewritten', async () => {
        const ent = await run('repo', ['repos', '{owner}', '{repo}'], [
            {
                name: 'id', type: '`$INTEGER`', req: true, format: 'int64',
                op: { list: { req: true, type: '`$INTEGER`' } },
            },
        ], undefined, { name: 'github' });
        const idf = ent.fields.find((f) => 'id' === f.name);
        node_assert_1.default.equal(idf.type, '`$STRING`');
        node_assert_1.default.equal(idf.format, undefined);
        node_assert_1.default.equal(idf.op.list.type, undefined);
        const kept = ent.fields.find((f) => 'github_id' === f.name);
        node_assert_1.default.equal(kept.type, '`$INTEGER`');
        node_assert_1.default.equal(kept.format, 'int64');
        // AND the per-op metadata, which a shallow copy silently lost: the
        // deletions that clean up `id` ran over a shared `op` object, so the
        // preserved field kept nothing for the one key it exists to keep.
        node_assert_1.default.equal(kept.op.list.type, '`$INTEGER`');
        node_assert_1.default.equal(ent.alias.field.github_id, 'id');
    });
    (0, node_test_1.describe)('guide corrections', () => {
        // Adjacency cannot always be right: github's
        // /…/artifacts/{artifact_id}/{archive_format} reads as composite and is
        // not — the format selects zip or tar.
        (0, node_test_1.test)('composite:false turns the inference off', async () => {
            const ent = await run('artifact', ['artifacts', '{artifact_id}', '{archive_format}'], [], { entity: { artifact: { id: { composite: false } } } });
            node_assert_1.default.equal(ent.id?.parts, undefined);
        });
        // DISABLING COMPOSITE MUST NOT DISABLE THE ID: the record still has a
        // key, and it is the terminal parameter.
        // DISABLING COMPOSITE MUST NOT DISABLE THE ID, and WHICH parameter is
        // the key is decided by the id-finding rules rather than by position:
        // this route ends in a format selector, so position picks the modifier.
        (0, node_test_1.test)('composite:false leaves a single-key descriptor', async () => {
            const ent = await run('artifact', ['artifacts', '{artifact_id}', '{archive_format}'], [], { entity: { artifact: { id: { composite: false } } } });
            node_assert_1.default.equal(ent.id.field, 'id');
            node_assert_1.default.ok(ent.fields.some((f) => 'id' === f.name));
        });
        (0, node_test_1.test)('an explicit parts list wins over the inference', async () => {
            const ent = await run('repo', ['repos', '{owner}', '{repo}'], [], { entity: { repo: { id: { parts: ['a', 'b', 'c'] } } } });
            node_assert_1.default.deepStrictEqual(ent.id.parts, ['a', 'b', 'c']);
        });
        // Restating every inferred part merely to change the separator is what
        // the optional key exists to avoid.
        (0, node_test_1.test)('a stated sep applies to inferred parts', async () => {
            const ent = await run('repo', ['repos', '{owner}', '{repo}'], [], { entity: { repo: { id: { sep: ':' } } } });
            node_assert_1.default.deepStrictEqual(ent.id.parts, ['owner', 'repo']);
            node_assert_1.default.equal(ent.id.sep, ':');
        });
    });
});
//# sourceMappingURL=composite-identity.test.js.map