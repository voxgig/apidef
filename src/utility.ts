
import Path from 'node:path'


import type {
  FsUtil,
  Log
} from './types'


function writeChanged(
  point: string, path: string, content: string,
  fs: FsUtil, log: Log,
  flags?: { update?: boolean }
) {
  let exists = false
  let changed = false

  flags = flags || {}
  flags.update = null == flags.update ? true : !!flags.update

  let action = ''
  try {
    let existingContent: string = ''
    path = Path.normalize(path)

    exists = fs.existsSync(path)

    if (exists) {
      action = 'read'
      existingContent = fs.readFileSync(path, 'utf8')
    }

    changed = existingContent !== content

    action = flags.update ? 'write' : 'skip'

    log.info({
      point: 'write-' + point,
      note: (changed ? '' : 'not-') + 'changed ' + path,
      write: 'file', skip: !changed, exists, changed,
      contentLength: content.length, file: path
    })

    if (!exists || (changed && flags.update)) {
      fs.writeFileSync(path, content)
    }
  }
  catch (err: any) {
    log.error({
      fail: action, point, file: path, exists, changed,
      contentLength: content.length, err
    })
    err.__logged__ = true
    throw err
  }
}


export {
  writeChanged
}
