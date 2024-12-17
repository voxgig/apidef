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

      return { ok: false, name: 'apidef', processResult }
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
      name: 'apidef',
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

  return {
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

    if (null == apidef) {
      apidef = ApiDef({
        ...opts,
        pino: build.log,
      })
    }

    return await apidef.generate({ model, build, config })
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
