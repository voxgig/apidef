

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

  const paramBuilder = (
    paramMap: any,
    paramDef: any,
    opModel: any,
    entityModel: any,
    pathdef: any,
    op: any,
    path: any,
    entity: any,
    model: any
  ) => {

    const paramSpec: any = paramMap[paramDef.name] = {
      required: paramDef.required
    }
    fixName(paramSpec, paramDef.name)

    const type = paramDef.schema ? paramDef.schema.type : paramDef.type
    fixName(paramSpec, type, 'type')

    // Path params are always required.
    opModel.validate.params[paramDef.name] = `\`$${paramSpec.TYPE}\``
  }


  const queryBuilder = (
    queryMap: any,
    queryDef: any,
    opModel: any,
    entityModel: any,
    pathdef: any,
    op: any,
    path: any,
    entity: any,
    model: any
  ) => {
    const querySpec: any = queryMap[queryDef.name] = {
      required: queryDef.required
    }
    fixName(queryMap[queryDef.name], queryDef.name)

    const type = queryDef.schema ? queryDef.schema.type : queryDef.type
    fixName(queryMap[queryDef.name], type, 'type')

    if (queryDef.required) {
      opModel.validate.params[queryDef.name] = `\`$${querySpec.TYPE}\``
    }
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
    let why = 'none'

    if (null != op.transform?.[direction]) {
      out = op.transform[direction]
    }

    else {
      const method = op.method
      const mdef = pathdef[method]

      // TODO: fix getx
      // const content = 'res' === kind ?
      const content = 'resform' === direction ?
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

          //const [transform, why]
          ;[out, why]
            = resolveDirectionTransform(
              entityModel,
              op,
              kind,
              direction,
              method,
              mdef,
              content,
              schema,
              propkeys
            )

        // out = JSON.stringify(transform)
        // out = transform
      }
      else {
        out = 'res' === kind ? '`body`' : '`reqdata`'
      }
    }


    return [out, why]
  }


  const resolveResponseTransform = (
    entityModel: any,
    op: any,
    kind: 'res' | 'req',
    direction: 'resform' | 'reqform',
    method: string,
    mdef: any,
    content: any,
    schema: any,
    propkeys: any
  ) => {
    let why = 'default'
    let transform: any = '`body`'

    if (null == content || null == schema || null == propkeys) {
      return transform
    }

    const opname = op.key$

    if ('list' === opname) {
      if ('array' !== schema.type) {
        if (1 === propkeys.length) {
          why = 'list-single-prop:' + propkeys[0]
          transform = '`body.' + propkeys[0] + '`'
        }
        else {
          // Use sub property that is an array
          for (let pk of propkeys) {
            if ('array' === schema.properties[pk]?.type) {
              why = 'list-single-array:' + pk
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
            why = 'map-single-prop:' + propkeys[0]
            transform = '`body.' + propkeys[0] + '`'
          }
          else {
            for (let pk of propkeys) {
              if (schema.properties[pk].properties?.id) {
                why = 'map-sub-prop:' + pk
                transform = '`body.' + pk + '`'
                break
              }
            }
          }
        }
      }
    }

    // if ('page' === entityModel.name) {
    //   console.log('RESOLVE-TRANSFORM-RESPONSE', entityModel.name, op.method, kind, direction, transform, why, schema)
    // }

    return [transform, why]
  }


  const resolveRequestTransform = (
    entityModel: any,
    op: any,
    kind: 'res' | 'req',
    direction: 'resform' | 'reqform',
    method: string,
    mdef: any,
    content: any,
    schema: any,
    propkeys: any
  ) => {
    let transform: any = '`data`'
    let why = 'default'

    if (null == content || null == schema || null == propkeys) {
      return transform
    }

    const opname = op.key$

    if ('list' === opname) {
      if ('array' !== schema.type) {
        if (1 === propkeys.length) {
          why = 'list-single-prop:' + propkeys[0]
          transform = { [propkeys[0]]: '`data`' }
        }
        else {
          // Use sub property that is an array
          for (let pk of propkeys) {
            if ('array' === schema.properties[pk]?.type) {
              why = 'list-single-array:' + pk
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
            why = 'map-single-prop:' + propkeys[0]
            transform = { [propkeys[0]]: '`data`' }
          }
          else {
            for (let pk of propkeys) {
              if (schema.properties[pk].properties?.id) {
                why = 'map-sub-prop:' + pk
                transform = { [pk]: '`data`' }
                break
              }
            }
          }
        }
      }
    }

    return [transform, why]
  }


  const opBuilder: any = {
    any: (entityModel: any, pathdef: any, op: any, path: any, entity: any, model: any) => {
      const opname = op.key$
      const method = op.method
      const kind = OPKIND[opname]

      const [resform, resform_COMMENT] =
        resolveTransform(entityModel, op, kind, 'resform', pathdef)

      const [reqform, reqform_COMMENT] =
        resolveTransform(entityModel, op, kind, 'reqform', pathdef)

      const opModel = entityModel.op[opname] = {
        path: path.key$,
        method,
        kind,
        param: {},
        query: {},

        resform_COMMENT: 'derivation: ' + resform_COMMENT,
        resform,

        reqform_COMMENT: 'derivation: ' + reqform_COMMENT,
        reqform,

        validate: {
          params: { '`$OPEN`': true }
        }
      }

      fixName(opModel, op.key$)

      // Params are in the path
      if (0 < path.params$.length) {
        let params = getx(pathdef[method], 'parameters?in=path') || []
        if (Array.isArray(params)) {
          params.reduce((a: any, p: any) =>
          (paramBuilder(a, p, opModel, entityModel,
            pathdef, op, path, entity, model), a), opModel.param)
        }
      }

      // Queries are after the ?
      let queries = getx(pathdef[op.val$], 'parameters?in!=path') || []
      if (Array.isArray(queries)) {
        queries.reduce((a: any, p: any) =>
        (queryBuilder(a, p, opModel, entityModel,
          pathdef, op, path, entity, model), a), opModel.query)
      }

      return opModel
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
