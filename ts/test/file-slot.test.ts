/* Copyright (c) 2026 Voxgig Ltd, MIT License */

import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import { test, describe, after } from 'node:test'
import assert from 'node:assert'

import { ApiDef } from '../dist/apidef'


const DEF = 'file-slot-def.json'

const HEAD = [
  '@"@voxgig/apidef/model/guide.aontu"',
  '@"./base-guide.aontu"',
  '',
].join('\n')


const staged: string[] = []


async function build(entry: string): Promise<{ bres: any, base: string }> {
  const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-file-slot-'))
  staged.push(dir)
  const folder = Path.join(dir, 'model')
  Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true })
  Fs.mkdirSync(Path.join(dir, 'def'))
  Fs.copyFileSync(Path.join(__dirname, '..', 'test', 'def', DEF), Path.join(dir, 'def', DEF))
  Fs.writeFileSync(Path.join(folder, 'guide', 'guide.aontu'), HEAD + entry)

  const run = await ApiDef.makeBuild({ folder })
  const bres = await run({ name: 'file-slot', def: DEF }, {
    spec: {
      base: folder,
      buildargs: {
        apidef: {
          ctrl: {
            step: {
              parse: true, guide: true, transformers: true,
              builders: false, generate: false,
            }
          }
        }
      }
    }
  }, {})
  assert.strictEqual(bres.ok, true, String(bres.err?.message))
  return { bres, base: Fs.readFileSync(Path.join(folder, 'guide', 'base-guide.aontu'), 'utf8') }
}


function point(bres: any, entity: string, method: string, path: string): any {
  return Object.values(bres.apimodel.main.kit.entity[entity].op)
    .flatMap((op: any) => op.points)
    .find((p: any) => method === p.m && path === p.o)
}


function headers(p: any): Record<string, boolean> {
  return Object.fromEntries((p.g.header ?? []).map((arg: any) => [arg.n, false !== arg.a]))
}


describe('file-slot', () => {

  after(() => {
    for (const dir of staged) {
      Fs.rmSync(dir, { recursive: true, force: true })
    }
  })


  test('binary-points', async () => {
    const { bres, base } = await build('guide: {}\n')
    const audio = '/tracks/{track_id}/audio'
    assert.deepStrictEqual(point(bres, 'track', 'GET', audio).bn,
      { field: 'audio', head: true, max: 4194304 })
    assert.deepStrictEqual(point(bres, 'track', 'PUT', audio).bn, { field: 'audio', max: 4194304 })
    assert.strictEqual(point(bres, 'track', 'GET', '/tracks/{track_id}/cover').bn, undefined)
    assert.strictEqual(point(bres, 'track_lyric', 'GET', '/tracks/{track_id}/lyrics').bn, undefined)
    assert.strictEqual(point(bres, 'upload', 'PATCH', '/uploads/{upload_id}').bn, undefined)
    assert.ok(Object.values(bres.apimodel.main.kit.entity.track.op)
      .flatMap((op: any) => op.points).every((p: any) => 'HEAD' !== p.m))

    assert.match(base, /\n +action: "audio": binary: field: \*"audio"\|top\n/)
    assert.match(base, /\n +action: "audio": binary: head: \*true\n/)
    assert.match(base, /\n +action: "audio": binary: max: \*4194304\|top\n/)
    assert.match(base, /\n +action: "cover": binary: active: \*false\n/)
  })


  test('binary-guide', async () => {
    const audio = '/tracks/{track_id}/audio'
    const entry = (facts: string) =>
      'guide: entity: track: path: "' + audio + '": action: "audio": binary: ' + facts + '\n'

    const refused = (await build(entry('{ field: false, head: false, max: false }'))).bres
    assert.strictEqual(point(refused, 'track', 'GET', audio).bn, undefined)

    const set = (await build(entry('{ field: "meta", max: 10 }'))).bres
    assert.deepStrictEqual(point(set, 'track', 'GET', audio).bn, { field: 'meta', head: true, max: 10 })

    const off = (await build(entry('active: false'))).bres
    assert.strictEqual(point(off, 'track', 'PUT', audio).bn, undefined)
  })


  test('sessions', async () => {
    const { bres, base } = await build('guide: {}\n')
    const kit = bres.apimodel.main.kit

    assert.deepStrictEqual(kit.entity.upload.session, { dialect: 'tus', append: 'update', offset: 'load' })
    const append = point(bres, 'upload', 'PATCH', '/uploads/{upload_id}')
    assert.deepStrictEqual(append.q.exist, ['id'])
    assert.deepStrictEqual(headers(append),
      { tus_resumable: false, upload_checksum: false, upload_offset: false, x_trace: true })

    assert.deepStrictEqual(kit.entity.draft.session, { dialect: 'ietf', append: 'update', offset: 'load' })
    const draft = point(bres, 'draft', 'PATCH', '/drafts/{draft_id}')
    assert.deepStrictEqual(draft.q.exist, ['id'])
    assert.deepStrictEqual(headers(draft), { upload_complete: false, upload_offset: false })

    assert.strictEqual(kit.entity.part.session, undefined)
    assert.deepStrictEqual(point(bres, 'part', 'PATCH', '/parts/{part_id}').q.exist, ['id', 'tus_resumable'])
    assert.strictEqual(kit.entity.track.session, undefined)

    assert.match(base, /\n  entity: upload: \{\n(.*\n)*? +session: dialect: \*"tus"\n/)
    assert.match(base, /\n  entity: part: \{\n(.*\n)*? +session: active: \*false\n/)
  })


  test('session-guide', async () => {
    const off = (await build('guide: entity: upload: session: active: false\n')).bres
    assert.strictEqual(off.apimodel.main.kit.entity.upload.session, undefined)
    assert.deepStrictEqual(point(off, 'upload', 'PATCH', '/uploads/{upload_id}').q.exist,
      ['id', 'tus_resumable', 'upload_offset'])

    const on = (await build('guide: entity: part: session: active: true\n')).bres
    assert.deepStrictEqual(on.apimodel.main.kit.entity.part.session,
      { dialect: 'tus', append: 'update', offset: 'load' })
    assert.deepStrictEqual(point(on, 'part', 'PATCH', '/parts/{part_id}').q.exist, ['id'])

    const slot = (await build(
      'guide: entity: upload: session: slot: { entity: "track", action: "audio" }\n')).bres
    assert.deepStrictEqual(slot.apimodel.main.kit.entity.upload.session,
      { dialect: 'tus', append: 'update', offset: 'load', slot: { entity: 'track', action: 'audio' } })
  })

})
