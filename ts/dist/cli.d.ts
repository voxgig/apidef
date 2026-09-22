import Path from 'node:path';
type CliOptions = {
    name: string;
    folder: string;
    def: string;
    prefix?: string;
    watch: boolean;
    debug?: string;
    help: boolean;
    version: boolean;
};
type CliProject = {
    root: string;
    folder: string;
    outprefix: string;
    def: string;
    model: {
        name: string;
        def: string;
    };
    guide: string;
    legacyguide: string;
};
type CliIO = {
    log: (...args: any[]) => void;
    error: (...args: any[]) => void;
};
declare function usage(): string;
declare function resolveOptions(argv: string[]): CliOptions;
declare function validateOptions(rawOptions: CliOptions): CliOptions;
declare function defName(deffolder: string, def: string, path?: typeof Path): string;
declare function resolveProject(options: CliOptions): CliProject;
declare function checkProject(project: CliProject): void;
declare function runCli(argv: string[], io?: CliIO): Promise<number>;
declare function main(): void;
export { main, runCli, resolveOptions, validateOptions, defName, resolveProject, checkProject, usage, };
export type { CliOptions, CliProject, CliIO, };
