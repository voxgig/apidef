

import { each, getx } from 'jostraca'

import type { TransformResult, Transform } from '../transform'

import { validator, canonize, inferFieldType, normalizeFieldName } from '../utility'

import { KIT } from '../types'

import type {
  KitModel,
} from '../types'

import type {
  SchemaDef,
} from '../def'

import type {
  OpName,
  ModelOp,
  ModelEntity,
  ModelTarget,
  ModelField,
} from '../model'



const fieldTransform: Transform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, def } = ctx
  const kit: KitModel = apimodel.main[KIT]

  let msg = 'field '

  const opFieldPrecedence: OpName[] = ['load', 'create', 'update', 'patch', 'list']

  each(kit.entity, (ment: ModelEntity, _entname: string) => {
    const fields = ment.fields
    const seen: any = {}

    for (let opname of opFieldPrecedence) {
      const mop = ment.op[opname]
      if (mop) {
        const mtargets = mop.points

        for (let mtarget of mtargets) {
          const opfields = resolveOpFields(ment, mop, mtarget, def)

          for (let opfield of opfields) {
            if (!seen[opfield.name]) {
              fields.push(opfield)
              seen[opfield.name] = opfield
            }
            else {
              mergeField(ment, mop, mtarget, def, seen[opfield.name], opfield)
            }
          }
        }
      }
    }

    fields.sort((a: ModelField, b: ModelField) => {
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
    })

    msg += ment.name + ' '
  })

  return { ok: true, msg }
}



function resolveOpFields(
  ment: ModelEntity,
  mop: ModelOp,
  mtarget: ModelTarget,
  def: any
): ModelField[] {
  const mfields: ModelField[] = []
  const fielddefs = findFieldDefs(ment, mop, mtarget, def)

  for (let fielddef of fielddefs) {
    const fieldname = (fielddef as any).key$ as string
    const name = canonize(normalizeFieldName(fieldname))
    const mfield: ModelField = {
      name,
      type: inferFieldType(name, validator(fielddef.type)),
      req: !!fielddef.required,
      op: {},
    }
    mfields.push(mfield)
  }

  return mfields
}


function findFieldDefs(
  _ment: ModelEntity,
  mop: ModelOp,
  mtarget: ModelTarget,
  def: any
): SchemaDef[] {
  const fielddefs: SchemaDef[] = []
  const pathdef = def.paths[mtarget.orig]

  const method = mtarget.method.toLowerCase()
  const opdef: any = pathdef[method]

  if (opdef) {
    const responses = opdef.responses
    const requestBody = opdef.requestBody

    let fieldSets

    if (responses) {
      fieldSets = getx(responses, '200 content "application/json" schema') ??
        getx(responses, '200 schema')
      if ('list' == mop.name) {
        // List responses commonly come in three shapes:
        //   1. direct array — { type: array, items: { ...item } }
        //   2. wrapper object — { properties: { items: [Item], page, ... } }
        //      (a single array-of-object property inside an object schema)
        //   3. legacy "list of created items" under 201
        // Resolve to the inner item schema when we can identify one
        // unambiguously; otherwise fall through to the 200 schema as-is.
        const unwrapped = unwrapArrayWrapper(fieldSets)
        if (unwrapped) {
          fieldSets = unwrapped
        }
        else {
          const fromCreated = getx(responses, '201 content "application/json" schema items') ??
            getx(responses, '201 schema items')
          if (fromCreated) fieldSets = fromCreated
        }
      }
      else if ('put' === method && null == fieldSets) {
        fieldSets = getx(responses, '201 content "application/json" schema') ??
          getx(responses, '201 schema')
      }
    }

    if (requestBody) {
      fieldSets = [
        fieldSets,
        getx(requestBody, 'content "application/json" schema') ??
        getx(requestBody, 'schema')
      ]
    }


    if (fieldSets) {
      if (Array.isArray(fieldSets.allOf)) {
        fieldSets = fieldSets.allOf
      }
      else if (fieldSets.properties) {
        fieldSets = [fieldSets]
      }
    }

    each(fieldSets, (fieldSet: any) => {
      const requiredNames: string[] = Array.isArray(fieldSet?.required)
        ? fieldSet.required : []
      each(fieldSet?.properties, (property: any) => {
        if (requiredNames.includes(property.key$)) {
          property.required = true
        }
        fielddefs.push(property)
      })
    })
  }

  // Fallback: infer fields from example response data when no schema properties found
  if (0 === fielddefs.length && opdef) {
    const exampleFields = inferFieldsFromExamples(opdef)
    for (const ef of exampleFields) {
      fielddefs.push(ef)
    }
  }

  return fielddefs
}


