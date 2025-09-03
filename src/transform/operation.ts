

import { each, getx, snakify } from 'jostraca'

import { transform, setprop, getprop } from '@voxgig/struct'

import type { TransformResult } from '../transform'

import { fixName, OPKIND } from '../transform'

import { depluralize } from '../utility'


const operationTransform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, model, def, guide } = ctx

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
  ): [any, string] => {
    let why = 'default'
    let transform: any = '`body`'
    const properties = schema?.properties

    if (null == content || null == schema || null == propkeys || null == properties) {
      return [transform, why]
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
            if ('array' === properties[pk]?.type) {
              why = 'list-single-array:' + pk
              transform = '`body.' + pk + '`'

              // TODO: if each item has prop === name of entity, use that, get with $EACH

              break
            }
          }
        }
      }
    }
    else {
      if ('object' === schema.type) {
        if (null == properties.id) {
          if (1 === propkeys.length) {
            why = 'map-single-prop:' + propkeys[0]
            transform = '`body.' + propkeys[0] + '`'
          }
          else {
            for (let pk of propkeys) {
              if (properties[pk]?.properties?.id) {
                why = 'map-sub-prop:' + pk
                transform = '`body.' + pk + '`'
                break
              }
            }
          }
        }
      }
    }

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
  ): [any, string] => {
    let transform: any = '`reqdata`'
    let why = 'default'
    const properties = schema?.properties

    if (null == content || null == schema || null == propkeys || null == properties) {
      return [transform, why]
    }

    const opname = op.key$

    if ('list' === opname) {
      if ('array' !== schema.type) {
        if (1 === propkeys.length) {
          why = 'list-single-prop:' + propkeys[0]
          transform = { [propkeys[0]]: '`reqdata`' }
        }
        else {
          // Use sub property that is an array
          for (let pk of propkeys) {
            if ('array' === properties[pk]?.type) {
              why = 'list-single-array:' + pk
              transform = { [pk]: '`reqdata`' }
              break
            }
          }
        }
      }
    }
    else {
      if ('object' === schema.type) {
        if (null == properties.id) {
          if (1 === propkeys.length) {
            why = 'map-single-prop:' + propkeys[0]
            transform = { [propkeys[0]]: '`reqdata`' }
          }
          else {
            for (let pk of propkeys) {
              if (properties[pk]?.properties?.id) {
                why = 'map-sub-prop:' + pk
                transform = { [pk]: '`reqdata`' }
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
    any: (
      entityModel: any,
      pathdef: any,
      guideOp: any,
      guidePath: any,
      guideEntity: any,
      model: any
    ) => {
      if (false === guidePath.active) {
        return
      }

      const opname = guideOp.key$
      const method = guideOp.method
      const kind = OPKIND[opname]

      const existingOpModel = entityModel.op[opname]
      const existingParam = existingOpModel?.param

      const [resform, resform_COMMENT] =
        resolveTransform(entityModel, guideOp, kind, 'resform', pathdef)

      const [reqform, reqform_COMMENT] =
        resolveTransform(entityModel, guideOp, kind, 'reqform', pathdef)

      const opModel = {
        path: guidePath.key$,
        pathalt: ([] as any[]),

        method,
        kind,
        param: existingParam || {},
        query: {},

        resform_COMMENT: 'derivation: ' + resform_COMMENT,
        resform,

        reqform_COMMENT: 'derivation: ' + reqform_COMMENT,
        reqform,

        validate: {
          params: { '`$OPEN`': true }
        }
      }

      fixName(opModel, guideOp.key$)

      let params: any[] = []

      // Params are in the path
      if (0 < guidePath.params$?.length) {
        let sharedparams = getx(pathdef, 'parameters?in=path') || []
        params = sharedparams.concat(
          getx(pathdef[method], 'parameters?in=path') || []
        )

        // if (Array.isArray(params)) {
        params.reduce((a: any, p: any) =>
        (paramBuilder(a, p, opModel, entityModel,
          pathdef, guideOp, guidePath, guideEntity, model), a), opModel.param)
        //}
      }

      // Queries are after the ?
      let sharedqueries = getx(pathdef, 'parameters?in!=path') || []
      let queries = sharedqueries.concat(getx(pathdef[method], 'parameters?in!=path') || [])
      queries.reduce((a: any, p: any) =>
      (queryBuilder(a, p, opModel, entityModel,
        pathdef, guideOp, guidePath, guideEntity, model), a), opModel.query)

      let pathalt: any[] = []
      const pathselector = makePathSelector(guidePath.key$)

      let before = false

      if (null != entityModel.op[opname]) {
        pathalt = entityModel.op[opname].pathalt

        // Ordering for pathalts: most to least paramrs, then alphanumberic
        for (let i = 0; i < pathalt.length; i++) {
          let current = pathalt[i]
          before =
            pathselector.pn$ > current.pn$ ||
            (pathselector.pn$ === current.pn$ &&
              pathselector.path <= current.path)

          if (before) {
            pathalt = [
              ...pathalt.slice(0, i),
              pathselector,
              ...pathalt.slice(i),
            ]
            break
          }
        }
      }

      if (!before) {
        pathalt.push(pathselector)
      }

      opModel.path = pathalt[pathalt.length - 1].path
      opModel.pathalt = pathalt

      entityModel.op[opname] = opModel

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

  /*
    console.dir(
      transform({ guide }, {
        entity: {
          '`$PACK`': ['guide.entity', {
            '`$KEY`': 'name',
            op: {
              // load: ['`$IF`', ['`$SELECT`',{path:{'`$ANY`':{op:{load:'`$EXISTS`'}}}}], {
              load: ['`$IF`', 'path.*.op.load', {
                path: () => 'foo'
              }]
            }
          }]
        }
      }), { depth: null })
  */

  each(guide.entity, (guideEntity: any) => {
    let opcount = 0
    const entityModel = apimodel.main.api.entity[guideEntity.key$]
    each(guideEntity.path, (guidePath: any) => {
      const pathdef = def.paths[guidePath.key$]

      each(guidePath.op, (guideOp: any) => {
        const opbuild = opBuilder[guideOp.key$]

        if (opbuild) {
          opbuild(entityModel, pathdef, guideOp, guidePath, guideEntity, model)
          opcount++
        }
      })
    })

    // Full list of params only know after all operations built.
    each(entityModel.op, (op: any) => {
      const params = Object.keys(op.param || {})
      const pathalt = op.pathalt || []

      // if ('course' === entityModel.name) {
      //   console.log('PA', params, pathalt)
      // }

      for (const pa of pathalt) {
        for (const p of params) {
          pa[p] = pa[p] || false
          // if ('course' === entityModel.name) {
          //   console.log('PA-SET', p, pa)
          // }
        }
      }
    })

    // if ('course' === entityModel.name) {
    //   console.dir(entityModel, { depth: null })
    // }

    msg += guideEntity.name + '=' + opcount + ' '
  })

  return { ok: true, msg }
}


function makePathSelector(path: string) {
  let out: any = { path }

  let pn$ = 0
  for (const m of path.matchAll(/\/[^\/]+\/{([^}]+)\}/g)) {
    const paramName = depluralize(snakify(m[1]))
    out[paramName] = true
    pn$++
  }
  out.pn$ = pn$

  return out
}


export {
  operationTransform
}
