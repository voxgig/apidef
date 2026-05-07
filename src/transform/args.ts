

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
  ModelPoint,
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
      each(mop.points, (mpoint: ModelPoint) => {
        const argdefs: ParameterDef[] = []

        const pathdef: PathDef = def.paths[mpoint.orig]
        argdefs.push(...(pathdef.parameters ?? []))

        const opdef: MethodDef = (pathdef as any)[mpoint.method.toLowerCase()]
        argdefs.push(...(opdef?.parameters ?? []))

        resolveArgs(ment, mop, mpoint, argdefs)
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


function resolveArgs(ment: ModelEntity, mop: ModelOp, mpoint: ModelPoint, argdefs: ParameterDef[]) {
  const touchedKeys = new Set<string>()

  each(argdefs, (argdef: ParameterDef) => {
    // Spec name as written (e.g. `dataType`) is what the rename map is keyed
    // by; the snakified form is the user-friendly runtime identifier.
    const specName = normalizeFieldName(argdef.name)
    const orig = depluralize(snakify(specName))
    const kind = ARG_KIND[argdef.in] ?? 'query'
    // Rename map can be keyed by either the spec original (camelCase) or by
    // the snakified form depending on which path went through heuristic01.
    // Try both before falling through to `orig`.
    const renameMap = mpoint.rename[kind]
    const name = renameMap?.[specName] ?? renameMap?.[orig] ?? orig
    const marg: ModelArg = {
      name,
      orig,
      type: inferFieldType(name, validator(argdef.schema?.type)),
      kind,
      reqd: !!argdef.required
    }

    const example = resolveArgExample(argdef)
    if (undefined !== example) {
      marg.example = example
    }

    if (argdef.nullable) {
      marg.type = ['`$ONE`', '`$NULL`', marg.type]
    }

    const argsKey = (marg.kind === 'param' ? 'params' : marg.kind) as keyof typeof mpoint.args
    let kindargs = (mpoint.args[argsKey] = mpoint.args[argsKey] ?? [])
    kindargs.push(marg)
    touchedKeys.add(argsKey)
  })

  // Sort once after all args are collected
  const cmp = (a: ModelArg, b: ModelArg) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  for (const key of touchedKeys) {
    mpoint.args[key as keyof typeof mpoint.args]?.sort(cmp)
  }
}


// OpenAPI lets specs advertise example values four ways:
//   parameter.example          (single value, OAS 3.0+)
//   parameter.examples          (named-example object, take first .value)
//   parameter.schema.example   (single value on the schema)
//   parameter.schema.default   (default value)
// Pick the first one we find so test generators can produce valid live
// requests even when the parameter is required and has no other source.
function resolveArgExample(argdef: any): any {
  if (undefined !== argdef?.example) return argdef.example

  const examples = argdef?.examples
  if (examples && 'object' === typeof examples) {
    for (const v of Object.values(examples)) {
      if (v && 'object' === typeof v && undefined !== (v as any).value) {
        return (v as any).value
      }
    }
  }

  const schema = argdef?.schema
  if (schema) {
    if (undefined !== schema.example) return schema.example
    if (undefined !== schema.default) return schema.default
  }

  return undefined
}


export {
  argsTransform,
}
