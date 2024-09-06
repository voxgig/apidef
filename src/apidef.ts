/* Copyright (c) 2024 Richard Rodger, MIT License */

import * as Fs from 'node:fs'

import { bundleFromString, createConfig } from '@redocly/openapi-core'

import { FSWatcher } from 'chokidar'

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
    const transform = resolveTranform(spec, opts)

    const source = fs.readFileSync(spec.def, 'utf8')

    const config = await createConfig({})
    const bundle = await bundleFromString({
      source,
      config,
      dereference: true,
    })

    const model = {
      main: { api: { entity: {} } }
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

    let vxgsrc = JSON.stringify(model, null, 2)
    vxgsrc = vxgsrc.substring(1, vxgsrc.length - 1)

    fs.writeFileSync(
      spec.model,
      vxgsrc
    )

    return {
      ok: true,
      model,
    }
  }


  return {
    watch,
    generate,
  }
}




function resolveTranform(spec: any, opts: any) {
  return makeOpenAPITransform(spec, opts)
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


function makeOpenAPITransform(spec: any, opts: any) {

  const paramBuilder = (paramMap: any, paramDef: any,
    entityModel: any, pathdef: any,
    op: any, path: any, entity: any, model: any) => {
    paramMap[paramDef.name] = {
      required: paramDef.required
    }
    fixName(paramMap[paramDef.name], paramDef.name)
    fixName(paramMap[paramDef.name], paramDef.schema.type, 'type')
  }


  const queryBuilder = (queryMap: any, queryDef: any,
    entityModel: any, pathdef: any,
    op: any, path: any, entity: any, model: any) => {
    queryMap[queryDef.name] = {
      required: queryDef.required
    }
    fixName(queryMap[queryDef.name], queryDef.name)
    fixName(queryMap[queryDef.name], queryDef.schema.type, 'type')
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
    let fieldSets = getx(pathdef.get, 'responses 200 content application/json schema allOf')
    // console.log(fieldSets)
    // return;

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

    each(spec.entity, (entity: any) => {
      const entityModel: any = model.main.api.entity[entity.key$] = {
        op: {},
        field: {},
        cmd: {},
      }

      fixName(entityModel, entity.key$)

      // const firstPath: any = Object.keys(entity.path)[0]
      // const firstParts = firstPath.split('/')
      // const entityPathPrefix = firstParts[0]

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
