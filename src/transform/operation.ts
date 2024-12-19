

import { each, getx } from 'jostraca'

import type { TransformCtx, TransformSpec, TransformResult, Transform, Guide } from '../transform'

import { fixName, OPKIND } from '../transform'



const operationTransform = async function(
  ctx: TransformCtx,
  guide: Guide,
  tspec: TransformSpec,
  model: any,
  def: any
): Promise<TransformResult> {

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


  // Resolve the JSON path to the data (the "place").
  const resolvePlace = (op: any, kind: 'res' | 'req', pathdef: any) => {
    const opname = op.key$
    // console.log('RP', kind, op)

    let place = null == op.place ? '' : op.place

    if (null != place && '' !== place) {
      return place
    }

    const method = op.method
    const mdef = pathdef[method]

    // TODO: fix getx
    const content = 'res' === kind ?
      (getx(mdef, 'responses.200.content') ||
        getx(mdef, 'responses.201.content')) :
      getx(mdef, 'requestBody.content')


    // console.log('RP', kind, op, 'content', null == content)

    if (null == content) {
      return place
    }

    const schema = content['application/json']?.schema

    // console.log('RP', kind, op, 'schema', null == schema)

    if (null == schema) {
      return place
    }


    const propkeys = null == schema.properties ? [] : Object.keys(schema.properties)

    // HEURISTIC: guess place
    if ('list' === opname) {
      if ('array' === schema.type) {
        place = ''
      }
      else {
        if (1 === propkeys.length) {
          place = propkeys[0]
        }
        else {
          // Use sub property that is an array
          for (let pk of propkeys) {
            if ('array' === schema.properties[pk]?.type) {
              place = pk
              break
            }
          }
        }
      }
    }
    else {
      if ('object' === schema.type) {
        if (schema.properties.id) {
          place = '' // top level
        }
        else {
          if (1 === propkeys.length) {
            place = propkeys[0]
          }
          else {
            // Use sub property with an id
            for (let pk of propkeys) {
              if (schema.properties[pk].properties?.id) {
                place = pk
                break
              }
            }
          }
        }
      }
    }

    // console.log('PLACE', op, kind, schema.type, 'P=', place)
    return place
  }


  const opBuilder: any = {
    any: (entityModel: any, pathdef: any, op: any, path: any, entity: any, model: any) => {
      // console.log('OP', op, pathdef, path, entity)
      const opname = op.key$
      const method = op.val$
      const kind = OPKIND[opname]

      // console.log('EM', entityModel.name)

      const em = entityModel.op[opname] = {
        path: path.key$,
        method: op.val$,
        kind,
        param: {},
        query: {},
        place: resolvePlace(op, kind, pathdef)
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
    const entityModel = model.main.api.entity[guideEntity.key$]
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
