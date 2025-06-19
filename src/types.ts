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
}


const ModelShape = Gubu({
  def: String,
  main: {
    sdk: {},
    def: {},
    api: {},
  }
})
const OpenModelShape = Gubu(Open(ModelShape))

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
    api: {
      entity: Record<string, any>
    }
    def: Record<string, any>
  }
}


export {
  OpenModelShape,
  OpenBuildShape,
}


export type {
  Log,
  FsUtil,
  ApiDefOptions,
  Model,
  Build,
  ApiModel,
}

