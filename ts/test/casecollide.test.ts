/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */

import { test, describe } from 'node:test'
import assert from 'node:assert'

import { casecollideTransform } from '../dist/transform/casecollide'


// TWO ENTITY NAMES THAT DIFFER ONLY IN CASE ARE ONE FILE.
//
// Generators name files after the entity's camel form, and APFS and NTFS
// treat `OptOutEntity.ts` and `OptoutEntity.ts` as the same file. Customer.io's
// App API produced `opt_out` (from the schema) and `optout` (from the
// `/v1/optouts` path segment) for one resource, and tsc stopped the build:
// "File name ... differs from already included file name ... only in casing."

function run(entity: any, guide?: any) {
  const logged: any[] = []
  const ctx = {
    apimodel: { main: { kit: { entity } } },
    guide: guide || { entity: {} },
    log: {
      info: (e: any) => logged.push({ level: 'info', ...e }),
      warn: (e: any) => logged.push({ level: 'warn', ...e }),
      debug: () => undefined,
    },
  }
  return casecollideTransform(ctx as any).then(() => ({ ctx, logged }))
}

describe('casecollide', () => {

  // An op whose body is EMPTY does not survive cleanTransform, so it is not
  // an operation as far as the generated SDK is concerned. The fixtures below
  // give each surviving op a real body for that reason.
  test('drops the colliding entity that has no operations', async () => {
    const { ctx, logged } = await run({
      opt_out: { name: 'opt_out', op: { list: { method: 'GET' }, update: { method: 'PUT' } } },
      optout: { name: 'optout', op: {} },
      other: { name: 'other', op: { list: { method: 'GET' } } },
    }, { entity: { opt_out: {}, optout: {}, other: {} } })

    assert.deepEqual(
      Object.keys((ctx.apimodel.main.kit as any).entity).sort(),
      ['opt_out', 'other'])

    // The guide loses it too, or flow generation would still see it.
    assert.deepEqual(Object.keys(ctx.guide.entity).sort(), ['opt_out', 'other'])

    const drop = logged.find(l => 'entity-case-collision-drop' === l.point)
    assert.equal(drop.entity, 'optout')
    assert.deepEqual(drop.kept, ['opt_out'])
  })

  test('keeps both when both carry operations, and warns', async () => {
    const { ctx, logged } = await run({
      opt_out: { name: 'opt_out', op: { list: { method: 'GET' } } },
      optout: { name: 'optout', op: { load: { method: 'GET' } } },
    })

    // Dropping either would remove operations from the SDK — worse than a
    // build that fails loudly.
    assert.deepEqual(
      Object.keys((ctx.apimodel.main.kit as any).entity).sort(),
      ['opt_out', 'optout'])

    const warn = logged.find(l => 'entity-case-collision' === l.point)
    assert.equal(warn.level, 'warn')
    assert.deepEqual(warn.entity, ['opt_out', 'optout'])
  })

  test('leaves an op-less entity alone when nothing collides with it', async () => {
    const { ctx, logged } = await run({
      thing: { name: 'thing', op: { list: { method: 'GET' } } },
      spare: { name: 'spare', op: {} },
    })

    // Entities with no operations are NOT this transform's business — only
    // ones that collide. Removing them generally is a separate question.
    assert.deepEqual(
      Object.keys((ctx.apimodel.main.kit as any).entity).sort(),
      ['spare', 'thing'])
    assert.equal(logged.length, 0)
  })

  test('a group of three keeps every entity that has operations', async () => {
    const { ctx } = await run({
      opt_out: { name: 'opt_out', op: { list: { method: 'GET' } } },
      optout: { name: 'optout', op: {} },
      Opt_Out: { name: 'Opt_Out', op: {} },
    })

    assert.deepEqual(Object.keys((ctx.apimodel.main.kit as any).entity), ['opt_out'])
  })

  test('an op whose body is empty is not an operation', async () => {
    // cleanTransform strips empty nodes at the end of the pipeline, so an
    // entity whose ops are all empty reaches the SDK with no methods.
    // Counting op KEYS reported customerio's `optout` as carrying two
    // operations when it carried none.
    const { ctx } = await run({
      opt_out: { name: 'opt_out', op: { list: { method: 'GET' } } },
      optout: { name: 'optout', op: { list: {}, update: { args: {} } } },
    })

    assert.deepEqual(Object.keys((ctx.apimodel.main.kit as any).entity), ['opt_out'])
  })

})
