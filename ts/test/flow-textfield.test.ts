/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */

import { test, describe } from 'node:test'
import assert from 'node:assert'

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
    const tf = step?.input?.textfield
    if (null != tf) {
      return tf
    }
  }
}


// One CRUD entity whose alphabetically-first string field is the one under
// test, so the walk reaches it before `kind`.
function entityWith(first: any) {
  const point = (orig: string, method: string) => ({
    orig, method, kind: 'json',
    args: { params: [{ kind: 'param', name: 'id', reqd: true, type: '`$STRING`' }] },
  })

  return {
    name: 'planet',
    fields: [
      { name: 'diameter', type: '`$NUMBER`', req: true },
      first,
      { name: 'id', type: '`$STRING`', req: true },
      { name: 'kind', type: '`$STRING`', req: true },
      { name: 'name', type: '`$STRING`', req: true },
    ],
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

  test('a readOnly field is not the one the flow marks', async () => {
    const entity = entityWith(
      { name: 'forbidReason', type: '`$STRING`', req: false, readOnly: true })

    const flow = await runFlowstep(entity)

    assert.strictEqual(markedField(flow), 'kind',
      'the walk must pass over the readOnly field and take the next writable one')
  })


  test('a writable field in the same position is chosen', async () => {
    const entity = entityWith(
      { name: 'forbidReason', type: '`$STRING`', req: false })

    const flow = await runFlowstep(entity)

    assert.strictEqual(markedField(flow), 'forbidReason')
  })


  // Every string field being readOnly leaves nothing to mark, and that has to
  // be an absent textfield rather than a readOnly one.
  test('no writable text field leaves the flow without one', async () => {
    const entity = entityWith(
      { name: 'forbidReason', type: '`$STRING`', req: false, readOnly: true })
    for (const f of entity.fields) {
      if ('`$STRING`' === f.type && 'id' !== f.name) {
        (f as any).readOnly = true
      }
    }

    const flow = await runFlowstep(entity)

    assert.strictEqual(markedField(flow), undefined)
  })

})
