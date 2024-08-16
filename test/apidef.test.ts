
import { test, describe } from 'node:test'
import { expect } from '@hapi/code'

import { memfs } from 'memfs'


// import { cmp, each, Project, Folder, File, Code } from 'jostraca'

import {
  ApiDef
} from '../'



describe('apidef', () => {

  test('happy', async () => {
    expect(ApiDef).exist()

    // const { fs, vol } = memfs({})
    // expect(vol.toJSON()).equal({})
  })

})


