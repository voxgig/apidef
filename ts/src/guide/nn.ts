/* Copyright (c) 2026 Voxgig, MIT License */

// Dense inference over named features, for weights written by hand: a unit
// is a bias and a sparse row keyed by input name, so a typo in a row is an
// error rather than a silent zero.


type Vec = Record<string, number>

type Unit = {
  b: number
  w: Record<string, number>
}

type Activation = 'relu' | 'linear'

type Layer = {
  inputs: string[]
  outputs: string[]
  w: number[][]
  b: number[]
  act: Activation
}

type Net = {
  features: string[]
  layers: Layer[]
  classes: string[]
}

type Decision = {
  cls: string
  index: number
  p: number[]
  logits: number[]
  hidden: number[]
  // The hidden units that moved the winning logit most, highest first.
  evidence: { unit: string, amount: number }[]
}


function dense(
  inputs: string[],
  units: Record<string, Unit>,
  act: Activation,
): Layer {
  const index: Record<string, number> = Object.create(null)
  inputs.forEach((name, i) => index[name] = i)

  const outputs = Object.keys(units)
  const w: number[][] = []
  const b: number[] = []

  for (const name of outputs) {
    const unit = units[name]
    const row = new Array(inputs.length).fill(0)
    for (const input of Object.keys(unit.w)) {
      const i = index[input]
      if (undefined === i) {
        throw new Error('nn: unit ' + name + ' weights unknown input ' + input)
      }
      row[i] = unit.w[input]
    }
    w.push(row)
    b.push(unit.b)
  }

  return { inputs, outputs, w, b, act }
}


function relu(x: number): number {
  return 0 < x ? x : 0
}


function apply(layer: Layer, x: number[]): number[] {
  const out: number[] = []
  for (let j = 0; j < layer.outputs.length; j++) {
    let sum = layer.b[j]
    const row = layer.w[j]
    for (let i = 0; i < row.length; i++) {
      sum += row[i] * x[i]
    }
    out.push('relu' === layer.act ? relu(sum) : sum)
  }
  return out
}


function vector(names: string[], x: Vec): number[] {
  return names.map((name) => {
    const v = x[name]
    return 'number' === typeof v && Number.isFinite(v) ? v : 0
  })
}


function forward(layers: Layer[], x: number[]): number[][] {
  const acts: number[][] = [x]
  for (const layer of layers) {
    acts.push(apply(layer, acts[acts.length - 1]))
  }
  return acts
}


function softmax(logits: number[]): number[] {
  let max = -Infinity
  for (const v of logits) {
    max = v > max ? v : max
  }
  const exps = logits.map((v) => Math.exp(v - max))
  const sum = exps.reduce((a, v) => a + v, 0)
  return exps.map((v) => v / sum)
}


// The first of equal maxima, so ties resolve to the earlier class.
function argmax(v: number[]): number {
  let best = 0
  for (let i = 1; i < v.length; i++) {
    if (v[i] > v[best]) {
      best = i
    }
  }
  return best
}


function makeNet(
  features: string[],
  hidden: Record<string, Unit>,
  out: Record<string, Unit>,
): Net {
  const h = dense(features, hidden, 'relu')
  const o = dense(h.outputs, out, 'linear')
  return { features, layers: [h, o], classes: o.outputs }
}


function decide(net: Net, x: Vec): Decision {
  const acts = forward(net.layers, vector(net.features, x))
  const hidden = acts[1]
  const logits = acts[acts.length - 1]
  const p = softmax(logits)
  const index = argmax(logits)
  const out = net.layers[net.layers.length - 1]

  const evidence = out.outputs.length === 0 ? [] : hidden
    .map((h, j) => ({ unit: out.inputs[j], amount: out.w[index][j] * h }))
    .filter((e) => 0 < e.amount)
    .sort((a, b) => b.amount - a.amount || (a.unit < b.unit ? -1 : 1))
    .slice(0, 3)

  return { cls: net.classes[index], index, p, logits, hidden, evidence }
}


// A one-line record of a decision for a why trace.
function explain(label: string, d: Decision): string {
  const ev = d.evidence.map((e) => e.unit + '=' + e.amount.toFixed(1)).join(',')
  return 'nn:' + label + '=' + d.cls + '(' + d.p[d.index].toFixed(2) + ')' +
    ('' === ev ? '' : '[' + ev + ']')
}


export {
  dense,
  relu,
  apply,
  vector,
  forward,
  softmax,
  argmax,
  makeNet,
  decide,
  explain,
}

export type {
  Vec,
  Unit,
  Activation,
  Layer,
  Net,
  Decision,
}
