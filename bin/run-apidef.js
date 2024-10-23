#!/usr/bin/env node

const Path = require('node:path')
const { statSync } = require('node:fs')
const { parseArgs } = require('node:util')

const { Gubu, Fault } = require('gubu')
const { Aontu, Context } = require('aontu')


const Pkg = require('../package.json')

const { ApiDef } = require('../dist/apidef.js') 


let DEBUG = false
let CONSOLE = console


try {
  let options = resolveOptions()

  if(options.debug) {
    DEBUG = true
  }

  if(options.version) {
    version()
  }

  if(options.help) {
    help()
  }

  if(options.version || options.help) {
    exit()
  }

  options = validateOptions(options)

  generate(options)
  
}
catch(err) {
  handleError(err)
}



function exit(err) {
  let code = 0
  if(err) {
    code = 1
  }
  process.exit(code)
}


function generate(options) {
  const apidef = new ApiDef({
    debug: options.debug
  })

  const spec = {
    def: options.def,
    kind: 'openapi-3',
    model: Path.join(options.folder,'model/api.jsonic'),
    meta: { name: options.name },
  }

  if(options.watch) {
    apidef.watch(spec)
  }
  else {
    apidef.generate(spec)
  }

}



function resolveOptions() {

  const args = parseArgs({
    allowPositionals: true,
    options: {
      folder: {
        type: 'string',
        short: 'f',
        default: '',
      },
      
      def: {
        type: 'string',
        short: 'd',
        default: '',
      },
      
      watch: {
        type: 'boolean',
        short: 'w',
      },
      
      debug: {
        type: 'boolean',
        short: 'g',
      },
      
      help: {
        type: 'boolean',
        short: 'h',
      },
      
      version: {
        type: 'boolean',
        short: 'v',
      },
      
    }
  })

  const options = {
    name: args.positionals[0],
    folder: '' === args.values.folder ? args.positionals[0] : args.values.folder,
    def: args.values.def,
    watch: !!args.values.watch,
    debug: !!args.values.debug,
    help: !!args.values.help,
    version: !!args.values.version,
  }

  return options
}


function validateOptions(rawOptions) {
  const optShape = Gubu({
    name: Fault('The first argument should be the project name.', String),
    folder: String,
    def: '',
    watch: Boolean,
    debug: Boolean,
    help: Boolean,
    version: Boolean,
  })

  const err = []
  const options = optShape(rawOptions,{err})

  if(err[0]) {
    throw new Error(err[0].text)
  }

  if('' !== options.def) {
    options.def = Path.resolve(options.def)
    const stat = statSync(options.def, {throwIfNoEntry:false})
    if(null == stat) {
      throw new Error('Definition file not found: '+options.def)
    }
  }

  return options
}


function handleError(err) {
  CONSOLE.log('Voxgig SDK Generator Error:')

  if(DEBUG) {
    CONSOLE.log(err)
  }
  else {
    CONSOLE.log(err.message)
  }
  
  exit(err)
}


function version() {
  CONSOLE.log(Pkg.version)
}


function help() {
  const s = 'TODO'
  CONSOLE.log(s)
}
