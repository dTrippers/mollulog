declare module "javascript-lp-solver" {
  export interface ILPModel {
    optimize: string;
    opType: "min" | "max";
    constraints: Record<string, { min?: number; max?: number; equal?: number }>;
    variables: Record<string, Record<string, number>>;
    ints?: Record<string, number>;
    tolerance?: number;
    timeout?: number;
  }

  export interface ILPResult {
    feasible: boolean;
    result?: number;
    isIntegral?: boolean;
    [variableName: string]: number | boolean | undefined;
  }

  export function Solve(model: ILPModel): ILPResult;
}
