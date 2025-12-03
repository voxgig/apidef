

import { each, snakify } from 'jostraca'

import type { TransformResult, Transform } from '../transform'

import { formatJSONIC, depluralize, validator } from '../utility'



import type {
  PathDef,
  ParameterDef,
  MethodDef,
  ModelOp,
  OpName,
  ModelEntity,
  ModelAlt,
  ModelArg,
} from './top'



const argsTransform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, def } = ctx

  let msg = 'args '


  each(apimodel.main.sdk.entity, (ment: ModelEntity, entname: string) => {
    each(ment.op, (mop: ModelOp, opname: OpName) => {
      each(mop.alts, (malt: ModelAlt) => {
        const argdefs: ParameterDef[] = []

        const pathdef: PathDef = def.paths[malt.orig]
        argdefs.push(...(pathdef.parameters ?? []))

        const opdef: MethodDef = (pathdef as any)[malt.method.toLowerCase()]
        argdefs.push(...(opdef.parameters ?? []))

        resolveArgs(ment, mop, malt, argdefs)
      })
    })

    msg += ment.name + ' '
  })

  return { ok: true, msg }
}


const ARG_KIND: Record<string, ModelArg["kind"]> = {
  'query': 'query',
  'header': 'header',
  'path': 'param',
  'cookie': 'cookie',
}


function resolveArgs(ment: ModelEntity, mop: ModelOp, malt: ModelAlt, argdefs: ParameterDef[]) {
  each(argdefs, (argdef: ParameterDef) => {
    const marg: ModelArg = {
      name: depluralize(snakify(argdef.name)),
      type: validator(argdef.schema?.type),
      kind: ARG_KIND[argdef.in] ?? 'query',
      req: !!argdef.required
    }

    if (argdef.nullable) {
      marg.type = ['`$ONE`', '`$NULL`', marg.type]
    }

    // insert sorted by name
    let kindargs = (malt.args[marg.kind] = malt.args[marg.kind] ?? [])

    let kalen = kindargs.length
    for (let ka, i = 0; i <= kalen; i++) {
      ka = kindargs[i]
      if (ka && ka.name > marg.name) {
        kindargs = [...kindargs.slice(0, i), marg, ...kindargs.slice(i + 1)]
      }
      else {
        kindargs.push(marg)
      }
    }
  })
}



export {
  argsTransform,
}
