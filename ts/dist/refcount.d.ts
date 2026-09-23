declare const REFCOUNT_CAP = 1000000000;
declare function satAdd(a: number, b: number): number;
declare function satMul(a: number, w: number): number;
declare function byCodePoint(a: string, b: string): number;
declare function countRefs(def: any): Record<string, number>;
export { REFCOUNT_CAP, byCodePoint, countRefs, satAdd, satMul, };
