"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fieldTransform = fieldTransform;
const jostraca_1 = require("jostraca");
const transform_1 = require("../transform");
async function fieldTransform(ctx, tspec, model, def) {
    const { model: { main: { guide } } } = ctx;
    let msg = 'fields: ';
    (0, jostraca_1.each)(guide.entity, (guideEntity) => {
        const entityModel = model.main.api.entity[guideEntity.key$];
        let fieldCount = 0;
        (0, jostraca_1.each)(guideEntity.path, (guidePath) => {
            const pathdef = def.paths[guidePath.key$];
            (0, jostraca_1.each)(guidePath.op, (op) => {
                if ('load' === op.key$) {
                    fieldCount = fieldbuild(entityModel, pathdef, op, guidePath, guideEntity, model);
                }
            });
        });
        msg += guideEntity.name + '=' + fieldCount + ' ';
    });
    return { ok: true, msg };
}
function fieldbuild(entityModel, pathdef, op, path, entity, model) {
    // console.log('FB-A', op, pathdef)
    let fieldCount = 0;
    let fieldSets = (0, jostraca_1.getx)(pathdef.get, 'responses 200 content "application/json" schema');
    if (fieldSets) {
        if (Array.isArray(fieldSets.allOf)) {
            fieldSets = fieldSets.allOf;
        }
        else if (fieldSets.properties) {
            fieldSets = [fieldSets];
        }
    }
    // console.log('TRANSFORM-FIELDSETS', fieldSets)
    (0, jostraca_1.each)(fieldSets, (fieldSet) => {
        (0, jostraca_1.each)(fieldSet.properties, (property) => {
            // console.log(property)
            const field = (entityModel.field[property.key$] = entityModel.field[property.key$] || {});
            field.name = property.key$;
            (0, transform_1.fixName)(field, field.name);
            field.type = property.type;
            (0, transform_1.fixName)(field, field.type, 'type');
            field.short = property.description;
            fieldCount++;
            // console.log('FB-ID', field.name, entityModel.param)
        });
    });
    // Guess id field name using GET path param
    if ('load' === op.key$) {
        const getdef = pathdef.get;
        const getparams = getdef.parameters || [];
        if (1 === getparams.length) {
            if (entityModel.op.load.path.match(RegExp('\\{' + getdef.parameters[0].name + '\\}$'))) {
                entityModel.id.field = getdef.parameters[0].name;
            }
        }
    }
    return fieldCount;
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
      op:{ load: 'get', create: 'post', update: 'put' }
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
//# sourceMappingURL=field.js.map