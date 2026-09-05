/** Errors that are safe to present as actionable user input feedback. */
export class ActionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionValidationError";
  }
}

export function isActionValidationError(error: unknown): error is ActionValidationError {
  return error instanceof ActionValidationError;
}
