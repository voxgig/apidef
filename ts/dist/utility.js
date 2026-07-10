"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sortedEntries = exports.sortedKeys = void 0;
exports.nom = nom;
exports.getdlog = getdlog;
exports.loadFile = loadFile;
exports.formatJsonSrc = formatJsonSrc;
exports.depluralize = depluralize;
exports.setCustomPlurals = setCustomPlurals;
exports.clearCustomPlurals = clearCustomPlurals;
exports.find = find;
exports.capture = capture;
exports.pathMatch = pathMatch;
exports.makeWarner = makeWarner;
exports.formatJSONIC = formatJSONIC;
exports.validator = validator;
exports.canonize = canonize;
exports.canonizeCmpName = canonizeCmpName;
exports.stripSchemaNamespace = stripSchemaNamespace;
exports.sanitizeSlug = sanitizeSlug;
exports.slugToPascalCase = slugToPascalCase;
exports.transliterate = transliterate;
exports.cleanComponentName = cleanComponentName;
exports.ensureMinEntityName = ensureMinEntityName;
exports.inferFieldType = inferFieldType;
exports.normalizeFieldName = normalizeFieldName;
exports.debugpath = debugpath;
exports.findPathsWithPrefix = findPathsWithPrefix;
exports.writeFileSyncWarn = writeFileSyncWarn;
exports.warnOnError = warnOnError;
exports.relativizePath = relativizePath;
exports.getModelPath = getModelPath;
const node_path_1 = __importDefault(require("node:path"));
const jostraca_1 = require("jostraca");
const util_1 = require("@voxgig/util");
const struct_1 = require("@voxgig/struct");
const KONSOLE_LOG = console['log'];
// Sorted iteration helpers — ensures deterministic key order matching Go.
const sortedKeys = (obj) => Object.keys(obj ?? {}).sort();
exports.sortedKeys = sortedKeys;
const sortedEntries = (obj) => Object.entries(obj ?? {}).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
exports.sortedEntries = sortedEntries;
// Pre-compiled regex patterns for formatJsonSrc to avoid recompilation per call.
const RE_JSON_KEY = /"([a-zA-Z_][a-zA-Z_0-9]*)": /g;
const RE_JSON_TRAILING_BRACE = /},/g;
const RE_JSON_COMMENT = /\n(\s*)([a-zA-Z_][a-zA-Z_0-9]*)_COMMENT:\s*"(.*)",/g;
const RE_BARE_KEY = /^[A-Za-z_][_A-Za-z0-9]*$/;
const isBareKey = (k) => RE_BARE_KEY.test(k);
const quoteKey = (k) => (isBareKey(k) ? k : JSON.stringify(k));
function makeWarner(spec) {
    const { point, log } = spec;
    const history = [];
    const warn = function warn(def) {
        const warning = { point, when: Date.now(), ...def };
        log.warn(warning);
        history.push(warning);
    };
    warn.history = history;
    warn.point = point;
    return warn;
}
function writeFileSyncWarn(warn, fs, path, text) {
    try {
        fs.writeFileSync(path, text);
    }
    catch (err) {
        warn({
            err,
            note: 'Unable to save file: ' + relativizePath(path)
        });
    }
}
function getdlog(tagin, filepath) {
    const tag = tagin || '-';
    const file = node_path_1.default.basename(filepath || '-');
    const g = global;
    g.__dlog__ = (g.__dlog__ || []);
    const dlog = (...args) => g.__dlog__.push([tag, file, Date.now(), ...args]);
    dlog.tag = tag;
    dlog.file = file;
    dlog.log = (filepath, f) => (f = null == filepath ? null : node_path_1.default.basename(filepath),
        g.__dlog__.filter((n) => n[0] === tag && (null == f || n[2] === f)));
    return dlog;
}
// Log non-fatal wierdness.
const dlog = getdlog('apidef', __filename);
function loadFile(path, what, fs, log) {
    try {
        const source = fs.readFileSync(path, 'utf8');
        return source;
    }
    catch (err) {
        log.error({ load: 'fail', what, path, err });
        throw err;
    }
}
function formatJsonSrc(jsonsrc) {
    return jsonsrc
        .replace(RE_JSON_KEY, '$1: ')
        .replace(RE_JSON_TRAILING_BRACE, '}\n')
        .replace(RE_JSON_COMMENT, '\n\n$1# $2 $3');
}
// Common irregular plurals, in the form plural → singular. Used at the
// head of depluralize() to short-circuit cases the suffix rules below
// would otherwise mishandle.
//
// Three over-strip classes are worked around here because the surface
// form gives no clean discriminator:
//
//   * `-Vse+s` plurals (houses, phases, noses, …) would hit the
//     generic `-ses → ∅` rule and become hous/phas/nos. Every such
//     -se+s plural needs an explicit entry.
//
//   * `-che+s` plurals (caches, niches, headaches, …) would hit the
//     generic `-ches → ∅` rule and become cach/nich/headach. Same
//     pattern: no letter-doubling tell exists (cache vs church both
//     have a single 'ch'), so each -che singular is enumerated.
//
//   * `-oe+s` plurals (shoes, canoes, oboes) would hit the generic
//     `-oes → -o` rule (for potatoes/heroes) and become sho/cano/obo.
//     Only collision-safe entries are listed: a key must not also be a
//     suffix of a real `-o`+es plural (e.g. `toes` is excluded because
//     it would turn tomatoes → tomatoe).
//
// Keys are lowercase; depluralize() does a case-insensitive lookup
// and reapplies the caller's casing on the way out.
const IRREGULARS = {
    'analytics': 'analytics',
    'analyses': 'analysis',
    'appendices': 'appendix',
    'avalanches': 'avalanche',
    'axes': 'axis',
    'caches': 'cache',
    'canoes': 'canoe',
    'cases': 'case',
    'children': 'child',
    'cliches': 'cliche',
    'courses': 'course',
    'creches': 'creche',
    'crises': 'crisis',
    'criteria': 'criterion',
    // 'data': 'datum',
    'diagnoses': 'diagnosis',
    'doses': 'dose',
    'douches': 'douche',
    'feet': 'foot',
    'furnaces': 'furnace',
    'geese': 'goose',
    'headaches': 'headache',
    'horses': 'horse',
    'hoses': 'hose',
    'houses': 'house',
    'indices': 'index',
    'lens': 'lens',
    'licenses': 'license',
    'matrices': 'matrix',
    'men': 'man',
    'mice': 'mouse',
    'moustaches': 'moustache',
    'movies': 'movie',
    'mustaches': 'mustache',
    'niches': 'niche',
    'noses': 'nose',
    'notices': 'notice',
    'nurses': 'nurse',
    'oases': 'oasis',
    'oboes': 'oboe',
    'pastiches': 'pastiche',
    'pauses': 'pause',
    'phases': 'phase',
    'phrases': 'phrase',
    'practices': 'practice',
    'premises': 'premise',
    'promises': 'promise',
    'psyches': 'psyche',
    'purses': 'purse',
    'releases': 'release',
    'roses': 'rose',
    'people': 'person',
    'phenomena': 'phenomenon',
    'series': 'series',
    'shoes': 'shoe',
    'sources': 'source',
    'species': 'species',
    'teeth': 'tooth',
    'theses': 'thesis',
    'verses': 'verse',
    'vertices': 'vertex',
    'women': 'woman',
    'yes': 'yes',
};
// Sorted longest-first so the most specific IRREGULARS suffix wins.
// Without this, 'women' would be shadowed by 'men' (3 < 5) under
// insertion-order iteration. Both happen to round-trip correctly
// today, but the sort makes any future entry safe by construction.
const IRREGULAR_KEYS = Object.keys(IRREGULARS).sort((a, b) => b.length - a.length);
// Reapply the case pattern of `source` to `target`. Used so the
// case-insensitive lookups in depluralize() preserve the caller's
// casing on the way out (HOUSES → HOUSE, Houses → House, houses →
// house). Falls through to `target` unchanged for mixed-case sources
// that don't fit one of the three canonical patterns.
function matchCase(source, target) {
    if (source === source.toLowerCase())
        return target.toLowerCase();
    if (source === source.toUpperCase())
        return target.toUpperCase();
    if (source[0] === source[0].toUpperCase()) {
        return target[0].toUpperCase() + target.slice(1).toLowerCase();
    }
    return target;
}
// Per-model plural overrides, populated from the model's
// `main.custom.plurals` section at apidef pipeline entry and cleared
// between runs. Checked by depluralize() before the built-in
// IRREGULARS table and rule chain — so a model can override any
// default depluralization, including correct-by-default cases, when
// its domain demands a different singular (e.g. fitness API with
// {axes: axe}, photography app with {lenses: lens}).
//
// Module-level rather than a parameter so the many existing
// depluralize/canonize call sites across transforms and guide
// inherit the override without signature churn. apidef is
// single-model-per-process; if that ever changes, switch this to a
// per-context map.
let CUSTOM_PLURALS = {};
let CUSTOM_PLURAL_KEYS = [];
function setCustomPlurals(plurals) {
    CUSTOM_PLURALS = {};
    if (plurals) {
        for (const k of Object.keys(plurals)) {
            // Skip null/undefined values so a partially-typed model entry
            // doesn't poison the map.
            const v = plurals[k];
            if (null == v)
                continue;
            CUSTOM_PLURALS[k.toLowerCase()] = v;
        }
    }
    CUSTOM_PLURAL_KEYS = Object.keys(CUSTOM_PLURALS).sort((a, b) => b.length - a.length);
    // canonize() memoizes depluralize() output, and depluralize() consults
    // CUSTOM_PLURALS — so the cache is only valid for the plural config that
    // produced it. ApiDef.makeBuild reuses one apidef instance across models,
    // so without this a second model would read the first model's
    // custom-plural-affected canonize results. Invalidate on every change.
    CANONIZE_CACHE.clear();
}
function clearCustomPlurals() {
    setCustomPlurals(undefined);
}
function depluralize(word) {
    if (!word || word.length === 0) {
        return word;
    }
    // Case-insensitive throughout: IRREGULARS lookups and every
    // suffix-rule endsWith() check operate on the lowercased form,
    // but slice/concat use the original word so the caller's casing
    // is preserved (HOUSES → HOUSE, Houses → House, houses → house).
    const lower = word.toLowerCase();
    // Per-model custom plurals win over the built-in IRREGULARS and
    // rule chain. Same lookup shape: exact match first, then
    // longest-suffix match against CUSTOM_PLURAL_KEYS.
    const customExact = CUSTOM_PLURALS[lower];
    if (customExact) {
        return matchCase(word, customExact);
    }
    for (const ending of CUSTOM_PLURAL_KEYS) {
        if (lower.endsWith(ending)) {
            const cut = word.length - ending.length;
            return word.slice(0, cut) + matchCase(word.slice(cut), CUSTOM_PLURALS[ending]);
        }
    }
    const exact = IRREGULARS[lower];
    if (exact) {
        return matchCase(word, exact);
    }
    for (const ending of IRREGULAR_KEYS) {
        if (lower.endsWith(ending)) {
            const cut = word.length - ending.length;
            return word.slice(0, cut) + matchCase(word.slice(cut), IRREGULARS[ending]);
        }
    }
    // Rules for regular plurals (applied in order). The -ies and -ves
    // rules add a letter, so they need to match the case of the dropped
    // suffix; all other rules just slice and inherit the caller's case.
    // -ies -> -y (cities -> city), but only if result is > 2 chars
    if (lower.endsWith('ies') && word.length > 3) {
        const dropped = word.slice(-3);
        const y = dropped === dropped.toUpperCase() ? 'Y' : 'y';
        const result = word.slice(0, -3) + y;
        if (result.length > 2) {
            return result;
        }
    }
    // -ves -> -f or -fe (wolves -> wolf, knives -> knife)
    if (lower.endsWith('ves')) {
        const stem = word.slice(0, -3);
        const dropped = word.slice(-3);
        const isUpper = dropped === dropped.toUpperCase();
        // Check if it should be -fe (like knife, wife, life)
        if (['kni', 'wi', 'li'].includes(stem.toLowerCase())) {
            return stem + (isUpper ? 'FE' : 'fe');
        }
        return stem + (isUpper ? 'F' : 'f');
    }
    // -oes -> -o (potatoes -> potato)
    if (lower.endsWith('oes')) {
        return word.slice(0, -2);
    }
    // Handle words ending in -nses (like responses, expenses, licenses)
    // These should only lose the final -s, not -es
    if (lower.endsWith('nses')) {
        return word.slice(0, -1);
    }
    // -zes plurals come from -ze singulars (prize, size, freeze, maze,
    // breeze, …) far more often than from a bare -z taking -es. The only
    // -zes plurals that strip the full -es have a doubled-z stem
    // (buzz/buzzes, fez/fezzes). Discriminate on -zzes so prizes → prize
    // instead of priz. Mirrors the -ses/-Vse+s problem the IRREGULARS
    // table works around for the -se case.
    if (lower.endsWith('zzes')) {
        return word.slice(0, -2);
    }
    if (lower.endsWith('zes')) {
        return word.slice(0, -1);
    }
    // -ses, -xes, -shes, -ches -> remove -es (boxes -> box)
    if (lower.endsWith('ses') || lower.endsWith('xes') ||
        lower.endsWith('shes') || lower.endsWith('ches')) {
        return word.slice(0, -2);
    }
    // -s -> remove -s (cats -> cat), but only if result is > 2 chars
    if (lower.endsWith('s') &&
        !lower.endsWith('ss') &&
        !lower.endsWith('us') &&
        word.length > 3) {
        return word.slice(0, -1);
    }
    // If none of the rules apply, return as is
    return word;
}
function find(obj, qkey) {
    const vals = [];
    const collect = (o) => {
        if (!o || 'object' !== typeof o)
            return;
        if (Array.isArray(o)) {
            for (let i = 0; i < o.length; i++)
                collect(o[i]);
        }
        else {
            for (const k of Object.keys(o)) {
                const v = o[k];
                if (qkey === k)
                    vals.push({ key: k, val: v, path: [] });
                if (v && 'object' === typeof v)
                    collect(v);
            }
        }
    };
    collect(obj);
    return vals;
}
function capture(data, shape) {
    let meta = { capture: {} };
    let errs = [];
    (0, struct_1.transform)(data, shape, {
        extra: {
            $CAPTURE,
            $APPEND,
            $ANY,
            $SELECT,
            $LOWER: $RECASE,
            $UPPER: $RECASE,
        },
        errs,
        meta
    });
    if (0 < errs.length) {
        KONSOLE_LOG('ERRS', errs);
        dlog(errs);
    }
    return meta.capture;
}
function $CAPTURE(inj) {
    // Set prop foo with value at x: { x: { '`$CAPTURE`': 'foo' } }
    if (struct_1.M_KEYPRE === inj.mode) {
        const { val, prior } = inj;
        if (null != prior) {
            const { dparent, key } = prior;
            const dval = dparent?.[key];
            if (undefined !== dval) {
                inj.meta.capture[val] = dval;
            }
        }
    }
    // Use key x as prop name: { x: '`$CAPTURE`': }
    else if (struct_1.M_VAL === inj.mode) {
        const { key, dparent } = inj;
        const dval = dparent?.[key];
        if (undefined !== dval) {
            inj.meta.capture[key] = dval;
        }
    }
}
function $APPEND(inj, val, ref, store) {
    // Set prop foo with value at x: { x: { '`$CAPTURE`': 'foo' } }
    if (struct_1.M_KEYPRE === inj.mode) {
        const { val, prior } = inj;
        if (null != prior) {
            const { dparent, key } = prior;
            const dval = dparent?.[key];
            if (undefined !== dval) {
                inj.meta.capture[val] = (inj.meta.capture[val] || []);
                inj.meta.capture[val].push(dval);
            }
        }
    }
    else if (struct_1.M_VAL === inj.mode) {
        inj.keyI = inj.keys.length;
        if (null == inj.prior) {
            return;
        }
        const [_, prop, xform] = inj.parent;
        const { key, dparent } = inj.prior;
        const dval = dparent?.[key];
        const vstore = { ...store };
        vstore.$TOP = { [key]: dval };
        // const ptval = transform({ [key]: dval }, { [key]: xform }, {
        const ptval = (0, struct_1.inject)({ [key]: xform }, vstore, {
            meta: { ...inj.meta },
            errs: inj.errs,
        });
        const tval = ptval[key];
        if (undefined !== tval) {
            inj.meta.capture[prop] = (inj.meta.capture[prop] || []);
            inj.meta.capture[prop].push(tval);
        }
    }
}
function $ANY(inj, _val, _ref, store) {
    if (struct_1.M_KEYPRE === inj.mode) {
        const { prior } = inj;
        const child = inj.parent[inj.key];
        if (null != prior) {
            const { dparent, key } = prior;
            const dval = dparent?.[key];
            if ((0, struct_1.isnode)(dval)) {
                for (let n of Object.entries(dval)) {
                    let vstore = { ...store };
                    vstore.$TOP = { [n[0]]: n[1] };
                    (0, struct_1.inject)((0, struct_1.clone)({ [n[0]]: child }), vstore, {
                        meta: inj.meta,
                        errs: inj.errs,
                    });
                }
            }
        }
    }
}
function $SELECT(inj, _val, _ref, store) {
    if (struct_1.M_VAL === inj.mode) {
        inj.keyI = inj.keys.length;
        let [_, selector, descendor] = inj.parent;
        const dparents = Object.entries(inj.dparent || {})
            .filter(n => (0, struct_1.isnode)(n[1]))
            .reduce((a, n) => (a[n[0]] = n[1], a), {});
        if (selector instanceof RegExp) {
            selector = {
                '$KEY': { '`$LIKE`': selector.toString() }
            };
        }
        // TODO: select should be safe for scalars
        const children = (0, struct_1.select)(dparents, selector);
        if (0 < children.length) {
            for (let child of children) {
                let vstore = { ...store };
                vstore.$TOP = { [child.$KEY]: child };
                (0, struct_1.inject)((0, struct_1.clone)({ [child.$KEY]: descendor }), vstore, {
                    meta: (0, struct_1.merge)([
                        inj.meta,
                        // TODO: need this hack as struct does not provide a way to get grandparent keys
                        // also, these capture actions are not preserving the path!
                        { select: { key: { [(0, struct_1.slice)(inj.path, 1, -1).join('+')]: child.$KEY } } }
                    ]),
                    errs: inj.errs,
                });
            }
        }
    }
}
function $RECASE(inj, val, ref, store) {
    if (struct_1.M_KEYPRE === inj.mode
        && null != inj.prior
        && null != inj.prior.prior) {
        const dval = inj.parent[inj.key];
        // TODO: handle paths more generally! use inj.prior?
        // TODO: mkae this into a utility method on inj?
        const dkey = inj.prior.key;
        const gkey = inj.prior.prior.key;
        const vstore = { ...store };
        vstore.$TOP = { [gkey]: { [dkey]: inj.dparent?.[dkey] } };
        const vspec = { [gkey]: { [dkey]: dval } };
        const ptval = (0, struct_1.inject)(vspec, vstore, {
            meta: { ...inj.meta },
            errs: inj.errs,
        });
        let tval = ptval[gkey][dkey];
        if ('string' === typeof tval) {
            tval = '$UPPER' === ref ? tval.toUpperCase() : tval.toLowerCase();
        }
        inj.setval(tval, 2);
    }
}
// A special-purpose regex-style matcher for url paths.
//   t - text part
//   p - param part
//   / - part separator
//   / at start - must match from start
//   / at end - must match to end
// See utility.test.ts for examples
function pathMatch(path, expr) {
    if (null == path) {
        return null;
    }
    const parts = (Array.isArray(path) ? path : path.split('/')).filter(p => '' !== p);
    const res = [];
    res.index = -1;
    res.expr = expr;
    res.path = 'string' === typeof path ? path : '/' + path.join('/');
    const plen = parts.length;
    const xlen = expr.length;
    let xI = 0, pI = 0, mI = -1;
    for (; pI <= parts.length; pI++) {
        let p = parts[pI];
        let x = expr[xI];
        let isp = isParam(p);
        if ('/' === x) {
            if (0 === xI) {
                if (0 === pI) {
                    mI = 0;
                    pI--;
                    xI++;
                }
                else {
                    break;
                }
            }
            else if (xI === xlen - 1) {
                if (pI === plen) {
                    xI++;
                    break;
                }
                else {
                    if (-1 < mI) {
                        // backtrack
                        pI = mI;
                        mI = -1;
                    }
                    xI = 0;
                }
            }
            else if (xI < xlen - 1) {
                pI--;
                xI++;
            }
            else {
                xI = 0;
                break;
            }
        }
        else if ('t' === x && !isp) {
            xI++;
            mI = mI < 0 ? pI : mI;
        }
        else if ('p' === x && isp) {
            xI++;
            mI = mI < 0 ? pI : mI;
        }
        else {
            if (-1 < mI) {
                // backtrack
                pI = mI;
                mI = -1;
            }
            xI = 0;
        }
        if (xI === xlen) {
            break;
        }
    }
    if (xI === xlen) {
        res.index = mI;
        res.push(...parts.slice(mI, pI + 1));
        return res;
    }
    return null;
}
function isParam(partStr) {
    return null != partStr && '{' === partStr[0] && '}' === partStr[partStr.length - 1];
}
function formatJSONIC(val, opts) {
    if (undefined === val)
        return '';
    const hsepd = opts?.hsepd ?? 1;
    const showd = !!opts?.$;
    const useColor = opts?.color ?? false;
    const maxlines = opts?.maxlines ?? Number.MAX_VALUE;
    const exclude = opts?.exclude ?? [];
    // ANSI color codes
    const colors = {
        reset: '\x1b[0m',
        key: '\x1b[94m', // bright blue
        string: '\x1b[92m', // bright green
        number: '\x1b[93m', // bright yellow
        boolean: '\x1b[96m', // bright cyan
        null: '\x1b[90m', // bright gray
        bracket: '\x1b[37m', // white
        comment: '\x1b[90m', // bright gray
    };
    const c = (color, text) => useColor ? `${colors[color]}${text}${colors.reset}` : text;
    const renderPrimitive = (v) => {
        if (v === null)
            return c('null', 'null');
        const t = typeof v;
        switch (t) {
            case 'string': return c('string', !v.includes('\n') ? JSON.stringify(v) :
                '`' + JSON.stringify(v)
                    .substring(1)
                    .replace(/\\n/g, '\n')
                    // Inside a JSONIC backtick literal a double quote is a literal
                    // character, so unescape JSON's \" back to " (was previously
                    // replaced with ':' which silently corrupted quoted text).
                    .replace(/\\"/g, '"')
                    .replace(/`/g, '\\`')
                    .replace(/"$/, '`'));
            case 'number': return c('number', Number.isFinite(v) ? String(v) : 'null');
            case 'boolean': return c('boolean', v ? 'true' : 'false');
            case 'bigint': return c('string', JSON.stringify(v.toString()));
            case 'symbol':
            case 'function':
            case 'undefined':
                return c('null', 'null');
            default: return JSON.stringify(v);
        }
    };
    const renderComment = (c) => {
        if (c == null)
            return null;
        if (Array.isArray(c) && c.every(x => typeof x === 'string'))
            return c.join('; ');
        if (typeof c === 'string')
            return c;
        try {
            return JSON.stringify(c);
        }
        catch {
            return String(c);
        }
    };
    return renderJSONIC(val, hsepd, showd, useColor, maxlines, exclude, c, renderPrimitive, renderComment);
}
function renderJSONIC(val, hsepd, showd, useColor, maxlines, exclude, c, renderPrimitive, renderComment) {
    const space = '  ';
    const seen = new WeakSet();
    let stack = new Array(32);
    let top = -1;
    // Seed root frame, capturing a possible top-level _COMMENT
    let rootInline = null;
    if (val && typeof val === 'object') {
        rootInline = renderComment(val['_COMMENT']);
    }
    stack[++top] = {
        kind: 'value', value: val, indentLevel: 0, linePrefix: '', inlineComment: rootInline
    };
    const lines = [];
    while (top >= 0 && (lines.length < maxlines)) {
        const frame = stack[top];
        stack[top] = undefined;
        top -= 1;
        if (frame.kind === 'close') {
            const indent = space.repeat(frame.indentLevel);
            const hsep = 0 < frame.indentLevel && frame.indentLevel <= hsepd;
            lines.push(`${indent}${c('bracket', frame.token)}${hsep ? '\n' : ''}`);
            continue;
        }
        let v = frame.value;
        while (v && typeof v === 'object' && typeof v.toJSON === 'function') {
            v = v.toJSON();
        }
        const { indentLevel, linePrefix } = frame;
        const commentSuffix = frame.inlineComment ? `  ${c('comment', `# ${frame.inlineComment}`)}` : '';
        if (v === null || typeof v !== 'object') {
            lines.push(`${linePrefix}${renderPrimitive(v)}${commentSuffix}`);
            continue;
        }
        // Circular reference detected — fall back to decircular
        if (seen.has(v)) {
            return renderJSONIC((0, util_1.decircular)(val), hsepd, showd, useColor, maxlines, exclude, c, renderPrimitive, renderComment);
        }
        seen.add(v);
        if (Array.isArray(v)) {
            const arr = v;
            if (arr.length === 0) {
                lines.push(`${linePrefix}${c('bracket', '[')}${commentSuffix}`);
                stack[++top] = { kind: 'close', token: ']', indentLevel };
                continue;
            }
            // opening line
            lines.push(`${linePrefix}${c('bracket', '[')}${commentSuffix}`);
            stack[++top] = { kind: 'close', token: ']', indentLevel };
            // children (reverse push)
            const childPrefix = space.repeat(indentLevel + 1);
            for (let i = arr.length - 1; i >= 0; i--) {
                const idxComment = renderComment(v[`${i}_COMMENT`]);
                stack[++top] = {
                    kind: 'value',
                    value: arr[i],
                    indentLevel: indentLevel + 1,
                    linePrefix: `${childPrefix}`,
                    inlineComment: idxComment
                };
            }
            continue;
        }
        // Plain object
        const obj = v;
        const keys = Object.keys(obj);
        if (v instanceof Error) {
            keys.unshift('name', 'message', 'stack');
        }
        const printableKeys = keys.filter(k => !k.endsWith('_COMMENT') &&
            (showd || !k.endsWith('$')));
        if (printableKeys.length === 0) {
            lines.push(`${linePrefix}${c('bracket', '{')}${commentSuffix}`);
            stack[++top] = { kind: 'close', token: '}', indentLevel };
            continue;
        }
        // opening line
        lines.push(`${linePrefix}${c('bracket', '{')}${commentSuffix}`);
        stack[++top] = { kind: 'close', token: '}', indentLevel };
        const nextIndentStr = space.repeat(indentLevel + 1);
        for (let i = printableKeys.length - 1; i >= 0; i--) {
            const k = printableKeys[i];
            if (exclude.includes(k)) {
                continue;
            }
            const keyText = quoteKey(k);
            const valForKey = obj[k];
            const cmt = renderComment(obj[`${k}_COMMENT`]);
            stack[++top] = {
                kind: 'value',
                value: valForKey,
                indentLevel: indentLevel + 1,
                linePrefix: `${nextIndentStr}${c('key', keyText)}: `,
                inlineComment: cmt
            };
        }
    }
    return lines.join('\n') + '\n';
}
const VALID_CANON = {
    'string': '`$STRING`',
    'number': '`$NUMBER`',
    'integer': '`$INTEGER`',
    'boolean': '`$BOOLEAN`',
    'null': '`$NULL`',
    'array': '`$ARRAY`',
    'object': '`$OBJECT`',
    'any': '`$ANY`',
};
function validator(torig) {
    if ('string' === typeof torig) {
        const tstr = torig.toLowerCase().trim();
        const canon = VALID_CANON[tstr] ?? 'Any';
        return canon;
    }
    else if (Array.isArray(torig)) {
        return ['`$ONE`', torig.map((t) => validator(t))];
    }
    else {
        return '`$ANY`';
    }
}
const FILE_EXT_RE = /\.(php|json|txt|png|jpg|jpeg|gif|svg|xml|html|csv|yml|yaml|md)$/i;
function transliterate(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
const CANONIZE_CACHE = new Map();
function canonize(s) {
    if (null == s || '' === s)
        return '';
    const cached = CANONIZE_CACHE.get(s);
    if (undefined !== cached)
        return cached;
    const out = depluralize((0, jostraca_1.snakify)(transliterate(s).replace(FILE_EXT_RE, '')))
        .replace(/[^a-zA-Z_0-9]/g, '');
    CANONIZE_CACHE.set(s, out);
    return out;
}
// Namespace-qualified schema names (ASP.NET / Java style:
// "NoFrixion.MoneyMoov.Models.PaymentRequests.MerchantPayment",
// "com.example.api.Payment") describe the type by their LAST dotted
// segment; the namespace prefix is packaging noise. Reduce to the last
// meaningful segment — skipping version-ish ("v2", "10") or too-short
// tails — so entity names derive from the type, not the namespace.
function stripSchemaNamespace(name) {
    if (null == name || !name.includes('.'))
        return name;
    const segs = name.split('.');
    for (let i = segs.length - 1; i >= 0; i--) {
        const seg = segs[i];
        if (seg.length >= 3 && !/^v?\d+$/i.test(seg)) {
            return seg;
        }
    }
    return name;
}
// Canonical form of an OpenAPI component schema name, for use as an
// entity-name candidate and as the frequency-metric key. Must be applied
// uniformly wherever schema refs are counted or resolved (MeasureRef,
// ResolveEntityComponent, findcmps) so the metric keys stay consistent.
function canonizeCmpName(orig) {
    return canonize(stripSchemaNamespace(orig));
}
// Sanitize a raw slug into a clean kebab-case string suitable for
// conversion to a valid JS identifier (via camelify/snakify/etc).
function sanitizeSlug(s) {
    if (null == s || '' === s)
        return 'unknown';
    // Transliterate accented characters to ASCII
    let out = transliterate(s);
    // Replace underscores and dots with hyphens (treat as word separators)
    out = out.replace(/[_.]/g, '-');
    // Strip all non-alphanumeric, non-hyphen chars
    out = out.replace(/[^a-zA-Z0-9-]/g, '');
    // Collapse multiple/leading/trailing hyphens
    out = out.replace(/-+/g, '-').replace(/^-|-$/g, '');
    // Merge standalone number segments with preceding word
    // e.g. ec-2-shop -> ec2-shop, advice-slip-api-2 -> advice-slip-api2
    const raw = out.split('-').filter(p => p.length > 0);
    const parts = [];
    for (const p of raw) {
        if (/^\d+$/.test(p) && parts.length > 0) {
            parts[parts.length - 1] += p;
        }
        else {
            parts.push(p);
        }
    }
    out = parts.join('-');
    if (!out)
        return 'unknown';
    // Ensure the slug does not start with a digit (invalid for JS identifiers)
    if (/^\d/.test(out)) {
        out = 'n' + out;
    }
    return out;
}
// Convert a raw slug to a valid PascalCase identifier.
// Applies sanitizeSlug first, then converts to PascalCase.
function slugToPascalCase(s) {
    const slug = sanitizeSlug(s);
    if (slug === 'unknown')
        return 'Unknown';
    return slug
        .split('-')
        .map(p => p.charAt(0).toUpperCase() + p.slice(1))
        .join('');
}
const BOOLEAN_NAME_RE = /^(is_|has_|can_|should_|allow_|enabled$|disabled$|active$|visible$|deleted$|verified$|public$|private$|locked$|archived$|blocked$)/;
const INTEGER_NAME_RE = /(_count$|_number$|^total_|^count_|^num_|^limit$|^page$|^offset$|^per_page$|^page_size$|^size$|^skip$)/;
const NUMBER_NAME_RE = /^(latitude$|longitude$|lat$|lng$|lon$|price$|amount$|rate$|score$|weight$|height$|width$|depth$|radius$|distance$|duration$|percentage$|percent$)/;
const STRING_NAME_RE = /^(url$|href$|link$|uri$|email$|name$|title$|description$|slug$|path$|label$|username$|password$|token$|key$)/;
const ID_NAME_RE = /(_id$|^id$)/;
function inferFieldType(name, specType) {
    // Only override $ANY, or $STRING for boolean-patterned names
    if ('`$ANY`' === specType) {
        if (BOOLEAN_NAME_RE.test(name))
            return '`$BOOLEAN`';
        if (ID_NAME_RE.test(name))
            return '`$STRING`';
        if (INTEGER_NAME_RE.test(name))
            return '`$INTEGER`';
        if (NUMBER_NAME_RE.test(name))
            return '`$NUMBER`';
        if (STRING_NAME_RE.test(name))
            return '`$STRING`';
    }
    else if ('`$STRING`' === specType) {
        if (BOOLEAN_NAME_RE.test(name))
            return '`$BOOLEAN`';
    }
    return specType;
}
function normalizeFieldName(s) {
    if (null == s || '' === s)
        return '';
    return s
        .replace(/\[\]/g, '')
        .replace(/[\[\].]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}
const MIN_ENTITY_NAME_LEN = 3;
const MAX_ENTITY_NAME_LEN = 67;
function ensureMinEntityName(name, existing) {
    let padded = name.replace(/[^a-zA-Z_0-9]/g, '').replace(/^_+/, '');
    // Truncate sentence-length names by taking leading segments
    if (padded.length > MAX_ENTITY_NAME_LEN) {
        const parts = padded.split('_');
        let truncated = '';
        for (const part of parts) {
            const next = truncated === '' ? part : truncated + '_' + part;
            if (next.length > MAX_ENTITY_NAME_LEN)
                break;
            truncated = next;
        }
        padded = truncated || parts[0].substring(0, MAX_ENTITY_NAME_LEN);
    }
    if (padded.length > 0 && padded[0] >= '0' && padded[0] <= '9') {
        padded = 'n' + padded;
    }
    if (padded.length < MIN_ENTITY_NAME_LEN) {
        const padding = 'nt'.substring(0, MIN_ENTITY_NAME_LEN - padded.length);
        padded = padded + padding;
    }
    if (padded !== name && null != existing[padded]) {
        // The name was modified (truncated/sanitized) and collides with an
        // existing entity. Only a collision between DIFFERENT origins needs a
        // numeric suffix — the same original name re-encountered (e.g. the same
        // long schema referenced by several methods on one path) must reuse the
        // existing entity so its ops merge instead of minting phantom
        // "<entity>2/3/4" entities. Entities record their pre-truncation name
        // as `longname`; entries without one keep the old always-suffix rule.
        if (existing[padded].longname === name) {
            return padded;
        }
        let i = 2;
        while (null != existing[padded + i]) {
            if (existing[padded + i].longname === name) {
                return padded + i;
            }
            i++;
        }
        padded = padded + i;
    }
    return padded;
}
// Unconditional suffixes: framework noise, always stripped.
const CMP_SUFFIXES = ['_rest_controller', '_controller', '_response', '_request'];
// Guarded suffixes: pagination wrappers ('_page_response', '_page') and
// op-reply wrappers ('_create_response', '_update_response') fold wrapper
// schemas (BeneficiaryPageResponse, MerchantTokenPage,
// BeneficiariesCreateResponse, ...) into their base entity — but ONLY when
// the remainder is itself a known component schema (the wrapper
// convention). Without that guard a real noun gets mangled: an API whose
// resource IS a page (LandingPage entity at /landing-pages) must keep
// 'landing_page', not become 'landing'. Order matters: longer first, since
// '_page_response'/'_create_response' also end with '_response'. Bare
// '_create'/'_update' are never stripped: too likely part of a real noun.
const CMP_GUARDED_SUFFIXES = ['_create_response', '_update_response', '_page_response', '_page'];
const CMP_PREFIXES = ['get_', 'post_', 'put_', 'delete_', 'patch_'];
function cleanComponentName(name, isKnownCmp) {
    let cleaned = name;
    let stripped = false;
    if (null != isKnownCmp) {
        for (const suffix of CMP_GUARDED_SUFFIXES) {
            if (cleaned.endsWith(suffix)) {
                const parts = cleaned.split('_');
                const suffixParts = suffix.split('_').filter(s => s !== '').length;
                const remainder = canonize(parts.slice(0, parts.length - suffixParts).join('_'));
                if (remainder.length >= 3 && isKnownCmp(remainder)) {
                    cleaned = remainder;
                    stripped = true;
                }
                break;
            }
        }
    }
    if (!stripped) {
        for (const suffix of CMP_SUFFIXES) {
            if (cleaned.endsWith(suffix)) {
                const parts = cleaned.split('_');
                const suffixParts = suffix.split('_').filter(s => s !== '').length;
                cleaned = canonize(parts.slice(0, parts.length - suffixParts).join('_'));
                break;
            }
        }
    }
    for (const prefix of CMP_PREFIXES) {
        if (cleaned.startsWith(prefix)) {
            const remainder = cleaned.substring(prefix.length);
            if (remainder.length >= 3) {
                cleaned = remainder;
            }
            break;
        }
    }
    return cleaned;
}
function warnOnError(where, warn, fn, result) {
    try {
        return fn();
    }
    catch (err) {
        warn({
            note: 'Error in ' + where + ': ' + err.message,
            err
        });
        return result;
    }
}
function debugpath(pathStr, methodName, ...args) {
    const apipath = process.env.APIDEF_DEBUG_PATH;
    if (null == apipath || '' === apipath)
        return;
    if ('ALL' !== apipath) {
        const [targetPath, targetMethod] = apipath.split(':');
        // Check if path matches
        if (pathStr !== targetPath)
            return;
        // If a method is specified in apipath and we have a method name, check if it matches
        if (targetMethod && methodName) {
            if (methodName.toLowerCase() !== targetMethod.toLowerCase())
                return;
        }
    }
    KONSOLE_LOG(methodName || '', ...args);
}
function findPathsWithPrefix(ctx, pathStr, opts) {
    const strict = opts?.strict ?? false;
    const param = opts?.param ?? false;
    if (!param) {
        pathStr = pathStr.replace(/\{[^}]+\}/g, '{}');
    }
    const matchingPaths = (0, jostraca_1.each)(ctx.def.paths)
        .filter((pathDef) => {
        let path = pathDef.key$;
        if (!param) {
            path = path.replace(/\{[^}]+\}/g, '{}');
        }
        if (strict) {
            // Strict mode: path must start with prefix and have more segments
            return path.startsWith(pathStr) && path.length > pathStr.length;
        }
        else {
            // Non-strict mode: simple prefix match
            return path.startsWith(pathStr);
        }
    });
    return matchingPaths.length;
}
// TODO: move to jostraca?
function allcapify(s) {
    return 'string' === typeof s ? (0, jostraca_1.snakify)(s).toUpperCase() : '';
}
// Get value from object as string, and format as indicated.
// Example: nom({foo:'bar'},'Foo') -> 'Bar'
function nom(v, format) {
    let formatstr = 'string' == typeof format ? format : null;
    if (null == formatstr) {
        return '__MISSING__';
    }
    const canon = canonize(formatstr);
    let out = v?.[canon] ?? '__MISSING_' + formatstr + '__';
    out =
        /[A-Z][a-z]/.test(formatstr) ? (0, jostraca_1.camelify)(out) :
            /[A-Z][A-Z]/.test(formatstr) ? allcapify(out) :
                /-/.test(formatstr) ? (0, jostraca_1.kebabify)(out) : out;
    return out;
}
function relativizePath(path) {
    const cwd = process.cwd();
    if (path.startsWith(cwd)) {
        return '.' + path.slice(cwd.length);
    }
    return path;
}
// NOTE: removes inactive items by default
function getModelPath(model, path, flags) {
    const required = flags?.required ?? true;
    const only_active = flags?.only_active ?? true;
    if (path === '') {
        if (required) {
            throw new Error('getModelPath: empty path provided');
        }
        return undefined;
    }
    const parts = path.split('.');
    const fullPath = path; // Store the full path for error messages
    let current = model;
    let validPath = [];
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (current == null) {
            if (required) {
                const validPathStr = validPath.length > 0 ? validPath.join('.') : '(root)';
                throw new Error(`getModelPath: path not found at '${fullPath}'.\n` +
                    `Valid path up to: '${validPathStr}'.\n` +
                    `Cannot access property '${part}' of ${current === null ? 'null' : 'undefined'}.`);
            }
            return undefined;
        }
        // Check if current is an object before using 'in' operator
        if (typeof current !== 'object' || current === null) {
            if (required) {
                const validPathStr = validPath.length > 0 ? validPath.join('.') : '(root)';
                throw new Error(`getModelPath: path not found at '${fullPath}'.\n` +
                    `Valid path up to: '${validPathStr}'.\n` +
                    `Cannot access property '${part}' of ${typeof current}.`);
            }
            return undefined;
        }
        // Check if the key exists
        if (!(part in current)) {
            if (required) {
                const validPathStr = validPath.length > 0 ? validPath.join('.') : '(root)';
                const availableKeys = Array.isArray(current)
                    ? `array indices 0-${current.length - 1}`
                    : `[${Object.keys(current).join(', ')}]`;
                throw new Error(`getModelPath: path not found at '${fullPath}'.\n` +
                    `Valid path up to: '${validPathStr}'.\n` +
                    `Property '${part}' does not exist.\n` +
                    `Available keys: ${availableKeys}`);
            }
            return undefined;
        }
        validPath.push(part);
        current = current[part];
    }
    if (current && only_active) {
        if (false === current.active) {
            current = undefined;
        }
        if ('object' === typeof current) {
            const out = Array.isArray(current) ? [] : {};
            Object.entries(current).map((n) => {
                if (null != n[1] && false !== n[1].active) {
                    if (Array.isArray(out)) {
                        out.push(n[1]);
                    }
                    else {
                        out[n[0]] = n[1];
                    }
                }
            });
            current = out;
        }
    }
    return current;
}
//# sourceMappingURL=utility.js.map