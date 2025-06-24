/* Copyright (c) 2024 Voxgig Ltd, MIT License */


import { test, describe } from 'node:test'
import { expect } from '@hapi/code'

import { Aontu } from 'aontu'


// import { cmp, each, Project, Folder, File, Code } from 'jostraca'

import {
  ApiDef
} from '../'



describe('apidef', () => {

  test('happy', async () => {
    expect(ApiDef).exist()
  })


  test('api-statuspage', async () => {
    try {
      let outprefix = 'statuspage-1.0.0-20241218-'

      const build = await ApiDef.makeBuild({
        folder: __dirname + '/../test/api',
        debug: 'debug',
        outprefix,
      })

      const modelSrc = `
# apidef test: ${outprefix}

@"@voxgig/apidef/model/apidef.jsonic"

def: '${outprefix}def.json'
`

      console.log('MODELSRC', modelSrc)

      const model = Aontu(modelSrc).gen()

      // console.dir(model, { depth: null })

      const buildspec = {
        spec: {
          base: __dirname + '/../test/api'
        }
      }

      await build(model, buildspec, {})
    }
    catch (err: any) {
      console.log(err)
      throw err
    }
  })

})
