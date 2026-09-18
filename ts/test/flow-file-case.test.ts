/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */

import { test, describe } from 'node:test'
import assert from 'node:assert'

import { flowFileBases } from '../dist/builder/flow'



describe('flow-file-case', () => {

  test('leaves names that do not collide alone', () => {
    const base = flowFileBases(['BasicAccountFlow', 'BasicCheckFlow'])
    assert.deepEqual(base, {
      BasicAccountFlow: 'BasicAccountFlow',
      BasicCheckFlow: 'BasicCheckFlow',
    })
  })

  test('suffixes every member of a case-colliding group', () => {
    const base = flowFileBases(['BasicStaticIpFlow', 'BasicStaticIPFlow'])

    // Neither keeps the bare name: a bare name is what gets overwritten.
    assert.equal(base.BasicStaticIPFlow, 'BasicStaticIPFlow__1')
    assert.equal(base.BasicStaticIpFlow, 'BasicStaticIpFlow__2')

    const files = Object.values(base).map(f => f.toLowerCase())
    assert.equal(new Set(files).size, files.length)
  })

  test('is stable whatever order the flows arrive in', () => {
    const one = flowFileBases(['BasicStaticIpFlow', 'BasicStaticIPFlow'])
    const two = flowFileBases(['BasicStaticIPFlow', 'BasicStaticIpFlow'])
    assert.deepEqual(one, two)
  })

  test('handles a group of more than two', () => {
    const base = flowFileBases(['BasicABFlow', 'BasicAbFlow', 'BasicaBFlow'])
    const files = Object.values(base).map(f => f.toLowerCase())
    assert.equal(new Set(files).size, 3)
    assert.equal(Object.values(base).filter(f => !f.includes('__')).length, 0)
  })

})
