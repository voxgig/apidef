

import { each, getx } from 'jostraca'

import type { TransformCtx, TransformSpec } from '../transform'

import { fixName } from '../transform'



async function fieldTransform(
  ctx: TransformCtx,
  tspec: TransformSpec,
  model: any,
  def: any
) {
  const { guide: { guide } } = ctx

  each(guide.entity, (guideEntity: any) => {

    const entityModel = model.main.api.entity[guideEntity.key$]
    each(guideEntity.path, (guidePath: any) => {
      const pathdef = def.paths[guidePath.key$]

      each(guidePath.op, (op: any) => {

        if ('load' === op.key$) {
          fieldbuild(entityModel, pathdef, op, guidePath, guideEntity, model)
        }

      })
    })
  })

  return { ok: true }
}


function fieldbuild(
  entityModel: any, pathdef: any, op: any, path: any, entity: any, model: any
) {
  // console.log('FB-A', op, pathdef)

  let fieldSets = getx(pathdef.get, 'responses 200 content "application/json" schema')

  if (fieldSets) {
    if (Array.isArray(fieldSets.allOf)) {
      fieldSets = fieldSets.allOf
    }
    else if (fieldSets.properties) {
      fieldSets = [fieldSets]
    }
  }

  // console.log('TRANSFORM-FIELDSETS', fieldSets)

  each(fieldSets, (fieldSet: any) => {
    each(fieldSet.properties, (property: any) => {
      // console.log(property)

      const field =
        (entityModel.field[property.key$] = entityModel.field[property.key$] || {})

      field.name = property.key$
      fixName(field, field.name)

      field.type = property.type
      fixName(field, field.type, 'type')

      field.short = property.description

      // console.log('FB-ID', field.name, entityModel.param)
    })
  })

  // Guess id field name using GET path param
  if ('load' === op.key$) {
    const getdef = pathdef.get
    const getparams = getdef.parameters || []
    if (1 === getparams.length) {
      if (entityModel.op.load.path.match(RegExp('\\{' + getdef.parameters[0].name + '\\}$'))) {
        entityModel.id.field = getdef.parameters[0].name
      }
    }
  }

}



export {
  fieldTransform
}




/*

# API Specification Transform Guide


@"@voxgig/apidef/model/guide.jsonic"


guide: control: transform: openapi: order: `

  top,
  entity,
  operation,
  field,
  customField,
  
  `

guide: transform: customField: {
  load: 'customField.js'
}


guide: entity: {
  pet: path: {
    '/pet/{petId}': {
      op:{ load: 'get', create: 'post', save: 'put' }
    }
  }
  pet: test: {
    quick: {
      active: true,
      create: { id: 1, name:'Rex' },
      load: { id: 1 },
    }
  }

  # direct custom definition
  pet: def: {}
}




const { each, getx } = require('jostraca')


async function customField(ctx, tspec, model, def) {
  const { spec, util: {fixName} } = ctx

  const nameField = {
    name: 'name',
    type: 'string',
    short: 'Name of pet'
  }
  fixName(nameField, nameField.name)
  fixName(nameField, nameField.type, 'type')
  
  const ageField = {
    name: 'age',
    type: 'number',
    short: 'Age of pet'
  }
  fixName(ageField, ageField.name)
  fixName(ageField, ageField.type, 'type')

  
  Object.assign(model.main.api.entity.pet.field, {
    name: nameField,
    age: ageField,
  })
  
  return { ok: true }
}


module.exports = {
  customField
}

  
  */
