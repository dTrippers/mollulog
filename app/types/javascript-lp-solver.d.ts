declare module "javascript-lp-solver" {
  export interface ILPModel {
    optimize: string;
    opType: "min" | "max";
    constraints: Record<string, { min?: number; max?: number; equal?: number }>;
    variables: Record<string, Record<string, number>>;
    ints?: Record<string, number>;
  }

  export interface ILPResult {
    feasible: boolean;
    result?: number;
    [variableName: string]: number | boolean | undefined;
  }

  export function Solve(model: ILPModel): ILPResult;
}

