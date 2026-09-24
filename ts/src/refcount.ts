/* Copyright (c) 2026 Voxgig, MIT License */

import { decycledChild } from './parse'


const REFCOUNT_CAP = 1_000_000_000

const ROOT = '\x01ROOT'

const INDEX_RE = /^(0|[1-9]\d*)$/

type Body = Map<string, number>


function satAdd(a: number, b: number): number {
  return Math.min(a + b, REFCOUNT_CAP)
}


function satMul(a: number, w: number): number {
  if (0 === a || 0 === w) return 0
  if (a > Math.floor(REFCOUNT_CAP / w)) return REFCOUNT_CAP
  return a * w
}


function byCodePoint(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const x = a.charCodeAt(i)
    const y = b.charCodeAt(i)
    if (x !== y) return codePointRank(x) - codePointRank(y)
  }
  return a.length - b.length
}


// Surrogate units sort below U+E000-U+FFFF as UTF-16 but above them by code point.
function codePointRank(unit: number): number {
  return unit < 0xD800 ? unit : unit < 0xE000 ? unit + 0x2000 : unit - 0x800
}


function isNode(v: any): boolean {
  return null != v && 'object' === typeof v
}


function refLabel(v: any): string | undefined {
  if (!isNode(v) || Array.isArray(v)) return undefined
  if ('string' === typeof v['x-ref']) return v['x-ref']
  if (!Object.prototype.hasOwnProperty.call(v, 'x-ref') && 'string' === typeof v.$ref) {
    return v.$ref
  }
  return undefined
}


function hasKid(node: any, key: string): boolean {
  if (!isNode(node)) return false
  return Array.isArray(node) ?
    INDEX_RE.test(key) && Number(key) < node.length :
    Object.prototype.hasOwnProperty.call(node, key)
}


function hasKids(node: any): boolean {
  if (!isNode(node)) return false
  return 0 < (Array.isArray(node) ? node.length : Object.keys(node).length)
}


function kidKeys(node: any): string[] {
  return Array.isArray(node) ?
    node.map((_: any, i: number) => String(i)) : Object.keys(node)
}


// Parts join on '\0'. Escaping '\0' and '\x01' keeps keys injective and in part
// order, and an escape never puts 'R' after '\x01', so no key equals ROOT.
function nodeKey(label: string, over: string[]): string {
  return [label, ...over]
    .map(part => part.replace(/[\0\x01]/g, c => '\0' === c ? '\x01\x01' : '\x01\x02'))
    .join('\0')
}


// Occurrences of each reference label per use in the resolved spec, where a $ref
// chain resolves to its first label.
function countRefs(def: any): Record<string, number> {
  const targets = new Map<string, any>()
  const target = (label: string): any => {
    if (targets.has(label)) return targets.get(label)
    let t: any = undefined
    if (label.startsWith('#/')) {
      t = def
      for (const raw of label.substring(2).split('/')) {
        const part = raw.replace(/~1/g, '/').replace(/~0/g, '~')
        if (!hasKid(t, part)) {
          t = undefined
          break
        }
        t = decycledChild(t, part)
      }
      if (!isNode(t)) t = undefined
    }
    targets.set(label, t)
    return t
  }

  const same = (a: any, b: any): boolean => {
    if (isNode(a) && a === b) return true
    const label = refLabel(a)
    return undefined !== label && label === refLabel(b)
  }

  const labelOf = new Map<string, string>()
  const skipOf = new Map<string, Set<string>>()
  const found: string[] = []

  const scan = (start: any, skip: Set<string>): Body => {
    const body: Body = new Map()
    const expanded = new Set<any>()
    const stack: any[] = []
    for (const k of kidKeys(start)) {
      if ('x-ref' !== k && '$ref' !== k && !skip.has(k)) {
        stack.push(decycledChild(start, k))
      }
    }

    while (0 < stack.length) {
      const v = stack.pop()
      if (!isNode(v)) continue

      const label = refLabel(v)
      if (undefined === label) {
        // Expanding a shared plain node once per scan is what ends a cycle of them.
        if (expanded.has(v)) continue
        expanded.add(v)
        for (const k of kidKeys(v)) stack.push(decycledChild(v, k))
        continue
      }

      const t = target(label)
      const over: string[] = []
      for (const k of Object.keys(v)) {
        if ('x-ref' === k || '$ref' === k) continue
        const vk = decycledChild(v, k)
        if (hasKid(t, k)) {
          const tk = decycledChild(t, k)
          if (same(vk, tk)) continue
          if (hasKids(tk)) over.push(k)
        }
        stack.push(vk)
      }
      over.sort(byCodePoint)

      const node = nodeKey(label, over)
      if (!labelOf.has(node)) {
        labelOf.set(node, label)
        skipOf.set(node, new Set(over))
        found.push(node)
      }
      body.set(node, (body.get(node) ?? 0) + 1)
    }

    return body
  }

  const bodies = new Map<string, Body>([[ROOT, scan(def, new Set())]])
  for (let i = 0; i < found.length; i++) {
    const node = found[i]
    const t = target(labelOf.get(node) as string)
    bodies.set(node, undefined === t ? new Map() : scan(t, skipOf.get(node) as Set<string>))
  }

  const count = countPaths(bodies)

  const out: Record<string, number> = {}
  for (const node of found) {
    const label = labelOf.get(node) as string
    out[label] = satAdd(out[label] ?? 0, count.get(node) ?? 0)
  }
  return out
}


function countPaths(bodies: Map<string, Body>): Map<string, number> {
  // Code-point order, so both ports cut the same edge of a reference cycle.
  const successors = (u: string) =>
    [...(bodies.get(u) as Body).keys()].sort(byCodePoint)

  const onStack = new Set<string>([ROOT])
  const finished = new Set<string>()
  const backEdges = new Map<string, Set<string>>()
  const post: string[] = []

  const stack = [{ node: ROOT, next: successors(ROOT), i: 0 }]
  while (0 < stack.length) {
    const frame = stack[stack.length - 1]
    if (frame.i < frame.next.length) {
      const v = frame.next[frame.i++]
      if (onStack.has(v)) {
        let cut = backEdges.get(frame.node)
        if (undefined === cut) {
          cut = new Set()
          backEdges.set(frame.node, cut)
        }
        cut.add(v)
      }
      else if (!finished.has(v)) {
        onStack.add(v)
        stack.push({ node: v, next: successors(v), i: 0 })
      }
    }
    else {
      stack.pop()
      onStack.delete(frame.node)
      finished.add(frame.node)
      post.push(frame.node)
    }
  }

  const count = new Map<string, number>([[ROOT, 1]])
  for (let i = post.length - 1; 0 <= i; i--) {
    const u = post[i]
    const cu = count.get(u) ?? 0
    const cut = backEdges.get(u)
    for (const [v, w] of bodies.get(u) as Body) {
      if (cut?.has(v)) continue
      count.set(v, satAdd(count.get(v) ?? 0, satMul(cu, w)))
    }
  }
  return count
}


export {
  REFCOUNT_CAP,
  byCodePoint,
  countRefs,
  satAdd,
  satMul,
}
