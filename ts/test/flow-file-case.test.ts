/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */

import { test, describe } from 'node:test'
import assert from 'node:assert'

import { flowFileBases } from '../dist/builder/flow'


// FLOW FILE NAMES ON A CASE-INSENSITIVE FILESYSTEM.
//
// Flow names are camel case built from the entity name, so entities whose
// names differ only in where the underscores fall produce flow names that
// differ only in case. checkly's spec carries `StaticIP` and `StaticIp`,
// which become the entities `static_i_p` and `static_ip` and the flows
// `BasicStaticIPFlow` and `BasicStaticIpFlow`.
//
// APFS and NTFS treat those as ONE file. The second write replaced the
// first, flow-index.aon imported both names into the same content, and the
// model came out with 113 flows for 114 entities — surfacing much later as
// `getModelPath: path not found at 'main.kit.flow.BasicStaticIPFlow'` from
// the go test template, which says nothing about the overwritten file.

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
