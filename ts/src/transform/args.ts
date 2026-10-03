

import { each, snakify } from 'jostraca'

import type { TransformResult, Transform } from '../transform'

import {
  depluralize,
  canonizeParam,
  inferFieldType,
  normalizeFieldName,
  paramName,
  validator,
} from '../utility'


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

        if ('graphql' === mpoint.k) {
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
          argdefs.push(...routeArgdefs(def, mpoint))
        }

        resolveArgs(ctx, ment, mop, mpoint, argdefs)
      })

    })

    msg += ment.name + ' '
  })

  return { ok: true, msg }
}


function routeArgdefs(def: any, mpoint: ModelPoint): ParameterDef[] {
  const pathdef: PathDef = def.paths?.[mpoint.o]
  const opdef: MethodDef = (pathdef as any)?.[mpoint.m.toLowerCase()]
  return [...((pathdef as any)?.parameters ?? []), ...(opdef?.parameters ?? [])]
}


// The names a caller gives a REST route's arguments, as this step names them.
function routeArgNames(def: any, mpoint: ModelPoint): string[] {
  const route = { ...mpoint, g: {} } as ModelPoint
  resolveArgs(undefined, { name: '' } as ModelEntity, { name: '', points: [] } as unknown as ModelOp, route,
    routeArgdefs(def, mpoint))
  return Object.values(route.g).flat().map((arg: any) => arg.n)
}


// Locate the normalised root-field descriptor a GraphQL point came from.
function graphqlFieldDef(def: any, mpoint: ModelPoint): any {
  const field = mpoint.gq?.field ?? mpoint.o
  return 'mutation' === mpoint.gq?.optype ?
    def.mutation?.[field] : def.query?.[field]
}


function gqlScalarType(typeName: string): string | undefined {
  return 'Int' === typeName ? 'integer' :
    'Float' === typeName ? 'number' :
      'Boolean' === typeName ? 'boolean' :
        ('String' === typeName || 'ID' === typeName) ? 'string' :
          undefined
}


