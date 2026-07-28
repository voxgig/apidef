/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */


import { test, describe } from 'node:test'
import assert from 'node:assert'



import {
  parse,
} from '../dist/parse'


// The $ref logic differs from the previous implementation exactly on these
// inputs, so they are the ones that need pinning: alias chains in BOTH
// document orders (resolution reads a root the same walk is mutating, so
// order used to decide whether it worked), $ref carrying sibling keywords,
// cyclic aliases, and a shared recursive schema (the old cycle-breaker
// rebuilt the tree and expanded the DAG exponentially).
describe('parse-refs', () => {
  const HEAD = `openapi: 3.0.0
info: { title: t, version: "1.0.0" }
servers: [ { url: "https://x.example" } ]
`
  const PATHS = `paths:
  /thing:
    get:
      responses:
        "200":
          content: { application/json: { schema: { $ref: "#/components/schemas/Alias" } } }
`
  const schema = async (src: string) => {
    const def: any = await parse('OpenAPI', src, { file: 'p.yaml' })
    return def.paths['/thing'].get.responses['200']
      .content['application/json'].schema
  }

  const CHAIN = `components:
  schemas:
    Alias: { $ref: "#/components/schemas/Mid" }
    Mid: { $ref: "#/components/schemas/Real" }
    Real: { type: object, properties: { id: { type: string } } }
`

  test('alias chain resolves regardless of document order', async () => {
    for (const [label, src] of [
      ['paths-first', HEAD + PATHS + CHAIN],
      ['components-first', HEAD + CHAIN + PATHS],
    ] as [string, string][]) {
      const s = await schema(src)
      assert.deepStrictEqual(s.type, 'object', label)
      assert.deepStrictEqual(s.properties.id.type, 'string', label)
    }
  })

  const SIB = `components:
  schemas:
    Alias: { $ref: "#/components/schemas/Real", description: "aliased" }
    Real: { type: object, description: "target", properties: { id: { type: string } } }
`

  test('$ref siblings survive inlining and win over the target', async () => {
    for (const [label, src] of [
      ['paths-first', HEAD + PATHS + SIB],
      ['components-first', HEAD + SIB + PATHS],
    ] as [string, string][]) {
      const s = await schema(src)
      assert.deepStrictEqual(s.properties.id.type, 'string', label)
      assert.deepStrictEqual(s.description, 'aliased', label)
    }
  })

  test('cyclic alias chain terminates', async () => {
    const src = HEAD + PATHS + `components:
  schemas:
    Alias: { $ref: "#/components/schemas/B" }
    B: { $ref: "#/components/schemas/Alias" }
`
    const s = await schema(src)
    assert.deepStrictEqual('object', typeof s)
  })

  test('self-referential schema is cut, not expanded', async () => {
    const src = HEAD + PATHS + `components:
  schemas:
    Alias:
      type: object
      properties:
        self: { $ref: "#/components/schemas/Alias" }
        id: { type: string }
`
    const s = await schema(src)
    assert.deepStrictEqual(s.properties.id.type, 'string')
    // Serialisable: the cycle was broken, not left in place.
    assert.deepStrictEqual('string', typeof JSON.stringify(s))
  })

  test('shared components stay shared (no exponential expansion)', async () => {
    // 12 levels x 3 refs per level is ~531k nodes if the DAG is expanded into
    // a tree, and a few dozen if sharing is preserved.
    const depth = 12, fan = 3
    const schemas = ['    L0: { type: object, properties: { v: { type: string } } }']
    for (let d = 1; d <= depth; d++) {
      const props = []
      for (let f = 0; f < fan; f++) props.push(`p${f}: { $ref: "#/components/schemas/L${d - 1}" }`)
      schemas.push(`    L${d}: { type: object, properties: { ${props.join(', ')} } }`)
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
`
    const def: any = await parse('OpenAPI', src, { file: 'd.yaml' })
    const seen = new Set<any>()
    const stack: any[] = [def]
    while (0 < stack.length) {
      const n = stack.pop()
      if (null == n || 'object' !== typeof n || seen.has(n)) continue
      seen.add(n)
      for (const k of Object.keys(n)) stack.push(n[k])
    }
    assert.ok(seen.size < 1000,
      `parsed spec expanded to ${seen.size} distinct nodes — DAG sharing lost`)
  })
})


describe('parse', () => {

  test('happy', async () => {
    const pm0 = { file: 'f0' }

    assert.ok(parse)

    await assert.rejects(parse('not-a-kind', '', pm0), /unknown/)
    await assert.rejects(parse('OpenAPI', 'bad', pm0), /JSON/)
    await assert.rejects(parse('OpenAPI', undefined, pm0), /string/)
    await assert.rejects(parse('OpenAPI', '{}', pm0), /Unsupported/)
    await assert.rejects(parse('OpenAPI', '', pm0), /empty/)

    await assert.rejects(parse('OpenAPI', `openapi: 3.0.0
a::1`, pm0), /syntax/)

    const p0 = await parse(
      'OpenAPI',
      '{"openapi":"3.0.0", "info": {"title": "T0","version": "1.0.0"},"paths":{}}',
      pm0)
    assert.deepStrictEqual(p0, {
      openapi: '3.0.0',
      info: { title: 'T0', version: '1.0.0' },
      paths: {},
      components: {}
    })

    const p1 = await parse('OpenAPI', `
openapi: 3.0.0
info:
  title: T1
  version: 1.0.0
paths: {}
`, pm0)

    assert.deepStrictEqual(p1, {
      openapi: '3.0.0',
      info: { title: 'T1', version: '1.0.0' },
      paths: {},
      components: {}
    })

  })


  test('resolves repeated $ref with x-ref preserved', async () => {
    const pm0 = { file: 'f0' }
    const mkop = () => ({
      get: {
        responses: {
          '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } }
        }
      }
    })
    const src = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'T', version: '1.0.0' },
      paths: { '/a': mkop(), '/b': mkop() },
      components: { schemas: { Pet: { type: 'object', properties: { id: { type: 'string' } } } } }
    })

    const def: any = await parse('OpenAPI', src, pm0)

    // Each reference is inlined with the resolved content and the original
    // pointer preserved as x-ref.
    for (const p of ['/a', '/b']) {
      const schema = def.paths[p].get.responses['200'].content['application/json'].schema
      assert.strictEqual(schema['x-ref'], '#/components/schemas/Pet', p)
      assert.strictEqual(schema.type, 'object', p)
      assert.strictEqual(schema.properties.id.type, 'string', p)
    }
  })


  test('validateSource', async () => {
    const pm0 = { file: 'f0' }

    // Empty string should be rejected
    await assert.rejects(parse('OpenAPI', '', pm0), /source is empty/)

    // Only whitespace should be rejected
    await assert.rejects(parse('OpenAPI', '   \n\t  \n  ', pm0), /source is empty/)

    // Only YAML comments should be rejected
    await assert.rejects(parse('OpenAPI', '# Just a comment', pm0), /source is empty/)

    // Comments and whitespace should be rejected
    await assert.rejects(parse('OpenAPI', `
# Comment 1
  # Comment 2
    # Comment 3
`, pm0), /source is empty/)

    // Mix of comments and whitespace should be rejected
    await assert.rejects(parse('OpenAPI', `

# Header comment

  # Another comment

`, pm0), /source is empty/)
  })


})

