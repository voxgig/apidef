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
async function run(name, path, fields = [], guide) {
    const { ent } = entity(name, path, fields);
    const apimodel = { main: { kit: { entity: { [name]: ent } } } };
    // Field extraction reads the response schema off the definition, so the
    // definition has to carry the point's path. The schema itself is empty:
    // these tests are about IDENTITY STRUCTURE, which comes from the route.
    const orig = '/' + path.join('/');
    const def = {
        paths: { [orig]: { get: { responses: { '200': { content: {} } } } } },
    };
    const ctx = { apimodel, def, guide };
    await (0, field_1.fieldTransform)(ctx);
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
    (0, node_test_1.test)('a non-string id field is retyped, with its stale facts', async () => {
        const ent = await run('repo', ['repos', '{owner}', '{repo}'], [
            {
                name: 'id', type: '`$INTEGER`', req: true, format: 'int64',
                op: { list: { req: true, type: '`$INTEGER`' } },
            },
        ]);
        const idf = ent.fields.find((f) => 'id' === f.name);
        node_assert_1.default.equal(idf.type, '`$STRING`');
        // A `format: int64` beside a string, or a per-op override still saying
        // integer, is a model contradicting itself — and the op override is what
        // a generator reads for that op.
        node_assert_1.default.equal(idf.format, undefined);
        node_assert_1.default.equal(idf.op.list.type, undefined);
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