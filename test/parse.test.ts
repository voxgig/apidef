/* Copyright (c) 2024 Voxgig Ltd, MIT License */


import { test, describe } from 'node:test'
import { expect } from '@hapi/code'



// import { cmp, each, Project, Folder, File, Code } from 'jostraca'

import {
  parse
} from '../dist/parse'



describe('parse', () => {

  test('happy', async () => {
    expect(parse).exist()

    await expect(parse('not-a-kind', '')).reject(/unknown/)
    await expect(parse('OpenAPI', 'bad')).reject(/JSON/)
    await expect(parse('OpenAPI', undefined)).reject(/JSON/)
    await expect(parse('OpenAPI', '{}')).reject(/Unsupported/)
  })

})
