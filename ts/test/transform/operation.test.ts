/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */


import { test, describe } from 'node:test'
import assert from 'node:assert'


import {
  operationTransform
} from '../../dist/transform/operation'


import {
  KIT
} from '../../dist/types'


// Build a minimal ctx whose guide has one entity with the given path ops.
// `paths$` is what collectOps reads (normally set by the entity transform).
function makeCtx(entname: string, op: any): any {
  return {
    apimodel: { main: { [KIT]: { entity: { [entname]: {} } } } },
    guide: {
      entity: {
        [entname]: {
          name: entname,
          paths$: [
            { orig: '/' + entname, parts: [entname], rename: {}, def: {}, op },
          ],
        },
      },
    },
    log: { info: () => {}, debug: () => {}, warn: () => {} },
  }
}


describe('transform-operation transform propagation', () => {

  test('carries the guide-computed res transform onto the point', async () => {
    // Envelope-wrapping response: the guide put `body.pet` on the op.
    const ctx = makeCtx('pet', {
      list: { method: 'GET', transform: { res: '`body.pet`' } },
    })
    await operationTransform(ctx)
    const pt = ctx.apimodel.main[KIT].entity.pet.op.list.points[0]
    assert.strictEqual(pt.transform.res, '`body.pet`')
    assert.strictEqual(pt.transform.req, '`reqdata`') // req absent -> default
  })

  test('falls back to generic defaults when the op has no transform', async () => {
    const ctx = makeCtx('thing', {
      create: { method: 'POST' },
    })
    await operationTransform(ctx)
    const pt = ctx.apimodel.main[KIT].entity.thing.op.create.points[0]
    assert.strictEqual(pt.transform.res, '`body`')
    assert.strictEqual(pt.transform.req, '`reqdata`')
  })

  test('does not mutate the shared guide op.transform across points', async () => {
    // Two paths share one op object reference; defaulting on one point
    // must not leak onto the other (the point spreads into a fresh object).
    const sharedOp = { method: 'GET', transform: { res: '`body.pet`' } }
    const ctx: any = makeCtx('pet', { list: sharedOp })
    ctx.guide.entity.pet.paths$.push(
      { orig: '/pets/{id}', parts: ['pets', '{id}'], rename: {}, def: {}, op: { list: sharedOp } })
    await operationTransform(ctx)
    // The guide op's transform.req stays undefined (defaults applied on copies).
    assert.strictEqual(sharedOp.transform.res, '`body.pet`')
    assert.strictEqual((sharedOp.transform as any).req, undefined)
  })

})
