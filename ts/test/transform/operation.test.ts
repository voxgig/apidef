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


describe('transform-operation op resolution', () => {

  // Guide overlays may name an op anything; only the six CRUD names exist.
  // A stray name used to vanish without a trace (ADR-002: guide.aon is the
  // only correction surface, so a silent drop defeats it).
  test('drops an unknown op name with a warning', async () => {
    const ctx = makeCtx('pull', {
      load: { method: 'GET' },
      merge: { method: 'PUT' },
    })
    const warnings: any[] = []
    ctx.warn = (w: any) => warnings.push(w)
    await operationTransform(ctx)
    const ops = ctx.apimodel.main[KIT].entity.pull.op
    assert.ok(null != ops.load)
    assert.strictEqual((ops as any).merge, undefined)
    assert.strictEqual(warnings.length, 1)
    assert.strictEqual(warnings[0].op, 'merge')
    assert.strictEqual(warnings[0].path, '/pull')
    assert.match(warnings[0].note, /action: merge/)
  })

  test('skips head and options without a warning', async () => {
    const ctx = makeCtx('pull', {
      load: { method: 'GET' },
      head: { method: 'HEAD' },
      OPTIONS: { method: 'OPTIONS' },
    })
    const warnings: any[] = []
    ctx.warn = (w: any) => warnings.push(w)
    await operationTransform(ctx)
    assert.strictEqual(warnings.length, 0)
    assert.ok(null != ctx.apimodel.main[KIT].entity.pull.op.load)
  })

  // A verb borrows the update slot (actions have none of their own). The
  // entity's real PATCH must still be its update, with the verb's point
  // riding along for `$action` selection.
  test('promotes PATCH to update when every update point is an action', async () => {
    const ctx = makeCtx('pull', { patch: { method: 'PATCH' } })
    ctx.guide.entity.pull.paths$[0].orig = '/pulls/{id}'
    ctx.guide.entity.pull.paths$.push({
      orig: '/pulls/{id}/merge', parts: ['pulls', '{id}', 'merge'], rename: {}, def: {},
      op: { update: { method: 'PUT' } },
      action: { merge: {} },
    })
    await operationTransform(ctx)
    const ops = ctx.apimodel.main[KIT].entity.pull.op
    assert.strictEqual(ops.patch, undefined)
    assert.strictEqual(ops.update.name, 'update')
    assert.deepStrictEqual(ops.update.points.map((p: any) => [p.method, p.orig]), [
      ['PATCH', '/pulls/{id}'],
      ['PUT', '/pulls/{id}/merge'],
    ])
  })

  test('keeps PATCH as patch beside a real update', async () => {
    const ctx = makeCtx('pull', { patch: { method: 'PATCH' }, update: { method: 'PUT' } })
    await operationTransform(ctx)
    const ops = ctx.apimodel.main[KIT].entity.pull.op
    assert.strictEqual(ops.update.points[0].method, 'PUT')
    assert.strictEqual(ops.patch.points[0].method, 'PATCH')
  })

})


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
