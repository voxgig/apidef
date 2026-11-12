type Dtype = 'F64' | 'F32' | 'F16' | 'BF16' | 'I64' | 'I32' | 'I16' | 'I8' | 'U8' | 'BOOL';
type Tensor = {
    dtype: Dtype;
    shape: number[];
    data: number[];
};
type SafeTensors = {
    metadata: Record<string, string>;
    tensors: Record<string, Tensor>;
};
declare const DTYPE_BYTES: Record<Dtype, number>;
declare function parseSafetensors(bytes: Uint8Array): SafeTensors;
declare function serializeSafetensors(st: SafeTensors): Uint8Array;
export { parseSafetensors, serializeSafetensors, DTYPE_BYTES, };
export type { Dtype, Tensor, SafeTensors, };
