/* Copyright (c) 2024 Richard Rodger, MIT License */

import * as Fs from 'node:fs'

import Path from 'node:path'


import { bundleFromString, createConfig } from '@redocly/openapi-core'

import { FSWatcher } from 'chokidar'

import { Aontu, Context } from 'aontu'

import { getx, each, camelify } from 'jostraca'


type ApiDefOptions = {
  fs?: any
}




function ApiDef(opts: ApiDefOptions = {}) {
  const fs = opts.fs || Fs


  async function watch(spec: any) {
    await generate(spec)

    const fsw = new FSWatcher()

    fsw.on('change', (...args: any[]) => {
      generate(spec)
    })

    fsw.add(spec.def)
  }


  async function generate(spec: any) {
    const guide = await resolveGuide(spec, opts)
    const transform = resolveTranform(spec, guide, opts)

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
      transform(def, model)
    }
    catch (err: any) {
      console.log('APIDEF ERROR', err)
      throw err
    }

    const modelapi = { main: { api: model.main.api } }
    let modelSrc = JSON.stringify(modelapi, null, 2)
    modelSrc = modelSrc.substring(1, modelSrc.length - 1)

    fs.writeFileSync(
      spec.model,
      modelSrc
    )


    const defFilePath = Path.join(modelBasePath, 'def.jsonic')

    const modelDef = { main: { def: model.main.def } }
    let modelDefSrc = JSON.stringify(modelDef, null, 2)
    modelDefSrc = modelDefSrc.substring(1, modelDefSrc.length - 1)

    fs.writeFileSync(
      defFilePath,
      modelDefSrc
    )


    return {
      ok: true,
      model,
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

@"node_modules/@voxgig/apidef/model/guide.jsonic"

guide: entity: {

}

`
      fs.writeFileSync(path, src)
    }

    const aopts = {}
    const root = Aontu(src, aopts)
    const hasErr = root.err && 0 < root.err.length

    // TODO: collect all errors
    if (hasErr) {
      // console.log(root.err)
      // throw new Error(root.err[0])
      throw root.err[0].err
    }

    let genctx = new Context({ root })
    const guide = spec.guideModel = root.gen(genctx)

    // TODO: collect all errors
    if (genctx.err && 0 < genctx.err.length) {
      // console.log(genctx.err)
      throw new Error(JSON.stringify(genctx.err[0]))
    }

    // console.log('GUIDE')
    // console.dir(guide, { depth: null })

    const pathParts = Path.parse(path)
    spec.guideModelPath = Path.join(pathParts.dir, pathParts.name + '.json')
    fs.writeFileSync(spec.guideModelPath, JSON.stringify(guide, null, 2))

    return guide
  }


  return {
    watch,
    generate,
  }
}





function resolveTranform(spec: any, guide: any, opts: any) {
  return makeOpenAPITransform(spec, guide, opts)
}


function extractFields(properties: any) {
  const fieldMap = each(properties)
    .reduce((a: any, p: any) => (a[p.key$] =
      { name: p.key$, kind: camelify(p.type) }, a), {})
  return fieldMap
}


function fixName(base: any, name: string, prop = 'name') {
  base[prop.toLowerCase()] = name.toLowerCase()
  base[camelify(prop)] = camelify(name)
  base[prop.toUpperCase()] = name.toUpperCase()
}


function makeOpenAPITransform(spec: any, guideModel: any, opts: any) {

  const paramBuilder = (paramMap: any, paramDef: any,
    entityModel: any, pathdef: any,
    op: any, path: any, entity: any, model: any) => {

    paramMap[paramDef.name] = {
      required: paramDef.required
    }
    fixName(paramMap[paramDef.name], paramDef.name)

    const type = paramDef.schema ? paramDef.schema.type : paramDef.type
    fixName(paramMap[paramDef.name], type, 'type')
  }


  const queryBuilder = (queryMap: any, queryDef: any,
    entityModel: any, pathdef: any,
    op: any, path: any, entity: any, model: any) => {
    queryMap[queryDef.name] = {
      required: queryDef.required
    }
    fixName(queryMap[queryDef.name], queryDef.name)

    const type = queryDef.schema ? queryDef.schema.type : queryDef.type
    fixName(queryMap[queryDef.name], type, 'type')
  }


  const opBuilder: any = {
    any: (entityModel: any, pathdef: any, op: any, path: any, entity: any, model: any) => {
      const em = entityModel.op[op.key$] = {
        path: path.key$,
        method: op.val$,
        param: {},
        query: {},
      }
      fixName(em, op.key$)

      // Params are in the path
      if (0 < path.params.length) {
        let params = getx(pathdef[op.val$], 'parameters?in=path') || []
        if (Array.isArray(params)) {
          params.reduce((a: any, p: any) =>
            (paramBuilder(a, p, entityModel, pathdef, op, path, entity, model), a), em.param)
        }
      }

      // Queries are after the ?
      let queries = getx(pathdef[op.val$], 'parameters?in!=path') || []
      if (Array.isArray(queries)) {
        queries.reduce((a: any, p: any) =>
          (queryBuilder(a, p, entityModel, pathdef, op, path, entity, model), a), em.query)
      }

      return em
    },


    list: (entityModel: any, pathdef: any, op: any, path: any, entity: any, model: any) => {
      return opBuilder.any(entityModel, pathdef, op, path, entity, model)
    },

    load: (entityModel: any, pathdef: any, op: any, path: any, entity: any, model: any) => {
      return opBuilder.any(entityModel, pathdef, op, path, entity, model)
    },

    create: (entityModel: any, pathdef: any, op: any, path: any, entity: any, model: any) => {
      return opBuilder.any(entityModel, pathdef, op, path, entity, model)
    },

    save: (entityModel: any, pathdef: any, op: any, path: any, entity: any, model: any) => {
      return opBuilder.any(entityModel, pathdef, op, path, entity, model)
    },

    remove: (entityModel: any, pathdef: any, op: any, path: any, entity: any, model: any) => {
      return opBuilder.any(entityModel, pathdef, op, path, entity, model)
    },

  }


  function fieldbuild(
    entityModel: any, pathdef: any, op: any, path: any, entity: any, model: any
  ) {
    // console.log(pathdef)
    let fieldSets = getx(pathdef.get, 'responses 200 content application/json schema')
    // console.log(fieldSets)
    // return;

    if (Array.isArray(fieldSets.allOf)) {
      fieldSets = fieldSets.allOf;
    } else if (fieldSets.properties) {
      fieldSets = [fieldSets];
    } else {
      console.warn('APIDEF', 'Unexpected schema structure')
      fieldSets = []
    }

    if (fieldSets) {
      // console.log('=====', entityModel.NAME)
      // console.log(fieldSets)

      each(fieldSets, (fieldSet: any) => {
        each(fieldSet.properties, (property: any) => {
          // console.log(property)

          const field =
            (entityModel.field[property.key$] = entityModel.field[property.key$] || {})

          field.name = property.key$
          fixName(field, field.name)

          field.type = property.type
          fixName(field, field.type, 'type')

          field.short = property.description
        })
      })
    }
  }


  return function OpenAPITransform(def: any, model: any) {
    fixName(model.main.api, spec.meta.name)

    // console.log('OpenAPITransform', guideModel)

    model.main.def.desc = def.info.description


    each(guideModel.guide.entity, (entity: any) => {
      // console.log('ENTITY', entity)

      const entityModel: any = model.main.api.entity[entity.key$] = {
        op: {},
        field: {},
        cmd: {},
      }

      fixName(entityModel, entity.key$)

      each(entity.path, (path: any) => {
        const pathdef = def.paths[path.key$]

        if (null == pathdef) {
          throw new Error('APIDEF: path not found in OpenAPI: ' + path.key$ +
            ' (entity: ' + entity.name + ')')
        }

        path.parts = path.key$.split('/')
        path.params = path.parts
          .filter((p: string) => p.startsWith('{'))
          .map((p: string) => p.substring(1, p.length - 1))

        // console.log('ENTITY-PATH', entity, path)

        each(path.op, (op: any) => {
          const opbuild = opBuilder[op.key$]

          if (opbuild) {
            opbuild(entityModel, pathdef, op, path, entity, model)
          }

          if ('load' === op.key$) {
            fieldbuild(entityModel, pathdef, op, path, entity, model)
          }
        })
      })
    })
  }
}


export type {
  ApiDefOptions,
}


export {
  ApiDef,
}
