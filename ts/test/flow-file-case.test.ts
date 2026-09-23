/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */

import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import { test, describe } from 'node:test'
import assert from 'node:assert'

import Pino from 'pino'
import { Jostraca, Project } from 'jostraca'

import { flowFileBases, makeFlowBuilder } from '../dist/builder/flow'
import { makeWarner } from '../dist/utility'



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

  test('the builder writes each member of a colliding group to its own file', async () => {
    const folder = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-flow-case-'))
    try {
      const log: any = Pino({ level: 'silent' })
      const warn = makeWarner({ point: 'warning', log })
      const flow = { BasicStaticIpFlow: { name: 'BasicStaticIpFlow' },
        BasicStaticIPFlow: { name: 'BasicStaticIPFlow' } }
      const builder = await makeFlowBuilder({
        apimodel: { main: { kit: { flow } } },
        opts: { folder, outprefix: 'x-' },
        warn,
      } as any)

      await Jostraca({ now: () => 1, fs: () => Fs, log }).generate({
        folder, model: {}, existing: { txt: { write: true, merge: false } },
      }, () => Project({ folder: '.' }, () => builder()))

      const flowdir = Path.join(folder, 'flow')
      assert.deepEqual(Fs.readdirSync(flowdir).sort(), [
        'x-BasicStaticIPFlow__1.aontu', 'x-BasicStaticIpFlow__2.aontu', 'x-flow-index.aontu',
      ])
      assert.equal(Fs.readFileSync(Path.join(flowdir, 'x-flow-index.aontu'), 'utf8'), [
        '# Flows\n',
        '@"./x-BasicStaticIPFlow__1.aontu"',
        '@"./x-BasicStaticIpFlow__2.aontu"',
      ].join('\n'))
      assert.ok(Fs.readFileSync(Path.join(flowdir, 'x-BasicStaticIpFlow__2.aontu'), 'utf8')
        .includes('main: kit: flow: BasicStaticIpFlow:'))

      assert.deepEqual(warn.history.map((w: any) => w.note), [
        'flow name BasicStaticIPFlow collides with another when case is ignored:' +
        ' file written as BasicStaticIPFlow__1.aontu',
        'flow name BasicStaticIpFlow collides with another when case is ignored:' +
        ' file written as BasicStaticIpFlow__2.aontu',
      ])
    }
    finally {
      Fs.rmSync(folder, { recursive: true, force: true })
    }
  })

})
