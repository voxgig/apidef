/* Copyright (c) 2024 Voxgig, MIT License */

import * as Fs from 'node:fs'
import Path from 'node:path'
import { inspect } from 'node:util'

import { bundleFromString, createConfig } from '@redocly/openapi-core'
import { Gubu, Open, Any } from 'gubu'
import { each } from 'jostraca'
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
  outprefix?: string
}


type ApiModel = {
  main: {
    api: {
      entity: Record<string, any>
    }
    def: Record<string, any>
  }
}


const ModelShape = Gubu({
  def: String,
  main: {
    guide: {},
    sdk: {},
    def: {},
    api: {},
  }
})
const OpenModelShape = Gubu(Open(ModelShape))

type Model = ReturnType<typeof ModelShape>


const BuildShape = Gubu({
  spec: {
    base: '',
    path: '',
    debug: '',
    use: {},
    res: [],
    require: '',
    log: {},
    fs: Any()
  }
})
const OpenBuildShape = Gubu(Open(BuildShape))

type Build = ReturnType<typeof BuildShape>



function ApiDef(opts: ApiDefOptions) {
  const fs = opts.fs || Fs
  const pino = prettyPino('apidef', opts)

  const log = pino.child({ cmp: 'apidef' })


  async function generate(spec: any) {
    const start = Date.now()

    const model: Model = OpenModelShape(spec.model)
    const build: Build = OpenBuildShape(spec.build)

    const buildspec = build.spec

    let defpath = model.def

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
      model,
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


    const apimodel: ApiModel = {
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


    const modelPath = Path.normalize(spec.config.model)

    buildModel_api(apimodel, modelPath)
    buildModel_def(apimodel, modelPath)
    buildModel_entity(apimodel, modelPath)

    log.info({ point: 'generate-end', note: 'success', break: true })

    return {
      ok: true,
      name: 'apidef',
      apimodel,
    }
  }


  function buildModel_api(apimodel: ApiModel, modelPath: string) {
    const modelapi = { main: { api: apimodel.main.api } }
    let modelSrc = JSON.stringify(modelapi, null, 2)

    modelSrc =
      '# GENERATED FILE - DO NOT EDIT\n\n' +
      modelSrc.substring(1, modelSrc.length - 1).replace(/\n  /g, '\n')


    // console.log('modelPath', modelPath)
    writeChanged('api-model', modelPath, modelSrc)
    return modelPath
  }


  function buildModel_def(apimodel: ApiModel, modelPath: string) {
    const modelBasePath = Path.dirname(modelPath)
    const defFilePath = Path.join(modelBasePath,
      (null == opts.outprefix ? '' : opts.outprefix) + 'def-generated.jsonic')

    const modelDef = { main: { def: apimodel.main.def } }
    let modelDefSrc = JSON.stringify(modelDef, null, 2)

    modelDefSrc =
      '# GENERATED FILE - DO NOT EDIT\n\n' +
      modelDefSrc.substring(1, modelDefSrc.length - 1).replace(/\n  /g, '\n')

    writeChanged('def-model', defFilePath, modelDefSrc)
  }


  function buildModel_entity(apimodel: ApiModel, modelPath: string) {
    const modelBasePath = Path.dirname(modelPath)

    const entityIncludes: string[] = []

    each(apimodel.main.api.entity, ((entity: any) => {
      entityIncludes.push(entity.name)

      // HEURISTIC: id may be name_id or nameId
      const fieldAliases =
        each(entity.op, (op: any) =>
          each(op.param))
          .flat()
          .reduce((a: any, p: any) =>

          (entity.field[p.keys] ? null :
            (p.key$.toLowerCase().includes(entity.name) ?
              (a[p.key$] = 'id', a.id = p.key$) :
              null)

            , a), {})

      const fieldAliasesSrc =
        JSON.stringify(fieldAliases, null, 2)
          .replace(/\n/g, '\n  ')

      const entityFileSrc = `
# Entity ${entity.name}

main: sdk: entity: ${entity.name}: {
  alias: field: ${fieldAliasesSrc}
}

`
      const entityFilePath = Path.join(modelBasePath, 'entity',
        (null == opts.outprefix ? '' : opts.outprefix) + entity.name + '.jsonic')

      fs.mkdirSync(Path.dirname(entityFilePath), { recursive: true })

      // TODO: diff merge
      writeChanged('entity-model', entityFilePath, entityFileSrc, { update: false })
    }))


    modifyModel(
      fs,
      Path.join(
        modelBasePath,
        (null == opts.outprefix ? '' : opts.outprefix) + 'sdk.jsonic'),
      entityIncludes
    )
  }


  function writeChanged(
    point: string, path: string, content: string,
    flags?: { update?: boolean }
  ) {
    let exists = false
    let changed = false

    flags = flags || {}
    flags.update = null == flags.update ? true : !!flags.update

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
      action = flags.update ? 'write' : 'skip'

      log.info({
        point: 'write-' + point,
        note: (changed ? '' : 'not-') + 'changed ' + path,
        write: 'file', skip: !changed, exists, changed,
        contentLength: content.length, file: path
      })

      if (!exists || (changed && flags.update)) {
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

  const outprefix = null == opts.outprefix ? '' : opts.outprefix

  const config = {
    def: opts.def || 'no-def',
    kind: 'openapi3',
    model: opts.folder ?
      (opts.folder + '/' + outprefix + 'api-generated.jsonic') : 'no-model',
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



async function modifyModel(fs: any, path: string, entityIncludes: string[]) {
  // TODO: This is a kludge.
  // Aontu should provide option for as-is AST so that can be used
  // to find injection point more reliably


  let src = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') :
    'main: sdk: entity: {}\n'

  let newsrc = '' + src

  // Inject target file references into model
  entityIncludes.sort().map((entname: string) => {
    const lineRE =
      new RegExp(`@"entity/${entname}.jsonic"`)

    if (!src.match(lineRE)) {
      newsrc = newsrc.replace(/(main:\s+sdk:\s+entity:\s+\{\s*\}\n)/, '$1' +
        `@"entity/${entname}.jsonic"\n`)
    }
  })

  if (newsrc.length !== src.length) {
    fs.writeFileSync(path, newsrc)
  }
}



export type {
  ApiDefOptions,
  // ApiDefSpec,
}


export {
  ApiDef,
}
