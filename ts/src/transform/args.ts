

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

        if ('graphql' === mpoint.kind) {
          // GraphQL root-field arguments become 'param' args, so the existing
          // arg machinery (select.exist matching, request typing, test
          // generation) works on them unchanged. Input-object arguments are
          // the request body and are bound as variables by the document
          // renderer instead, so they are not surfaced as params here.
          const fielddef: any = graphqlFieldDef(def, mpoint)
          for (const arg of (fielddef?.args ?? [])) {
            const argtype = def.types?.[arg.type]
            if (null != argtype && 'INPUT_OBJECT' === argtype.kind) {
              continue
            }
            argdefs.push({
              name: arg.name,
              in: 'path',
              // A schema default makes a non-null argument omittable by the
              // caller, so it is not required of the SDK caller either.
              required: arg.reqd && undefined === arg.deflt,
              schema: { type: gqlScalarType(arg.type) },
            } as any)
          }
        }
        else {
          const pathdef: PathDef = def.paths[mpoint.orig]
          argdefs.push(...((pathdef as any)?.parameters ?? []))

          const opdef: MethodDef = (pathdef as any)?.[mpoint.method.toLowerCase()]
          argdefs.push(...(opdef?.parameters ?? []))
        }

        resolveArgs(ctx, ment, mop, mpoint, argdefs)
      })

    })

    msg += ment.name + ' '
  })

  return { ok: true, msg }
}


// Locate the normalised root-field descriptor a GraphQL point came from.
function graphqlFieldDef(def: any, mpoint: ModelPoint): any {
  const field = mpoint.graphql?.field ?? mpoint.orig
  return 'mutation' === mpoint.graphql?.optype ?
    def.mutation?.[field] : def.query?.[field]
}


function gqlScalarType(typeName: string): string | undefined {
  return 'Int' === typeName ? 'integer' :
    'Float' === typeName ? 'number' :
      'Boolean' === typeName ? 'boolean' :
        ('String' === typeName || 'ID' === typeName) ? 'string' :
          undefined
}


const ARG_KIND: Record<string, ModelArg["kind"]> = {
  'query': 'query',
  'header': 'header',
  'path': 'param',
  'cookie': 'cookie',
}


function resolveArgs(
  ctx: any,
  ment: ModelEntity, mop: ModelOp, mpoint: ModelPoint, argdefs: ParameterDef[]
) {
  const touchedKeys = new Set<string>()

  each(argdefs, (argdef: ParameterDef) => {
    const specName = normalizeFieldName(argdef.name)
    const orig = depluralize(snakify(specName))

    if ('' === orig) {
      const ref = (argdef as any)?.$ref
      ctx?.warn?.({
        note: `Parameter with no name on entity=${ment.name} op=${mop.name}` +
          ` path=${mpoint.orig} is dropped` +
          (null == ref ? '.' : `: \`$ref\` "${ref}" resolves to nothing.`) +
          ' A parameter needs a `name`, or a reference that resolves to one.',
        entity: ment.name,
        path: mpoint.orig,
        op: mop.name,
      })
      return
    }

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
