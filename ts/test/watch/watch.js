
const { ApiDef } = require('../..')

const apidef = ApiDef()

const spec = {
  def: __dirname+'/openapi-3.yml',
  kind: 'openapi-3',
  model: __dirname+'/openapi-3.vxg',
  meta: {
    name: 'foo'
  },
  entity: {
    Pet: {
      path: {
        '/pets/{petId}': { method: 'GET:load', param: 'petId' },
      }
    }
  }
}


apidef.watch(spec)


