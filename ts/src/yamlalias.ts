/* Copyright (c) 2026 Voxgig Ltd, MIT License */

// The YAML parser copies an anchor's node in full for every alias, so nested
// aliases grow geometrically. This reads, from the text and before anything is
// parsed, the size the source reaches once every alias is copied in.

const YAML_ALIAS_FACTOR = 10
const YAML_ALIAS_FLOOR = 1_000_000

type Anchor = { name: string, start: number, end: number }
type Alias = { name: string, at: number, target?: Anchor }

const SP = 0x20, TAB = 0x09, LF = 0x0a, CR = 0x0d
const HASH = 0x23, DQ = 0x22, SQ = 0x27, BSL = 0x5c, COLON = 0x3a, COMMA = 0x2c
const DASH = 0x2d, QMARK = 0x3f, AMP = 0x26, STAR = 0x2a, BANG = 0x21
const LSQ = 0x5b, RSQ = 0x5d, LCB = 0x7b, RCB = 0x7d, PIPE = 0x7c, GT = 0x3e

const isSpace = (c: number) => SP === c || TAB === c
const isBreak = (c: number) => LF === c || CR === c
const isGap = (c: number | undefined) => undefined === c || isSpace(c) || isBreak(c)


function yamlAliasLimit(src: string): number {
  return Math.max(YAML_ALIAS_FLOOR, YAML_ALIAS_FACTOR * utf8(src).length)
}


// In bytes of UTF-8, which the Go port counts too.
function yamlAliasedSize(src: string): number {
  const b = utf8(src)
  if (!b.includes(AMP) || !b.includes(STAR)) return b.length

  const { anchors, aliases } = scanYamlNodes(b)
  if (0 === aliases.length) return b.length

  // An alias names the last anchor of its name before it.
  const latest = new Map<string, Anchor>()
  let ai = 0
  for (const alias of aliases) {
    while (ai < anchors.length && anchors[ai].start < alias.at) {
      latest.set(anchors[ai].name, anchors[ai])
      ai++
    }
    alias.target = latest.get(alias.name)
  }

  const sizes = new Map<Anchor, number>()
  const open = new Set<Anchor>()
  const size = (a: Anchor): number => {
    const known = sizes.get(a)
    if (undefined !== known) return known
    if (open.has(a)) return 0
    open.add(a)
    let n = a.end - a.start
    for (let x = firstAt(aliases, a.start); x < aliases.length && aliases[x].at < a.end; x++) {
      const t = aliases[x].target
      if (undefined !== t) n += size(t)
    }
    open.delete(a)
    sizes.set(a, n)
    return n
  }

  let total = b.length
  for (const alias of aliases) {
    if (undefined !== alias.target) total += size(alias.target)
  }
  return total
}


function utf8(src: string): Uint8Array {
  return new TextEncoder().encode(src)
}


// Index of the first alias at or after a byte offset.
function firstAt(aliases: Alias[], at: number): number {
  let lo = 0, hi = aliases.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (aliases[mid].at < at) lo = mid + 1
    else hi = mid
  }
  return lo
}