const ARG_KIND: Record<string, ModelArg["k"]> = {
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
  const placeholders = [...String(mpoint.o ?? '').matchAll(/\{([^}]+)\}/g)].map((m) => m[1])

  each(argdefs, (argdef: ParameterDef) => {
    // A Swagger body parameter is the request body, which the body step reads.
    if ('body' === (argdef as any).in) {
      return
    }

    const specName = normalizeFieldName(argdef.name)
    const orig = depluralize(snakify(specName))

    if ('' === orig) {
      const ref = (argdef as any)?.$ref
      ctx?.warn?.({
        note: `Parameter with no name on entity=${ment.name} op=${mop.name}` +
          ` path=${mpoint.o} is dropped` +
          (null == ref ? '.' : `: \`$ref\` "${ref}" resolves to nothing.`) +
          ' A parameter needs a `name`, or a reference that resolves to one.',
        entity: ment.name,
        path: mpoint.o,
        op: mop.name,
      })
      return
    }

    let kind = ARG_KIND[argdef.in] ?? 'query'
    let placed = false
    const where: unknown = argdef.in
    if ('string' !== typeof where || '' === where) {
      placed = placeholders.includes(argdef.name)
      kind = placed ? 'param' : 'query'
      ctx?.warn?.({
        note: `Parameter ${argdef.name} on entity=${ment.name} op=${mop.name}` +
          ` path=${mpoint.o} has no \`in\`` +
          (placed ? `; it names the path placeholder {${argdef.name}}, so it is taken as` +
            ' a path parameter.' : ', so it is taken as a query parameter.') +
          ' A parameter needs an `in`.',
        entity: ment.name,
        path: mpoint.o,
        op: mop.name,
        param: argdef.name,
      })
    }
    // A path argument is named by the lookup that names its segment, so the
    // two agree under a raw rename key, and one that fills a placeholder is
    // required, as OpenAPI requires; a GraphQL argument keeps its own flag.
    // Any other rename map is keyed by the spec original or the snakified form.
    const path = 'param' === kind
    const fills = path && placeholders.some((p) => p === argdef.name || canonizeParam(p) === orig)
    const renameMap = mpoint.r[kind]
    const name = path ? paramName(argdef.name, mpoint.r.param) :
      (renameMap?.[specName] ?? renameMap?.[orig] ?? orig)
    const schema = paramSchema(argdef)
    // The name the definition gives, which the SDK sends on the wire. The
    // model name beside it is only what a caller writes.
    const marg: ModelArg = {
      n: name,
      or: String(argdef.name),
      t: inferFieldType(name, validator(schema?.type)),
      k: kind,
      r: fills || !!argdef.required
    }

    const example = resolveArgExample(argdef, schema)
    if (undefined !== example) {
      marg.ex = example
    }

    if (argdef.nullable) {
      marg.t = ['`$ONE`', '`$NULL`', marg.t]
    }

    const argsKey = (marg.k === 'param' ? 'params' : marg.k) as keyof typeof mpoint.g
    let kindargs = (mpoint.g[argsKey] = mpoint.g[argsKey] ?? [])
    kindargs.push(marg)
    touchedKeys.add(argsKey)
  })

  // A placeholder the definition declares no parameter for, such as Vapi's
  // DELETE /call/{id}, still takes a value: it gets a required string
  // argument under its own name, and a warning.
  if ('graphql' !== mpoint.k) {
    const declared = new Set((mpoint.g.params ?? [])
      .map((arg: ModelArg) => canonizeParam(String(arg.or))))
    for (const wire of placeholders) {
      const orig = canonizeParam(wire)
      const name = paramName(wire, mpoint.r.param)
      // A declared parameter the placeholder is renamed to already fills it.
      if ('' === orig || declared.has(orig) ||
        (mpoint.g.params ?? []).some((arg: ModelArg) => arg.n === name)) continue
      declared.add(orig)
      const params = (mpoint.g.params = mpoint.g.params ?? [])
      params.push({ n: name, or: wire, t: inferFieldType(name, validator('string')), k: 'param', r: true })
      touchedKeys.add('params')
      ctx?.warn?.({
        note: `Path placeholder {${wire}} on entity=${ment.name} op=${mop.name}` +
          ` path=${mpoint.o} has no declared parameter, so it is taken as a required string.`,
        entity: ment.name,
        path: mpoint.o,
        op: mop.name,
      })
    }
  }

  // Sort once after all args are collected
  const cmp = (a: ModelArg, b: ModelArg) => a.n < b.n ? -1 : a.n > b.n ? 1 : 0
  for (const key of touchedKeys) {
    mpoint.g[key as keyof typeof mpoint.g]?.sort(cmp)
  }
}


// Type facts sit on a Swagger 2 parameter itself, and under `schema` in
// OpenAPI 3. A formData parameter converts to a body field, not a parameter.
function paramSchema(argdef: any): any {
  if (null != argdef?.schema) {
    return argdef.schema
  }
  if ('formData' === argdef?.in) {
    return undefined
  }
  // Swagger 2's file type is a binary string in OpenAPI 3.
  return 'file' === argdef?.type ? { ...argdef, type: 'string', format: 'binary' } : argdef
}


function resolveArgExample(argdef: any, schema: any): any {
  if (undefined !== argdef?.example) return argdef.example

  const examples = argdef?.examples
  if (examples && 'object' === typeof examples) {
    for (const v of Object.values(examples)) {
      if (v && 'object' === typeof v && undefined !== (v as any).value) {
        return (v as any).value
      }
    }
  }

  if (schema) {
    if (undefined !== schema.example) return schema.example
    if (undefined !== schema.default) return schema.default
  }

  return undefined
}


export {
  argsTransform,
  routeArgNames,
}
