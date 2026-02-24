"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.nom = nom;
exports.getdlog = getdlog;
exports.loadFile = loadFile;
exports.formatJsonSrc = formatJsonSrc;
exports.depluralize = depluralize;
exports.find = find;
exports.capture = capture;
exports.pathMatch = pathMatch;
exports.makeWarner = makeWarner;
exports.formatJSONIC = formatJSONIC;
exports.validator = validator;
exports.canonize = canonize;
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
        .replace(/"([a-zA-Z_][a-zA-Z_0-9]*)": /g, '$1: ')
        .replace(/},/g, '}\n')
        // .replace(/([a-zA-Z_][a-zA-Z_0-9]*)_COMMENT:/g, '# $1')
        .replace(/\n(\s*)([a-zA-Z_][a-zA-Z_0-9]*)_COMMENT:\s*"(.*)",/g, '\n\n$1# $2 $3');
}
function depluralize(word) {
    if (!word || word.length === 0) {
        return word;
    }
    // Common irregular plurals
    const irregulars = {
        'analytics': 'analytics',
        'analyses': 'analysis',
        'appendices': 'appendix',
        'axes': 'axis',
        'children': 'child',
        'courses': 'course',
        'crises': 'crisis',
        'criteria': 'criterion',
        // 'data': 'datum',
        'diagnoses': 'diagnosis',
        'feet': 'foot',
        'furnace': 'furnaces',
        'geese': 'goose',
        'horses': 'horse',
        'house': 'houses',
        'indices': 'index',
        'license': 'licenses',
        'matrices': 'matrix',
        'men': 'man',
        'mice': 'mouse',
        'notice': 'notices',
        'oases': 'oasis',
        'releases': 'release',
        'people': 'person',
        'phenomena': 'phenomenon',
        'practice': 'practices',
        'promise': 'promises',
        'teeth': 'tooth',
        'theses': 'thesis',
        'vertices': 'vertex',
        'women': 'woman',
    };
    if (irregulars[word]) {
        return irregulars[word];
    }
    for (let ending in irregulars) {
        if (word.endsWith(ending)) {
            return word.replace(ending, irregulars[ending]);
        }
    }
    // Rules for regular plurals (applied in order)
    if (word.endsWith('ies') && word.length > 3) {
        return word.slice(0, -3) + 'y';
    }
    // -ies -> -y (cities -> city)
    if (word.endsWith('ies') && word.length > 3) {
        return word.slice(0, -3) + 'y';
    }
    // -ves -> -f or -fe (wolves -> wolf, knives -> knife)
    if (word.endsWith('ves')) {
        const stem = word.slice(0, -3);
        // Check if it should be -fe (like knife, wife, life)
        if (['kni', 'wi', 'li'].includes(stem)) {
            return stem + 'fe';
        }
        return stem + 'f';
    }
    // -oes -> -o (potatoes -> potato)
    if (word.endsWith('oes')) {
        return word.slice(0, -2);
    }
    // Handle words ending in -nses (like responses, expenses, licenses)
    // These should only lose the final -s, not -es
    if (word.endsWith('nses')) {
        return word.slice(0, -1);
    }
    // -ses, -xes, -zes, -shes, -ches -> remove -es (boxes -> box)
    if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('zes') ||
        word.endsWith('shes') || word.endsWith('ches')) {
        return word.slice(0, -2);
    }
    // -s -> remove -s (cats -> cat)
    if (word.endsWith('s') &&
        !word.endsWith('ss') &&
        !word.endsWith('us')) {
        return word.slice(0, -1);
    }
    // If none of the rules apply, return as is
    return word;
}
function find(obj, qkey) {
    let vals = [];
    (0, struct_1.walk)(obj, (key, val, _p, t) => {
        if (qkey === key) {
            vals.push({ key, val, path: t });
        }
        return val;
    });
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
    val = (0, util_1.decircular)(val);
    const hsepd = opts?.hsepd ?? 1;
    const showd = !!opts?.$;
    const useColor = opts?.color ?? false;
    const maxlines = opts?.maxlines ?? Number.MAX_VALUE;
    const exclude = opts?.exclude ?? [];
    const space = '  ';
    const isBareKey = (k) => /^[A-Za-z_][_A-Za-z0-9]*$/.test(k);
    const quoteKey = (k) => (isBareKey(k) ? k : JSON.stringify(k));
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
                    .replace(/\\"/g, ':')
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
function canonize(s) {
    return depluralize((0, jostraca_1.snakify)(s)).replace(/[^a-zA-Z_0-9]/g, '');
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