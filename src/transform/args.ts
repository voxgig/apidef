

import { each, snakify } from 'jostraca'

import type { TransformResult, Transform } from '../transform'

import { formatJSONIC, depluralize, validator } from '../utility'


import { KIT } from '../types'

import type { KitModel } from '../types'

import type {
  PathDef,
  ParameterDef,
  MethodDef,
} from '../def'

import type {
  OpName,
  ModelOp,
  ModelEntity,
  ModelAlt,
  ModelArg,
} from '../model'



const argsTransform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, def } = ctx
  const kit: KitModel = apimodel.main[KIT]

  let msg = 'args '


  each(kit.entity, (ment: ModelEntity, entname: string) => {
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
    const orig = depluralize(snakify(argdef.name))
    const kind = ARG_KIND[argdef.in] ?? 'query'
    const name = malt.rename[kind]?.[orig] ?? orig
    const marg: ModelArg = {
      name,
      orig,
      type: validator(argdef.schema?.type),
      kind,
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
