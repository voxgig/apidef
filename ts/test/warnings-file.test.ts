/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */

import { test, describe } from 'node:test'
import assert from 'node:assert'

import { warningsFileText } from '../dist/apidef'



describe('warnings file', () => {

  test('carries no timestamp', () => {
    const text = warningsFileText([
      { point: 'warning', when: 1789167378038, note: 'no paths for X' },
      { point: 'warning', when: 1789167378041, note: 'no paths for Y' },
    ])

    assert.ok(!text.includes('when'), 'the file still carries `when`:\n' + text)
    assert.ok(!/\b17891673780\d\d\b/.test(text),
      'the file still carries a timestamp value:\n' + text)
  })


  // THE SAME WARNINGS MUST PRODUCE THE SAME BYTES, which is the whole point:
  // a regeneration that changed nothing has to leave the file alone.
  test('is stable across runs', () => {
    const history = () => [
      { point: 'warning', when: Date.now(), note: 'no paths for X' },
    ]

    assert.equal(warningsFileText(history()), warningsFileText(history()))
  })


  // Everything else survives — the file exists to say WHICH warnings there
  // are, and dropping the clock must not drop the content with it.
  test('keeps every other field', () => {
    const text = warningsFileText([
      { point: 'warning', when: 1, note: 'no paths for X', entm: { name: 'X' } },
    ])

    assert.ok(text.includes('no paths for X'), text)
    assert.ok(text.includes('"X"'), text)
    assert.ok(text.includes('warning'), text)
  })

})
