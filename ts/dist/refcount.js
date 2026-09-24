"use strict";
/* Copyright (c) 2026 Voxgig, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.REFCOUNT_CAP = void 0;
exports.byCodePoint = byCodePoint;
exports.countRefs = countRefs;
exports.satAdd = satAdd;
exports.satMul = satMul;
const parse_1 = require("./parse");
const REFCOUNT_CAP = 1_000_000_000;
exports.REFCOUNT_CAP = REFCOUNT_CAP;
const ROOT = '\x01ROOT';
const INDEX_RE = /^(0|[1-9]\d*)$/;
function satAdd(a, b) {
    return Math.min(a + b, REFCOUNT_CAP);
}
function satMul(a, w) {
    if (0 === a || 0 === w)
        return 0;
    if (a > Math.floor(REFCOUNT_CAP / w))
        return REFCOUNT_CAP;
    return a * w;
}
function byCodePoint(a, b) {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
        const x = a.charCodeAt(i);
        const y = b.charCodeAt(i);
        if (x !== y)
            return codePointRank(x) - codePointRank(y);
    }
    return a.length - b.length;
}
// Surrogate units sort below U+E000-U+FFFF as UTF-16 but above them by code point.
function codePointRank(unit) {
    return unit < 0xD800 ? unit : unit < 0xE000 ? unit + 0x2000 : unit - 0x800;
}
function isNode(v) {
    return null != v && 'object' === typeof v;
}
function refLabel(v) {
    if (!isNode(v) || Array.isArray(v))
        return undefined;
    if ('string' === typeof v['x-ref'])
        return v['x-ref'];
    if (!Object.prototype.hasOwnProperty.call(v, 'x-ref') && 'string' === typeof v.$ref) {
        return v.$ref;
    }
    return undefined;
}
function hasKid(node, key) {
    if (!isNode(node))
        return false;
    return Array.isArray(node) ?
        INDEX_RE.test(key) && Number(key) < node.length :
        Object.prototype.hasOwnProperty.call(node, key);
}
function hasKids(node) {
    if (!isNode(node))
        return false;
    return 0 < (Array.isArray(node) ? node.length : Object.keys(node).length);
}
function kidKeys(node) {
    return Array.isArray(node) ?
        node.map((_, i) => String(i)) : Object.keys(node);
}
// Parts join on '\0'. Escaping '\0' and '\x01' keeps keys injective and in part
// order, and an escape never puts 'R' after '\x01', so no key equals ROOT.
function nodeKey(label, over) {
    return [label, ...over]
        .map(part => part.replace(/[\0\x01]/g, c => '\0' === c ? '\x01\x01' : '\x01\x02'))
        .join('\0');
}
// Occurrences of each reference label per use, as if every reference were inlined.
function countRefs(def) {
    const targets = new Map();
    const target = (label) => {
        if (targets.has(label))
            return targets.get(label);
        let t = undefined;
        if (label.startsWith('#/')) {
            t = def;
            for (const raw of label.substring(2).split('/')) {
                const part = raw.replace(/~1/g, '/').replace(/~0/g, '~');
                if (!hasKid(t, part)) {
                    t = undefined;
                    break;
                }
                t = (0, parse_1.decycledChild)(t, part);
            }
            if (!isNode(t))
                t = undefined;
        }
        targets.set(label, t);
        return t;
    };
    const same = (a, b) => {
        if (isNode(a) && a === b)
            return true;
        const label = refLabel(a);
        return undefined !== label && label === refLabel(b);
    };
    const labelOf = new Map();
    const skipOf = new Map();
    const found = [];
    const scan = (start, skip) => {
        const body = new Map();
        const expanded = new Set();
        const stack = [];
        for (const k of kidKeys(start)) {
            if ('x-ref' !== k && '$ref' !== k && !skip.has(k)) {
                stack.push((0, parse_1.decycledChild)(start, k));
            }
        }
        while (0 < stack.length) {
            const v = stack.pop();
            if (!isNode(v))
                continue;
            const label = refLabel(v);
            if (undefined === label) {
                // Expanding a shared plain node once per scan is what ends a cycle of them.
                if (expanded.has(v))
                    continue;
                expanded.add(v);
                for (const k of kidKeys(v))
                    stack.push((0, parse_1.decycledChild)(v, k));
                continue;
            }
            const t = target(label);
            const over = [];
            for (const k of Object.keys(v)) {
                if ('x-ref' === k || '$ref' === k)
                    continue;
                const vk = (0, parse_1.decycledChild)(v, k);
                if (hasKid(t, k)) {
                    const tk = (0, parse_1.decycledChild)(t, k);
                    if (same(vk, tk))
                        continue;
                    if (hasKids(tk))
                        over.push(k);
                }
                stack.push(vk);
            }
            over.sort(byCodePoint);
            const node = nodeKey(label, over);
            if (!labelOf.has(node)) {
                labelOf.set(node, label);
                skipOf.set(node, new Set(over));
                found.push(node);
            }
            body.set(node, (body.get(node) ?? 0) + 1);
        }
        return body;
    };
    const bodies = new Map([[ROOT, scan(def, new Set())]]);
    for (let i = 0; i < found.length; i++) {
        const node = found[i];
        const t = target(labelOf.get(node));
        bodies.set(node, undefined === t ? new Map() : scan(t, skipOf.get(node)));
    }
    const count = countPaths(bodies);
    const out = {};
    for (const node of found) {
        const label = labelOf.get(node);
        out[label] = satAdd(out[label] ?? 0, count.get(node) ?? 0);
    }
    return out;
}
function countPaths(bodies) {
    // Code-point order, so both ports cut the same edge of a reference cycle.
    const successors = (u) => [...bodies.get(u).keys()].sort(byCodePoint);
    const onStack = new Set([ROOT]);
    const finished = new Set();
    const backEdges = new Map();
    const post = [];
    const stack = [{ node: ROOT, next: successors(ROOT), i: 0 }];
    while (0 < stack.length) {
        const frame = stack[stack.length - 1];
        if (frame.i < frame.next.length) {
            const v = frame.next[frame.i++];
            if (onStack.has(v)) {
                let cut = backEdges.get(frame.node);
                if (undefined === cut) {
                    cut = new Set();
                    backEdges.set(frame.node, cut);
                }
                cut.add(v);
            }
            else if (!finished.has(v)) {
                onStack.add(v);
                stack.push({ node: v, next: successors(v), i: 0 });
            }
        }
        else {
            stack.pop();
            onStack.delete(frame.node);
            finished.add(frame.node);
            post.push(frame.node);
        }
    }
    const count = new Map([[ROOT, 1]]);
    for (let i = post.length - 1; 0 <= i; i--) {
        const u = post[i];
        const cu = count.get(u) ?? 0;
        const cut = backEdges.get(u);
        for (const [v, w] of bodies.get(u)) {
            if (cut?.has(v))
                continue;
            count.set(v, satAdd(count.get(v) ?? 0, satMul(cu, w)));
        }
    }
    return count;
}
//# sourceMappingURL=refcount.js.map