"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadFile = loadFile;
exports.formatJsonSrc = formatJsonSrc;
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
//# sourceMappingURL=utility.js.map