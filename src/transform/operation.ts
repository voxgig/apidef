

import { each, getx } from 'jostraca'

import type { TransformResult } from '../transform'

import { fixName, OPKIND } from '../transform'



const operationTransform = async function(
  ctx: any,
  // guide: Guide,
  // // tspec: TransformSpec,
  // model: any,
  // def: any
): Promise<TransformResult> {
  const { apimodel, model, def } = ctx
  const guide = model.main.api.guide

  let msg = 'operations: '

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


  // Resolve the JSON structure of the request or response.
  // NOTE: uses heuristics.
  const resolveTransform = (
    entityModel: any,
    op: any,
    kind: 'res' | 'req',
    direction: 'resform' | 'reqform',
    pathdef: any
  ) => {
    let out

    if (null != op.transform?.[direction]) {
      out = op.transform[direction]
    }

    else {
      const method = op.method
      const mdef = pathdef[method]

      // TODO: fix getx
      const content = 'res' === kind ?
        (getx(mdef, 'responses.200.content') ||
          getx(mdef, 'responses.201.content')) :
        getx(mdef, 'requestBody.content')

      // console.log(entityModel)
      // console.log(mdef)
      // console.log(getx(mdef, 'responses.200.content'))
      // console.log(kind, method, pathdef, content)

      if (content) {

        const schema = content['application/json']?.schema

        const propkeys = null == schema?.properties ? [] : Object.keys(schema.properties)

        const resolveDirectionTransform =
          'resform' === direction ? resolveResponseTransform : resolveRequestTransform

        const transform = resolveDirectionTransform(
          op,
          kind,
          method,
          mdef,
          content,
          schema,
          propkeys
        )

        // out = JSON.stringify(transform)
        out = transform
      }
      else {
        out = 'res' === kind ? '`body`' : '`reqdata`'
      }
    }


    return out
  }


  const resolveResponseTransform = (
    op: any,
    kind: 'res' | 'req',
    method: string,
    mdef: any,
    content: any,
    schema: any,
    propkeys: any
  ) => {
    let transform: any = '`body`'

    if (null == content || null == schema || null == propkeys) {
      return transform
    }

    const opname = op.key$

    if ('list' === opname) {
      if ('array' !== schema.type) {
        if (1 === propkeys.length) {
          transform = '`body.' + propkeys[0] + '`'
        }
        else {
          // Use sub property that is an array
          for (let pk of propkeys) {
            if ('array' === schema.properties[pk]?.type) {
              transform = '`body.' + pk + '`'
              break
            }
          }
        }
      }
    }
    else {
      if ('object' === schema.type) {
        if (null == schema.properties.id) {
          if (1 === propkeys.length) {
            transform = '`body.' + propkeys[0] + '`'
          }
          else {
            for (let pk of propkeys) {
              if (schema.properties[pk].properties?.id) {
                transform = '`body.' + pk + '`'
                break
              }
            }
          }
        }
      }
    }

    return transform
  }


  const resolveRequestTransform = (
    op: any,
    kind: 'res' | 'req',
    method: string,
    mdef: any,
    content: any,
    schema: any,
    propkeys: any
  ) => {
    let transform: any = '`data`'

    if (null == content || null == schema || null == propkeys) {
      return transform
    }

    const opname = op.key$

    if ('list' === opname) {
      if ('array' !== schema.type) {
        if (1 === propkeys.length) {
          transform = { [propkeys[0]]: '`data`' }
        }
        else {
          // Use sub property that is an array
          for (let pk of propkeys) {
            if ('array' === schema.properties[pk]?.type) {
              transform = { [pk]: '`data`' }
              break
            }
          }
        }
      }
    }
    else {
      if ('object' === schema.type) {
        if (null == schema.properties.id) {
          if (1 === propkeys.length) {
            transform = { [propkeys[0]]: '`data`' }
          }
          else {
            for (let pk of propkeys) {
              if (schema.properties[pk].properties?.id) {
                transform = { [pk]: '`data`' }
                break
              }
            }
          }
        }
      }
    }

    return transform
  }


  const opBuilder: any = {
    any: (entityModel: any, pathdef: any, op: any, path: any, entity: any, model: any) => {
      const opname = op.key$
      const method = op.method
      const kind = OPKIND[opname]

      const em = entityModel.op[opname] = {
        path: path.key$,
        method,
        kind,
        param: {},
        query: {},
        // transform: {
        resform: resolveTransform(entityModel, op, kind, 'resform', pathdef),
        reqform: resolveTransform(entityModel, op, kind, 'reqform', pathdef),
        // }
      }

      fixName(em, op.key$)

      // Params are in the path
      if (0 < path.params$.length) {
        let params = getx(pathdef[method], 'parameters?in=path') || []
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

    update: (entityModel: any, pathdef: any, op: any, path: any, entity: any, model: any) => {
      return opBuilder.any(entityModel, pathdef, op, path, entity, model)
    },

    remove: (entityModel: any, pathdef: any, op: any, path: any, entity: any, model: any) => {
      return opBuilder.any(entityModel, pathdef, op, path, entity, model)
    },

  }


  each(guide.entity, (guideEntity: any) => {
    let opcount = 0
    const entityModel = apimodel.main.api.entity[guideEntity.key$]
    each(guideEntity.path, (guidePath: any) => {
      const pathdef = def.paths[guidePath.key$]

      each(guidePath.op, (op: any) => {
        const opbuild = opBuilder[op.key$]

        if (opbuild) {
          opbuild(entityModel, pathdef, op, guidePath, guideEntity, model)
          opcount++
        }
      })
    })

    msg += guideEntity.name + '=' + opcount + ' '
  })

  return { ok: true, msg }
}


export {
  operationTransform
}
