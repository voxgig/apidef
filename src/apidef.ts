/* Copyright (c) 2024 Voxgig, MIT License */

import * as Fs from 'node:fs'
import Path from 'node:path'


import { bundleFromString, createConfig } from '@redocly/openapi-core'
import { FSWatcher } from 'chokidar'
import { Aontu, Context } from 'aontu'
import Pino from 'pino'
import PinoPretty from 'pino-pretty'




import {
  resolveTransforms,
  processTransforms,
  fixName,
} from './transform'


type ApiDefOptions = {
  fs?: any
  pino?: ReturnType<typeof Pino>
  debug?: boolean | string
}


type ApiDefSpec = {
  def: string
  model: string,
  kind: string,
  meta: Record<string, any>,
}


function ApiDef(opts: ApiDefOptions = {}) {
  const fs = opts.fs || Fs
  let pino = opts.pino

  if (null == pino) {
    let pretty = PinoPretty({ sync: true })
    pino = Pino({
      name: 'apidef',
      level: null == opts.debug ? 'info' :
        true === opts.debug ? 'debug' :
          'string' == typeof opts.debug ? opts.debug :
            'info'
    },
      pretty
    )
  }


  const log = pino.child({ cmp: 'apidef' })

  async function watch(spec: any) {
    await generate(spec)

    const fsw = new FSWatcher()

    fsw.on('change', (...args: any[]) => {
      // console.log('APIDEF CHANGE', args)
      generate(spec)
    })

    // console.log('APIDEF-WATCH', spec.def)
    fsw.add(spec.def)

    // console.log('APIDEF-WATCH', spec.guide)
    fsw.add(spec.guide)
  }


  async function generate(spec: ApiDefSpec) {
    const start = Date.now()

    log.info({ point: 'generate-start' })
    log.debug({ point: 'generate-spec', spec })

    // TODO: Validate spec
    const ctx = {
      spec,
      guide: {},
      opts,
      util: { fixName },
      defpath: Path.dirname(spec.def)
    }

    if (opts.debug) {
      // console.log('@voxgig/apidef =============', start, new Date(start))
      // console.dir(spec, { depth: null })
    }

    const guide = await resolveGuide(spec, opts)
    console.log('APIDEF.guide')
    // console.dir(guide, { depth: null })



    ctx.guide = guide
    const transformSpec = await resolveTransforms(ctx)
    // console.log('APIDEF.transformSpec', transformSpec)


    const source = fs.readFileSync(spec.def, 'utf8')

    const modelBasePath = Path.dirname(spec.model)

    const config = await createConfig({})
    const bundle = await bundleFromString({
      source,
      config,
      dereference: true,
    })

    const model = {
      main: {
        api: {
          entity: {}
        },
        def: {},
      },
    }

    try {
      const def = bundle.bundle.parsed
      // console.dir(def, { depth: null })

      const processResult = await processTransforms(ctx, transformSpec, model, def)
      // console.log('APIDEF.processResult', processResult)

      // console.log('APIDEF.model')
      // console.dir(model, { depth: null })
    }
    catch (err: any) {
      // console.log('APIDEF ERROR', err)
      throw err
    }

    const modelapi = { main: { api: model.main.api } }
    let modelSrc = JSON.stringify(modelapi, null, 2)
    modelSrc = modelSrc.substring(1, modelSrc.length - 1)

    /*
    // console.log('WRITE', spec.model)
    fs.writeFileSync(
      spec.model,
      modelSrc
    )
    */

    writeChanged(spec.model, modelSrc)

    const defFilePath = Path.join(modelBasePath, 'def.jsonic')

    const modelDef = { main: { def: model.main.def } }
    let modelDefSrc = JSON.stringify(modelDef, null, 2)
    modelDefSrc = modelDefSrc.substring(1, modelDefSrc.length - 1)

    let existingSrc: string = ''
    if (fs.existsSync(defFilePath)) {
      existingSrc = fs.readFileSync(defFilePath, 'utf8')
    }

    let writeModelDef = existingSrc !== modelDefSrc
    // console.log('APIDEF', writeModelDef)

    // Only write the model def if it has changed
    if (writeModelDef) {
      fs.writeFileSync(
        defFilePath,
        modelDefSrc
      )
    }


    return {
      ok: true,
      model,
    }
  }



  function writeChanged(path: string, content: string) {
    let existingContent: string = ''

    if (fs.existsSync(path)) {
      existingContent = fs.readFileSync(path, 'utf8')
    }

    let writeFile = existingContent !== content

    if (writeFile) {
      // console.log('WRITE-CHANGE: YES', path)
      fs.writeFileSync(path, content)
    }
    else {
      // console.log('WRITE-CHANGE: NO', path)
    }
  }



  async function resolveGuide(spec: any, _opts: any) {
    if (null == spec.guide) {
      spec.guide = spec.def + '-guide.jsonic'
    }

    const path = Path.normalize(spec.guide)
    let src: string

    // console.log('APIDEF resolveGuide', path)

    if (fs.existsSync(path)) {
      src = fs.readFileSync(path, 'utf8')
    }
    else {
      src = `
# API Specification Transform Guide

@"@voxgig/apidef/model/guide.jsonic"

guide: entity: {

}

`
      fs.writeFileSync(path, src)
    }


    // console.log('GUIDE SRC', src)

    const aopts = {}
    const root = Aontu(src, aopts)
    const hasErr = root.err && 0 < root.err.length

    // TODO: collect all errors
    if (hasErr) {
      // console.log('RESOLVE-GUIDE PARSE', root.err)
      throw root.err[0].err
    }

    let genctx = new Context({ root })
    const guide = spec.guideModel = root.gen(genctx)

    // TODO: collect all errors
    if (genctx.err && 0 < genctx.err.length) {
      // console.log('RESOLVE-GUIDE GEN', genctx.err)
      throw new Error(JSON.stringify(genctx.err[0]))
    }

    // console.log('GUIDE')
    // console.dir(guide, { depth: null })

    const pathParts = Path.parse(path)
    spec.guideModelPath = Path.join(pathParts.dir, pathParts.name + '.json')

    const updatedSrc = JSON.stringify(guide, null, 2)

    // console.log('APIDEF resolveGuide write', spec.guideModelPath, src !== updatedSrc)
    let existingSrc = ''
    if (fs.existsSync(spec.guideModelPath)) {
      existingSrc = fs.readFileSync(spec.guideModelPath, 'utf8')
    }

    if (existingSrc !== updatedSrc) {
      fs.writeFileSync(spec.guideModelPath, updatedSrc)
    }

    return guide
  }


  return {
    watch,
    generate,
  }
}




export type {
  ApiDefOptions,
}


export {
  ApiDef,
}
