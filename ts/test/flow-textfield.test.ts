/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */

import { test, describe } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import Path from 'node:path'

import { flowstepTransform } from '../dist/transform/flowstep'



function runFlowstep(entity: any) {
  const flow = {
    name: 'Basic' + entity.name + 'Flow',
    entity: entity.name,
    kind: 'basic',
    step: [] as any[],
  }
  const apimodel = {
    main: {
      kit: {
        entity: { [entity.name]: entity },
        flow: { [flow.name]: flow },
      },
    },
  }
  const log = { debug: () => undefined }
  return flowstepTransform({ apimodel, guide: {}, log } as any).then(() => flow)
}


function markedField(flow: any) {
  for (const step of flow.step) {
    const tf = step?.i?.textfield
    if (null != tf) {
      return tf
    }
  }
}


// One CRUD entity whose alphabetically-first string field is the one under
// test, so the walk reaches it before `kind`.
function entityWith(first: any) {
  const point = (orig: string, method: string) => ({
    o: orig, m: method, k: 'http',
    g: { params: [{ k: 'param', n: 'id', r: true, t: '`$STRING`' }] },
  })

  return {
    name: 'planet',
    fields: Object.fromEntries([
      { n: 'diameter', t: '`$NUMBER`', r: true },
      first,
      { n: 'id', t: '`$STRING`', r: true },
      { n: 'kind', t: '`$STRING`', r: true },
      { n: 'name', t: '`$STRING`', r: true },
    ].map(f => [f.n, f])),
    id: { name: 'id', field: 'id' },
    op: {
      create: { name: 'create', points: [point('/api/planet', 'POST')] },
      list: { name: 'list', points: [point('/api/planet', 'GET')] },
      load: { name: 'load', points: [point('/api/planet/{id}', 'GET')] },
      update: { name: 'update', points: [point('/api/planet/{id}', 'PUT')] },
      remove: { name: 'remove', points: [point('/api/planet/{id}', 'DELETE')] },
    },
  }
}


describe('flow-textfield', () => {

  test('flow steps match the shared compact-key fixture', async () => {
    const fixture = JSON.parse(readFileSync(
      Path.join(__dirname, '..', 'test', 'flow-step.json'), 'utf8'))
    const flow = await runFlowstep(fixture.entity)
    assert.deepStrictEqual(flow.step, fixture.steps)
  })


  test('a readOnly field is not the one the flow marks', async () => {
    const entity = entityWith(
      { n: 'forbidReason', t: '`$STRING`', r: false, ro: true })

    const flow = await runFlowstep(entity)

    assert.strictEqual(markedField(flow), 'kind',
      'the walk must pass over the readOnly field and take the next writable one')
  })


  test('a writable field in the same position is chosen', async () => {
    const entity = entityWith(
      { n: 'forbidReason', t: '`$STRING`', r: false })

    const flow = await runFlowstep(entity)

    assert.strictEqual(markedField(flow), 'forbidReason')
  })


  // Every string field being readOnly leaves nothing to mark, and that has to
  // be an absent textfield rather than a readOnly one.
  test('no writable text field leaves the flow without one', async () => {
    const entity = entityWith(
      { n: 'forbidReason', t: '`$STRING`', r: false, ro: true })
    for (const f of Object.values(entity.fields) as any[]) {
      if ('`$STRING`' === f.t && 'id' !== f.n) {
        (f as any).ro = true
      }
    }

    const flow = await runFlowstep(entity)

    assert.strictEqual(markedField(flow), undefined)
  })

})
