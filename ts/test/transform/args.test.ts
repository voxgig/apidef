/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */


import { test, describe } from 'node:test'
import assert from 'node:assert'


import {
  argsTransform
} from '../../dist/transform/args'


import {
  KIT
} from '../../dist/types'


// A minimal ctx: one entity with one load point on `path`, and a def whose
// path carries `parameters`. This is the shape argsTransform walks.
function makeCtx(path: string, parameters: any[]): any {
  return {
    apimodel: {
      main: {
        [KIT]: {
          entity: {
            kingdom: {
              name: 'kingdom',
              op: {
                load: {
                  name: 'load',
                  points: [
                    { orig: path, method: 'GET', rename: {}, args: {} },
                  ],
                },
              },
            },
          },
        },
      },
    },
    def: {
      paths: {
        [path]: { get: { parameters } },
      },
    },
    log: { info: () => { }, debug: () => { }, warn: () => { } },
  }
}


function allargs(ctx: any) {
  const point = ctx.apimodel.main[KIT].entity.kingdom.op.load.points[0]
  return ([] as any[]).concat(
    point.args.params ?? [], point.args.query ?? [],
    point.args.header ?? [], point.args.cookie ?? [],
  )
}


describe('transform-args nameless parameters', () => {

  // A `$ref` that resolves to nothing keeps its `$ref` key and has neither
  // `name` nor `in`. Left alone it becomes a nameless `query` arg that every
  // target has to render, and Ruby cannot: `Struct.new(:"")` raises when the
  // generated SDK loads. taxonomy-1.0.0-openapi-3.1.0 in the validation
  // corpus ships exactly this, pointing at a `KingdomId` component that its
  // `components.parameters` does not define.
  test('drops a dangling $ref parameter and names it in the warning', async () => {
    const ctx = makeCtx('/{year}/kingdom/{kingdom_id}', [
      { name: 'year', in: 'path', required: true, schema: { type: 'integer' } },
      { $ref: '#/components/parameters/KingdomId' },
    ])
    const warnings: any[] = []
    ctx.warn = (w: any) => warnings.push(w)

    await argsTransform(ctx)

    const args = allargs(ctx)
    assert.deepStrictEqual(args.map((a: any) => a.name), ['year'])
    assert.strictEqual(args.filter((a: any) => '' === a.name).length, 0)

    assert.strictEqual(warnings.length, 1)
    assert.strictEqual(warnings[0].entity, 'kingdom')
    assert.strictEqual(warnings[0].op, 'load')
    assert.strictEqual(warnings[0].path, '/{year}/kingdom/{kingdom_id}')
    assert.match(warnings[0].note, /KingdomId/)
    assert.match(warnings[0].note, /resolves to nothing/)
  })


  // Same drop, but there is no reference to name: an inline parameter that
  // simply omits `name`. The note must not promise a `$ref` it has not got.
  test('drops a parameter with no name at all', async () => {
    const ctx = makeCtx('/kingdom', [
      { in: 'query', schema: { type: 'string' } },
    ])
    const warnings: any[] = []
    ctx.warn = (w: any) => warnings.push(w)

    await argsTransform(ctx)

    assert.deepStrictEqual(allargs(ctx), [])
    assert.strictEqual(warnings.length, 1)
    assert.doesNotMatch(warnings[0].note, /\$ref/)
    assert.match(warnings[0].note, /needs a `name`/)
  })


  // The drop is narrow: a named parameter beside a nameless one survives
  // with its kind, and nothing else about resolution changes.
  test('keeps every named parameter', async () => {
    const ctx = makeCtx('/kingdom', [
      { name: 'page', in: 'query', schema: { type: 'integer' } },
      { $ref: '#/components/parameters/Missing' },
      { name: 'x-trace', in: 'header', schema: { type: 'string' } },
    ])
    ctx.warn = () => { }

    await argsTransform(ctx)

    const point = ctx.apimodel.main[KIT].entity.kingdom.op.load.points[0]
    assert.deepStrictEqual(point.args.query.map((a: any) => a.name), ['page'])
    assert.deepStrictEqual(point.args.header.map((a: any) => a.name), ['x_trace'])
  })

})
