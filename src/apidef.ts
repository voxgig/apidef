/* Copyright (c) 2024 Voxgig, MIT License */

import * as Fs from 'node:fs'
import Path from 'node:path'
import { inspect } from 'node:util'

import { bundleFromString, createConfig } from '@redocly/openapi-core'
import { FSWatcher } from 'chokidar'
import { Aontu, Context } from 'aontu'

import { prettyPino, Pino } from '@voxgig/util'


import {
  resolveTransforms,
  processTransforms,
  fixName,
} from './transform'


type ApiDefOptions = {
  def?: string
  fs?: any
  pino?: ReturnType<typeof Pino>
  debug?: boolean | string
  folder?: string
  meta?: Record<string, any>
}




function ApiDef(opts: ApiDefOptions) {
  const fs = opts.fs || Fs
  const pino = prettyPino('apidef', opts)

  const log = pino.child({ cmp: 'apidef' })


  async function generate(spec: any) {
    const start = Date.now()

    const buildspec = spec.build.spec

    let defpath = spec.model.def

    // TOOD: defpath should be independently defined
    defpath = Path.join(buildspec.base, '..', 'def', defpath)

    log.info({
      point: 'generate-start',
      note: defpath.replace(process.cwd(), '.'), defpath, start
    })

    // TODO: Validate spec
    const ctx = {
      log,
      spec,
      opts,
      util: { fixName },
      defpath: Path.dirname(defpath),
      model: spec.model
    }

    const transformSpec = await resolveTransforms(ctx)

    log.debug({
      point: 'transform', spec: transformSpec,
      note: log.levelVal <= 20 ? inspect(transformSpec) : ''
    })


    let source
    try {
      source = fs.readFileSync(defpath, 'utf8')
    }
    catch (err: any) {
      log.error({ read: 'fail', what: 'def', file: defpath, err })
      throw err
    }


    const config = await createConfig({})
    let bundle

    try {
      bundle = await bundleFromString({
        source,
        config,
        dereference: true,
      })
    }
    catch (err: any) {
      log.error({ parse: 'fail', what: 'openapi', file: defpath, err })
      throw err
    }


    const apimodel = {
      main: {
        api: {
          entity: {}
        },
        def: {},
      },
    }

    const def = bundle.bundle.parsed
    const processResult = await processTransforms(ctx, transformSpec, apimodel, def)

    if (!processResult.ok) {
      log.error({
        fail: 'process', point: 'transform-result',
        result: processResult, note: processResult.msg,
        err: processResult.results[0]?.err
      })

      return { ok: false, processResult }
    }

    const modelapi = { main: { api: apimodel.main.api } }
    let modelSrc = JSON.stringify(modelapi, null, 2)

    modelSrc =
      '# GENERATED FILE - DO NOT EDIT\n\n' +
      modelSrc.substring(1, modelSrc.length - 1).replace(/\n  /g, '\n')

    const modelPath = Path.normalize(spec.config.model)
    // console.log('modelPath', modelPath)
    writeChanged('api-model', modelPath, modelSrc)

    const modelBasePath = Path.dirname(modelPath)
    const defFilePath = Path.join(modelBasePath, 'def-generated.jsonic')

    const modelDef = { main: { def: apimodel.main.def } }
    let modelDefSrc = JSON.stringify(modelDef, null, 2)

    modelDefSrc =
      '# GENERATED FILE - DO NOT EDIT\n\n' +
      modelDefSrc.substring(1, modelDefSrc.length - 1).replace(/\n  /g, '\n')

    writeChanged('def-model', defFilePath, modelDefSrc)

    log.info({ point: 'generate-end', note: 'success', break: true })

    return {
      ok: true,
      apimodel,
    }
  }


  function writeChanged(point: string, path: string, content: string) {
    let exists = false
    let changed = false
    let action = ''
    try {
      let existingContent: string = ''
      path = Path.normalize(path)

      exists = fs.existsSync(path)

      if (exists) {
        action = 'read'
        existingContent = fs.readFileSync(path, 'utf8')
      }

      changed = existingContent !== content

      // console.log('WC', changed, path, existingContent, content)

      log.info({
        point: 'write-' + point,
        note: (changed ? '' : 'not-') + 'changed ' + path,
        write: 'file', skip: !changed, exists, changed,
        contentLength: content.length, file: path
      })

      if (changed) {
        action = 'write'
        fs.writeFileSync(path, content)
      }
    }
    catch (err: any) {
      log.error({
        fail: action, point, file: path, exists, changed,
        contentLength: content.length, err
      })
      err.__logged__ = true
      throw err
    }
  }


  /*
    async function resolveGuide(spec: any, _opts: any) {
      if (null == spec.guide) {
        spec.guide = spec.def + '-guide.jsonic'
      }
  
      const path = Path.normalize(spec.guide)
      let src: string
  
      let action = ''
      let exists = false
      try {
  
        action = 'exists'
        let exists = fs.existsSync(path)
  
        log.debug({ read: 'file', what: 'guide', file: path, exists })
  
        if (exists) {
          action = 'read'
          src = fs.readFileSync(path, 'utf8')
        }
        else {
          src = `
  # API Specification Transform Guide
  
  @"@voxgig/apidef/model/guide.jsonic"
  
  guide: entity: {
  
  }
  
  guide: control: transform: openapi: order: \`
    top,
    entity,
    operation,
    field,
    manual,
    \`
  
  `
          action = 'write'
          fs.writeFileSync(path, src)
        }
      }
      catch (err: any) {
        log.error({ fail: action, what: 'guide', file: path, exists, err })
        throw err
      }
  
      const aopts = { path }
      const root = Aontu(src, aopts)
      const hasErr = root.err && 0 < root.err.length
  
      if (hasErr) {
        for (let serr of root.err) {
          let err: any = new Error('Guide model: ' + serr.msg)
          err.cause$ = [serr]
  
          if ('syntax' === serr.why) {
            err.uxmsg$ = true
          }
  
          log.error({ fail: 'parse', point: 'guide-parse', file: path, err })
  
          if (err.uxmsg$) {
            return
          }
          else {
            err.rooterrs$ = root.err
            throw err
          }
        }
      }
  
      let genctx = new Context({ root })
      const guide = spec.guideModel = root.gen(genctx)
  
      // TODO: collect all errors
      if (genctx.err && 0 < genctx.err.length) {
        const err: any = new Error('Guide build error:\n' +
          (genctx.err.map((pe: any) => pe.msg)).join('\n'))
        log.error({ fail: 'build', what: 'guide', file: path, err })
        err.errs = () => genctx.err
        throw err
      }
  
      const pathParts = Path.parse(path)
      spec.guideModelPath = Path.join(pathParts.dir, pathParts.name + '.json')
  
      const updatedSrc = JSON.stringify(guide, null, 2)
  
      writeChanged('guide-model', spec.guideModelPath, updatedSrc)
  
      return guide
    }
  */

  return {
    // watch,
    generate,
  }
}



ApiDef.makeBuild = async function(opts: ApiDefOptions) {
  let apidef: any = undefined

  const config = {
    def: opts.def || 'no-def',
    kind: 'openapi3',
    model: opts.folder ? (opts.folder + '/api-generated.jsonic') : 'no-model',
    meta: opts.meta || {},
  }

  const build = async function(model: any, build: any, ctx: any) {
    // console.log('APIDEF build')
    // console.dir(ctx, { depth: null })
    // console.dir(build, { depth: null })


    if (null == apidef) {
      apidef = ApiDef({
        ...opts,
        pino: build.log,
      })
    }

    await apidef.generate({ model, build, config })
  }

  build.step = 'pre'

  return build
}




export type {
  ApiDefOptions,
  // ApiDefSpec,
}


export {
  ApiDef,
}
