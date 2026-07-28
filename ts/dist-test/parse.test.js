"use strict";
/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const parse_1 = require("../dist/parse");
// The $ref logic differs from the previous implementation exactly on these
// inputs, so they are the ones that need pinning: alias chains in BOTH
// document orders (resolution reads a root the same walk is mutating, so
// order used to decide whether it worked), $ref carrying sibling keywords,
// cyclic aliases, and a shared recursive schema (the old cycle-breaker
// rebuilt the tree and expanded the DAG exponentially).
(0, node_test_1.describe)('parse-refs', () => {
    const HEAD = `openapi: 3.0.0
info: { title: t, version: "1.0.0" }
servers: [ { url: "https://x.example" } ]
`;
    const PATHS = `paths:
  /thing:
    get:
      responses:
        "200":
          content: { application/json: { schema: { $ref: "#/components/schemas/Alias" } } }
`;
    const schema = async (src) => {
        const def = await (0, parse_1.parse)('OpenAPI', src, { file: 'p.yaml' });
        return def.paths['/thing'].get.responses['200']
            .content['application/json'].schema;
    };
    const CHAIN = `components:
  schemas:
    Alias: { $ref: "#/components/schemas/Mid" }
    Mid: { $ref: "#/components/schemas/Real" }
    Real: { type: object, properties: { id: { type: string } } }
`;
    (0, node_test_1.test)('alias chain resolves regardless of document order', async () => {
        for (const [label, src] of [
            ['paths-first', HEAD + PATHS + CHAIN],
            ['components-first', HEAD + CHAIN + PATHS],
        ]) {
            const s = await schema(src);
            node_assert_1.default.deepStrictEqual(s.type, 'object', label);
            node_assert_1.default.deepStrictEqual(s.properties.id.type, 'string', label);
        }
    });
    const SIB = `components:
  schemas:
    Alias: { $ref: "#/components/schemas/Real", description: "aliased" }
    Real: { type: object, description: "target", properties: { id: { type: string } } }
`;
    (0, node_test_1.test)('$ref siblings survive inlining and win over the target', async () => {
        for (const [label, src] of [
            ['paths-first', HEAD + PATHS + SIB],
            ['components-first', HEAD + SIB + PATHS],
        ]) {
            const s = await schema(src);
            node_assert_1.default.deepStrictEqual(s.properties.id.type, 'string', label);
            node_assert_1.default.deepStrictEqual(s.description, 'aliased', label);
        }
    });
    (0, node_test_1.test)('cyclic alias chain terminates', async () => {
        const src = HEAD + PATHS + `components:
  schemas:
    Alias: { $ref: "#/components/schemas/B" }
    B: { $ref: "#/components/schemas/Alias" }
`;
        const s = await schema(src);
        node_assert_1.default.deepStrictEqual('object', typeof s);
    });
    (0, node_test_1.test)('self-referential schema is cut, not expanded', async () => {
        const src = HEAD + PATHS + `components:
  schemas:
    Alias:
      type: object
      properties:
        self: { $ref: "#/components/schemas/Alias" }
        id: { type: string }
`;
        const s = await schema(src);
        node_assert_1.default.deepStrictEqual(s.properties.id.type, 'string');
        // Serialisable: the cycle was broken, not left in place.
        node_assert_1.default.deepStrictEqual('string', typeof JSON.stringify(s));
    });
    (0, node_test_1.test)('shared components stay shared (no exponential expansion)', async () => {
        // 12 levels x 3 refs per level is ~531k nodes if the DAG is expanded into
        // a tree, and a few dozen if sharing is preserved.
        const depth = 12, fan = 3;
        const schemas = ['    L0: { type: object, properties: { v: { type: string } } }'];
        for (let d = 1; d <= depth; d++) {
            const props = [];
            for (let f = 0; f < fan; f++)
                props.push(`p${f}: { $ref: "#/components/schemas/L${d - 1}" }`);
            schemas.push(`    L${d}: { type: object, properties: { ${props.join(', ')} } }`);
        }
        const src = `${HEAD}components:
  schemas:
${schemas.join('\n')}
paths:
  /thing:
    get:
      responses:
        "200":
          content: { application/json: { schema: { $ref: "#/components/schemas/L${depth}" } } }
`;
        const def = await (0, parse_1.parse)('OpenAPI', src, { file: 'd.yaml' });
        const seen = new Set();
        const stack = [def];
        while (0 < stack.length) {
            const n = stack.pop();
            if (null == n || 'object' !== typeof n || seen.has(n))
                continue;
            seen.add(n);
            for (const k of Object.keys(n))
                stack.push(n[k]);
        }
        node_assert_1.default.ok(seen.size < 1000, `parsed spec expanded to ${seen.size} distinct nodes — DAG sharing lost`);
    });
});
(0, node_test_1.describe)('parse', () => {
    (0, node_test_1.test)('happy', async () => {
        const pm0 = { file: 'f0' };
        node_assert_1.default.ok(parse_1.parse);
        await node_assert_1.default.rejects((0, parse_1.parse)('not-a-kind', '', pm0), /unknown/);
        await node_assert_1.default.rejects((0, parse_1.parse)('OpenAPI', 'bad', pm0), /JSON/);
        await node_assert_1.default.rejects((0, parse_1.parse)('OpenAPI', undefined, pm0), /string/);
        await node_assert_1.default.rejects((0, parse_1.parse)('OpenAPI', '{}', pm0), /Unsupported/);
        await node_assert_1.default.rejects((0, parse_1.parse)('OpenAPI', '', pm0), /empty/);
        await node_assert_1.default.rejects((0, parse_1.parse)('OpenAPI', `openapi: 3.0.0
a::1`, pm0), /syntax/);
        const p0 = await (0, parse_1.parse)('OpenAPI', '{"openapi":"3.0.0", "info": {"title": "T0","version": "1.0.0"},"paths":{}}', pm0);
        node_assert_1.default.deepStrictEqual(p0, {
            openapi: '3.0.0',
            info: { title: 'T0', version: '1.0.0' },
            paths: {},
            components: {}
        });
        const p1 = await (0, parse_1.parse)('OpenAPI', `
openapi: 3.0.0
info:
  title: T1
  version: 1.0.0
paths: {}
`, pm0);
        node_assert_1.default.deepStrictEqual(p1, {
            openapi: '3.0.0',
            info: { title: 'T1', version: '1.0.0' },
            paths: {},
            components: {}
        });
    });
    (0, node_test_1.test)('resolves repeated $ref with x-ref preserved', async () => {
        const pm0 = { file: 'f0' };
        const mkop = () => ({
            get: {
                responses: {
                    '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } }
                }
            }
        });
        const src = JSON.stringify({
            openapi: '3.0.0',
            info: { title: 'T', version: '1.0.0' },
            paths: { '/a': mkop(), '/b': mkop() },
            components: { schemas: { Pet: { type: 'object', properties: { id: { type: 'string' } } } } }
        });
        const def = await (0, parse_1.parse)('OpenAPI', src, pm0);
        // Each reference is inlined with the resolved content and the original
        // pointer preserved as x-ref.
        for (const p of ['/a', '/b']) {
            const schema = def.paths[p].get.responses['200'].content['application/json'].schema;
            node_assert_1.default.strictEqual(schema['x-ref'], '#/components/schemas/Pet', p);
            node_assert_1.default.strictEqual(schema.type, 'object', p);
            node_assert_1.default.strictEqual(schema.properties.id.type, 'string', p);
        }
    });
    (0, node_test_1.test)('validateSource', async () => {
        const pm0 = { file: 'f0' };
        // Empty string should be rejected
        await node_assert_1.default.rejects((0, parse_1.parse)('OpenAPI', '', pm0), /source is empty/);
        // Only whitespace should be rejected
        await node_assert_1.default.rejects((0, parse_1.parse)('OpenAPI', '   \n\t  \n  ', pm0), /source is empty/);
        // Only YAML comments should be rejected
        await node_assert_1.default.rejects((0, parse_1.parse)('OpenAPI', '# Just a comment', pm0), /source is empty/);
        // Comments and whitespace should be rejected
        await node_assert_1.default.rejects((0, parse_1.parse)('OpenAPI', `
# Comment 1
  # Comment 2
    # Comment 3
`, pm0), /source is empty/);
        // Mix of comments and whitespace should be rejected
        await node_assert_1.default.rejects((0, parse_1.parse)('OpenAPI', `

# Header comment

  # Another comment

`, pm0), /source is empty/);
    });
});
//# sourceMappingURL=parse.test.js.map