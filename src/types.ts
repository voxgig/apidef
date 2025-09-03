/* Copyright (c) 2025 Voxgig, MIT License */

import * as Fs from 'node:fs'

import { Pino, prettyPino } from '@voxgig/util'
import { Gubu, Open, Any } from 'gubu'


type FsUtil = typeof Fs
type Log = ReturnType<typeof prettyPino>


type ApiDefOptions = {
  def?: string
  fs?: any
  pino?: ReturnType<typeof Pino>
  debug?: boolean | string
  folder?: string
  meta?: Record<string, any>
  outprefix?: string
  strategy?: string
}

const ControlShape = Gubu({
  step: {
    parse: true,
    guide: true,
    transformers: true,
    builders: true,
    generate: true,
  }
})
const OpenControlShape = Gubu(Open(ControlShape), { name: 'Control' })

type Control = ReturnType<typeof ControlShape>



const ModelShape = Gubu({
  name: String,
  def: String,
  main: {
    sdk: {},
    def: {},
    api: {
      guide: {},
      entity: {},
    },
  }
})
const OpenModelShape = Gubu(Open(ModelShape), { name: 'Model' })

type Model = ReturnType<typeof ModelShape>


const BuildShape = Gubu({
  spec: {
    base: '',
    path: '',
    debug: '',
    use: {},
    res: [],
    require: '',
    log: {},
    fs: Any(),
    dryrun: false,
    buildargs: {},
    watch: {
      mod: true,
      add: true,
      rem: true,
    }
  }
})
const OpenBuildShape = Gubu(Open(BuildShape))

type Build = ReturnType<typeof BuildShape>



type ApiModel = {
  main: {
    api: Record<string, any>
    sdk: {
      entity: Record<string, any>
      flow: Record<string, any>
    }
    def: Record<string, any>
  }
}


type ApiDefResult = {
  ok: boolean
  start: number
  end: number
  steps: string[]
  ctrl: Control

  guide?: any
  apimodel?: any
  ctx?: any
  jres?: any
}


export {
  OpenControlShape,
  OpenModelShape,
  OpenBuildShape,
}


export type {
  Log,
  FsUtil,
  ApiDefOptions,
  ApiDefResult,
  Control,
  Model,
  Build,
  ApiModel,
}

