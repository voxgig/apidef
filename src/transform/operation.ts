

import { each, getx } from 'jostraca'

import type { TransformCtx, TransformSpec } from '../transform'

import { fixName } from '../transform'



async function operationTransform(
  ctx: TransformCtx,
  tspec: TransformSpec,
  model: any,
  def: any
) {
  const { model: { main: { guide } } } = ctx
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
      if (0 < path.params$.length) {
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