function inferFieldsFromExamples(opdef: any): SchemaDef[] {
  const example = findExampleObject(opdef)
  if (null == example || 'object' !== typeof example || Array.isArray(example)) {
    return []
  }

  const fielddefs: SchemaDef[] = []
  for (const [key, value] of Object.entries(example).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0)) {
    const fielddef: any = {
      key$: key,
      type: inferTypeFromValue(value),
    }
    fielddefs.push(fielddef)
  }
  return fielddefs
}


function findExampleObject(opdef: any): any {
  const responses = opdef.responses
  if (null == responses) return null

  const resdef = responses[200] ?? responses[201] ?? responses['200'] ?? responses['201']
  if (null == resdef) return null

  // OpenAPI 3.x: content.application/json.example
  let example = getx(resdef, 'content "application/json" example')
  if (null != example && 'object' === typeof example) return unwrapExample(example)

  // OpenAPI 3.x: content.application/json.examples (named examples — take first)
  const examples = getx(resdef, 'content "application/json" examples')
  if (null != examples && 'object' === typeof examples) {
    for (const val of Object.values(examples)) {
      const ex = (val as any)?.value
      if (null != ex && 'object' === typeof ex) return unwrapExample(ex)
    }
  }

  // OpenAPI 3.x: content.application/json.schema.example
  example = getx(resdef, 'content "application/json" schema example')
  if (null != example && 'object' === typeof example) return unwrapExample(example)

  // Swagger 2.0: response.example / response.examples.application/json
  example = resdef.example
  if (null != example && 'object' === typeof example) return unwrapExample(example)

  example = getx(resdef, 'examples "application/json"')
  if (null != example && 'object' === typeof example) return unwrapExample(example)

  // Swagger 2.0: schema.example
  example = getx(resdef, 'schema example')
  if (null != example && 'object' === typeof example) return unwrapExample(example)

  return null
}


// If the example is a wrapper with a single array property, unwrap to the first item
function unwrapExample(example: any): any {
  if (Array.isArray(example)) {
    return example.length > 0 ? example[0] : null
  }
  return example
}


// unwrapArrayWrapper inspects a list-response schema and, when it is an
// object with a single array-of-object-schema property (e.g.
// { boards: [Board] }, { items: [Foo], page, total, ... }), returns the
// inner item schema so that field resolution sees the actual entity
// properties rather than the wrapper's bookkeeping.
//
// Returns null if the input is not unambiguously such a wrapper:
//   - schema is already an array → return null (let caller use it directly)
//   - no array-of-object-schema property → return null
//   - more than one array-of-object-schema property → ambiguous, return null
function unwrapArrayWrapper(schema: any): any {
  if (null == schema || 'object' !== typeof schema) return null
  // Direct list shape — caller can resolve from items directly.
  if (schema.type === 'array' && schema.items) {
    const items = schema.items
    if (items && (items.properties || Array.isArray(items.allOf))) {
      return items
    }
    return null
  }
  if (null == schema.properties || 'object' !== typeof schema.properties) return null
  let resolved: any = null
  for (const key of Object.keys(schema.properties)) {
    const prop = schema.properties[key]
    if (null == prop || 'object' !== typeof prop) continue
    if (prop.type !== 'array' || null == prop.items) continue
    const items = prop.items
    if (null == items || 'object' !== typeof items) continue
    if (!items.properties && !Array.isArray(items.allOf)) continue
    if (resolved != null) return null // ambiguous: multiple array-of-object props
    resolved = items
  }
  return resolved
}


function inferTypeFromValue(value: any): string {
  if (null == value) return 'string'
  if ('boolean' === typeof value) return 'boolean'
  if ('number' === typeof value) {
    return Number.isInteger(value) ? 'integer' : 'number'
  }
  if ('string' === typeof value) return 'string'
  if (Array.isArray(value)) return 'array'
  if ('object' === typeof value) return 'object'
  return 'string'
}


function mergeField(
  ment: ModelEntity,
  mop: ModelOp,
  mtarget: ModelTarget,
  def: any,
  exisingField: ModelField,
  newField: ModelField
) {

  if (newField.req !== exisingField.req) {
    exisingField.op[mop.name] = {
      req: newField.req,
      type: newField.type,
    }
  }

  return exisingField
}


export {
  fieldTransform,
  inferFieldsFromExamples,
  inferTypeFromValue,
}
