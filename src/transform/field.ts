

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
        const mtargets = mop.targets

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
      if ('get' === method && 'list' == mop.name) {
        fieldSets = getx(responses, '201 content "application/json" schema items') ??
          getx(responses, '201 schema items')
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
      each(fieldSet?.properties, (property: any) => {
        fielddefs.push(property)
      })
    })
  }

  return fielddefs
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
}