// Anchors with the byte range of the node each labels, and aliases with where
// they stand. Comments, quoted strings and block scalars are skipped.
function scanYamlNodes(b: Uint8Array): { anchors: Anchor[], aliases: Alias[] } {
  const anchors: Anchor[] = []
  const aliases: Alias[] = []

  // A block node's anchor ends where a later line returns to its indent;
  // others end with their bracket or their line.
  const blockAnchors: { anchor: Anchor, indent: number, afterKey: boolean }[] = []
  const bracketAnchors: { anchor: Anchor, depth: number }[] = []

  let flow = 0
  let blockIndent = -1
  let lineIndent = 0
  let lineBegin = 0
  let scalarCol = 0
  let keyCol = 0
  let lineStart = true
  let nodeStart = true
  let afterKey = false
  let i = 0

  while (i < b.length) {
    if (lineStart) {
      lineStart = false
      lineBegin = i
      const j = indentEnd(b, i)
      const blank = j >= b.length || isBreak(b[j]) || HASH === b[j]
      if (0 <= blockIndent && (blank || j - i > blockIndent)) {
        i = endOfLine(b, i)
        continue
      }
      blockIndent = -1
      lineIndent = j - i
      if (0 === flow) {
        nodeStart = true
        afterKey = false
      }
      i = j
      continue
    }

    const c = b[i]
    if (LF === c) {
      lineStart = true
      i++
    }
    else if (CR === c || isSpace(c)) {
      i++
    }
    else if (HASH === c && isGap(b[i - 1])) {
      i = endOfLine(b, i)
    }
    else if (nodeStart && (DQ === c || SQ === c)) {
      scalarCol = i - lineBegin
      i = endOfQuoted(b, i)
      nodeStart = false
    }
    else if (nodeStart && STAR === c) {
      const end = endOfName(b, i + 1)
      aliases.push({ name: decode(b, i + 1, end), at: i })
      nodeStart = false
      i = end
    }
    else if (nodeStart && AMP === c) {
      const end = endOfName(b, i + 1)
      const anchor: Anchor = { name: decode(b, i + 1, end), start: i, end: b.length }
      anchors.push(anchor)
      let k = end
      while (k < b.length && isSpace(b[k])) k++
      if (k >= b.length || isBreak(b[k]) || HASH === b[k]) {
        blockAnchors.push({ anchor, indent: afterKey ? keyCol : lineIndent, afterKey })
      }
      else if (LSQ === b[k] || LCB === b[k]) {
        bracketAnchors.push({ anchor, depth: flow + 1 })
      }
      else {
        anchor.end = 0 < flow ? endOfFlowScalar(b, k) : endOfLine(b, k)
      }
      i = end
    }
    else if (nodeStart && BANG === c) {
      i = endOfName(b, i + 1)
    }
    else if (nodeStart && 0 === flow && (PIPE === c || GT === c)) {
      blockIndent = lineIndent
      i = endOfLine(b, i)
    }
    else if (LSQ === c || LCB === c) {
      flow++
      nodeStart = true
      i++
    }
    else if (RSQ === c || RCB === c) {
      for (let x = bracketAnchors.length - 1; 0 <= x; x--) {
        if (bracketAnchors[x].depth === flow) {
          bracketAnchors[x].anchor.end = i + 1
          bracketAnchors.splice(x, 1)
        }
      }
      flow = Math.max(0, flow - 1)
      nodeStart = false
      i++
    }
    else if (COMMA === c && 0 < flow) {
      nodeStart = true
      i++
    }
    else if (nodeStart && 0 === flow && (DASH === c || QMARK === c) && isGap(b[i + 1])) {
      i++
    }
    else if (COLON === c && (0 < flow || isGap(b[i + 1]))) {
      nodeStart = true
      afterKey = 0 === flow
      keyCol = scalarCol
      i++
    }
    else {
      if (nodeStart) scalarCol = i - lineBegin
      nodeStart = false
      i++
    }
  }

  for (const { anchor, indent, afterKey: keyed } of blockAnchors) {
    anchor.end = blockEnd(b, endOfLine(b, anchor.start), indent, keyed)
  }

  return { anchors, aliases }
}


// The first line after `from` that returns to `indent`; a compact sequence
// under a key may sit at the key's own indent.
function blockEnd(b: Uint8Array, from: number, indent: number, keyed: boolean): number {
  let s = from
  while (s < b.length) {
    s = LF === b[s] ? s + 1 : endOfLine(b, s) + 1
    if (s >= b.length) break
    const j = indentEnd(b, s)
    if (j >= b.length || isBreak(b[j]) || HASH === b[j]) continue
    const d = j - s
    const entry = DASH === b[j] && isGap(b[j + 1])
    if (d < indent || (d === indent && !(keyed && entry))) return s
  }
  return b.length
}


function indentEnd(b: Uint8Array, i: number): number {
  while (i < b.length && SP === b[i]) i++
  return i
}


function endOfLine(b: Uint8Array, i: number): number {
  while (i < b.length && LF !== b[i]) i++
  return i
}


function endOfQuoted(b: Uint8Array, i: number): number {
  const q = b[i]
  i++
  while (i < b.length) {
    if (DQ === q && BSL === b[i]) {
      i += 2
    }
    else if (q === b[i] && SQ === q && SQ === b[i + 1]) {
      i += 2
    }
    else if (q === b[i]) {
      return i + 1
    }
    else {
      i++
    }
  }
  return i
}


function endOfName(b: Uint8Array, i: number): number {
  while (i < b.length && !isGap(b[i]) && COMMA !== b[i] && LSQ !== b[i] &&
    RSQ !== b[i] && LCB !== b[i] && RCB !== b[i] &&
    !(COLON === b[i] && isGap(b[i + 1]))) {
    i++
  }
  return i
}


function endOfFlowScalar(b: Uint8Array, i: number): number {
  while (i < b.length && !isBreak(b[i]) && COMMA !== b[i] && RSQ !== b[i] && RCB !== b[i]) i++
  return i
}


function decode(b: Uint8Array, start: number, end: number): string {
  return new TextDecoder().decode(b.subarray(start, end))
}


export {
  yamlAliasedSize,
  yamlAliasLimit,
}
