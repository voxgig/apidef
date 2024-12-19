
const { readFileSync, writeFileSync, readdirSync } = require('node:fs')

const { parse } = require('../dist/parse')


const match = process.argv[2]

const defs = readdirSync(__dirname+'/def')
      .filter(fn=>fn.includes('-def.') &&
              !fn.endsWith('~') &&
              (!match || fn.includes(match)))

// console.log(match, defs)

run()

async function run() {
  defs.map(async def=>{
    console.log(def)
    const source = readFileSync(__dirname+'/def/'+def,'utf8')
    const result = await parse('OpenAPI', source)
    writeFileSync(__dirname+'/def/'+(def.replace('-def.','-full.'))+'.json',
                  JSON.stringify(result,null,2))
  })
}
