"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadFile = loadFile;
exports.writeChanged = writeChanged;
const node_path_1 = __importDefault(require("node:path"));
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
function writeChanged(point, path, content, fs, log, flags) {
    let exists = false;
    let changed = false;
    flags = flags || {};
    flags.update = null == flags.update ? true : !!flags.update;
    let action = '';
    try {
        let existingContent = '';
        path = node_path_1.default.normalize(path);
        exists = fs.existsSync(path);
        if (exists) {
            action = 'read';
            existingContent = fs.readFileSync(path, 'utf8');
        }
        changed = existingContent !== content;
        action = flags.update ? 'write' : 'skip';
        log.info({
            point: 'write-' + point,
            note: (changed ? '' : 'not-') + 'changed ' + path,
            write: 'file', skip: !changed, exists, changed,
            contentLength: content.length, file: path
        });
        if (!exists || (changed && flags.update)) {
            fs.writeFileSync(path, content);
        }
    }
    catch (err) {
        log.error({
            fail: action, point, file: path, exists, changed,
            contentLength: content.length, err
        });
        err.__logged__ = true;
        throw err;
    }
}
//# sourceMappingURL=utility.js.map