type Vec = Record<string, number>;
type Unit = {
    b: number;
    w: Record<string, number>;
};
type Activation = 'relu' | 'linear';
type Layer = {
    inputs: string[];
    outputs: string[];
    w: number[][];
    b: number[];
    act: Activation;
};
type Net = {
    features: string[];
    layers: Layer[];
    classes: string[];
};
type Decision = {
    cls: string;
    index: number;
    p: number[];
    logits: number[];
    hidden: number[];
    evidence: {
        unit: string;
        amount: number;
    }[];
};
declare function dense(inputs: string[], units: Record<string, Unit>, act: Activation): Layer;
declare function relu(x: number): number;
declare function apply(layer: Layer, x: number[]): number[];
declare function vector(names: string[], x: Vec): number[];
declare function forward(layers: Layer[], x: number[]): number[][];
declare function softmax(logits: number[]): number[];
declare function argmax(v: number[]): number;
declare function makeNet(features: string[], hidden: Record<string, Unit>, out: Record<string, Unit>): Net;
declare function decide(net: Net, x: Vec): Decision;
declare function explain(label: string, d: Decision): string;
export { dense, relu, apply, vector, forward, softmax, argmax, makeNet, decide, explain, };
export type { Vec, Unit, Activation, Layer, Net, Decision, };
