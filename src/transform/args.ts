

import { each, snakify } from 'jostraca'

import type { TransformResult, Transform } from '../transform'

import { formatJSONIC, depluralize, inferFieldType, normalizeFieldName, validator } from '../utility'


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
  ModelTarget,
  ModelArg,
} from '../model'



const argsTransform: Transform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, def } = ctx
  const kit: KitModel = apimodel.main[KIT]

  let msg = 'args '


  each(kit.entity, (ment: ModelEntity, entname: string) => {
    each(ment.op, (mop: ModelOp, opname: OpName) => {
      each(mop.points, (mtarget: ModelTarget) => {
        const argdefs: ParameterDef[] = []

        const pathdef: PathDef = def.paths[mtarget.orig]
        argdefs.push(...(pathdef.parameters ?? []))

        const opdef: MethodDef = (pathdef as any)[mtarget.method.toLowerCase()]
        argdefs.push(...(opdef?.parameters ?? []))

        resolveArgs(ment, mop, mtarget, argdefs)
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


function resolveArgs(ment: ModelEntity, mop: ModelOp, mtarget: ModelTarget, argdefs: ParameterDef[]) {
  each(argdefs, (argdef: ParameterDef) => {
    const orig = depluralize(snakify(normalizeFieldName(argdef.name)))
    const kind = ARG_KIND[argdef.in] ?? 'query'
    const name = mtarget.rename[kind]?.[orig] ?? orig
    const marg: ModelArg = {
      name,
      orig,
      type: inferFieldType(name, validator(argdef.schema?.type)),
      kind,
      reqd: !!argdef.required
    }

    if (argdef.nullable) {
      marg.type = ['`$ONE`', '`$NULL`', marg.type]
    }

    // insert sorted by name
    const argsKey = (marg.kind === 'param' ? 'params' : marg.kind) as keyof typeof mtarget.args
    let kindargs = (mtarget.args[argsKey] = mtarget.args[argsKey] ?? [])
    kindargs.push(marg)
    kindargs.sort((a: ModelArg, b: ModelArg) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  })
}



export {
  argsTransform,
}
