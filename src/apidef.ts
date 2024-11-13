/* Copyright (c) 2024 Voxgig, MIT License */

import * as Fs from 'node:fs'
import Path from 'node:path'


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
  const pino = prettyPino('apidef', opts)

  const log = pino.child({ cmp: 'apidef' })


  async function watch(spec: any) {
    log.info({ point: 'watch-start' })
    log.debug({ point: 'watch-spec', spec })

    await generate(spec)

    const fsw = new FSWatcher()

    fsw.on('change', (...args: any[]) => {
      log.trace({ watch: 'change', file: args[0] })
      generate(spec)
    })

    log.trace({ watch: 'add', what: 'def', file: spec.def })
    fsw.add(spec.def)

    log.trace({ watch: 'add', what: 'guide', file: spec.guilde })
    fsw.add(spec.guide)
  }


  async function generate(spec: ApiDefSpec) {
    const start = Date.now()

    // TODO: validate spec

    const defpath = Path.normalize(spec.def)

    log.info({ point: 'generate-start', note: 'defpath', defpath, start })
    log.debug({ point: 'generate-spec', spec })

    // TODO: Validate spec
    const ctx = {
      log,
      spec,
      guide: {},
      opts,
      util: { fixName },
      defpath: Path.dirname(defpath)
    }



    const guide = await resolveGuide(spec, opts)

    if (null == guide) {
      return
    }


    log.debug({ point: 'guide', guide })

    ctx.guide = guide
    const transformSpec = await resolveTransforms(ctx)
    log.debug({ point: 'transform', spec: transformSpec })


    let source
    try {
      source = fs.readFileSync(spec.def, 'utf8')
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
      const processResult = await processTransforms(ctx, transformSpec, model, def)

      if (!processResult.ok) {
        log.error({ process: 'fail', what: 'transform', result: processResult })
        throw new Error('Transform failed: ' + processResult.msg)
      }
      else {
        log.debug({ process: 'result', what: 'transform', result: processResult })
      }
    }
    catch (err: any) {
      log.error({ process: 'fail', what: 'transform', err })
      throw err
    }

    const modelapi = { main: { api: model.main.api } }
    let modelSrc = JSON.stringify(modelapi, null, 2)
    modelSrc = modelSrc.substring(1, modelSrc.length - 1)

    writeChanged('api-model', spec.model, modelSrc)


    const modelBasePath = Path.dirname(spec.model)
    const defFilePath = Path.join(modelBasePath, 'def.jsonic')

    const modelDef = { main: { def: model.main.def } }
    let modelDefSrc = JSON.stringify(modelDef, null, 2)
    modelDefSrc = modelDefSrc.substring(1, modelDefSrc.length - 1)

    writeChanged('def-model', defFilePath, modelDefSrc)

    log.info({ point: 'generate-end', note: 'success', break: true })

    return {
      ok: true,
      model,
    }
  }



  function writeChanged(what: string, path: string, content: string) {
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

      log.info({
        point: 'write-' + what,
        note: 'changed,file',
        write: 'file', what, skip: !changed, exists, changed,
        contentLength: content.length, file: path
      })

      if (changed) {
        action = 'write'
        fs.writeFileSync(path, content)
      }
    }
    catch (err: any) {
      log.error({
        fail: action, what, file: path, exists, changed,
        contentLength: content.length, err
      })
      throw err
    }
  }



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
