"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadFile = loadFile;
exports.formatJsonSrc = formatJsonSrc;
exports.depluralize = depluralize;
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
        'children': 'child',
        'men': 'man',
        'women': 'woman',
        'teeth': 'tooth',
        'feet': 'foot',
        'geese': 'goose',
        'mice': 'mouse',
        'people': 'person',
        'data': 'datum',
        'criteria': 'criterion',
        'phenomena': 'phenomenon',
        'indices': 'index',
        'matrices': 'matrix',
        'vertices': 'vertex',
        'analyses': 'analysis',
        'axes': 'axis',
        'crises': 'crisis',
        'diagnoses': 'diagnosis',
        'oases': 'oasis',
        'theses': 'thesis',
        'appendices': 'appendix'
    };
    if (irregulars[word]) {
        return irregulars[word];
    }
    // Rules for regular plurals (applied in order)
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
    // -ses, -xes, -zes, -shes, -ches -> remove -es (boxes -> box)
    if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('zes') ||
        word.endsWith('shes') || word.endsWith('ches')) {
        return word.slice(0, -2);
    }
    // -s -> remove -s (cats -> cat)
    if (word.endsWith('s') && !word.endsWith('ss')) {
        return word.slice(0, -1);
    }
    // If none of the rules apply, return as is
    return word;
}
//# sourceMappingURL=utility.js.map