import { notify } from '@viamrobotics/prime';

const NON_USER_ERRORS: Readonly<Set<string>> = new Set([
  'Response closed without headers',
]);

const errorsToLogOnce: Record<string, boolean> = {};

const logError = (message: string, error: unknown, onceKey?: string) => {
  if (onceKey) {
    if (errorsToLogOnce[onceKey]) {
      return;
    }

    errorsToLogOnce[onceKey] = true;
  }

  // eslint-disable-next-line no-console
  console.error(message, error);
};

export const getErrorMessage = (error: unknown): string | undefined => {
  if (
    error !== null &&
    error instanceof Object &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return undefined;
};

const handleError = (error: unknown, onceKey?: string) => {
  if (typeof error === 'string') {
    if (!NON_USER_ERRORS.has(error)) {
      notify.danger(error);
    }

    logError(error, {}, onceKey);
    return;
  }

  if (
    error instanceof Object &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    const { message } = error;

    if (!NON_USER_ERRORS.has(message)) {
      notify.danger(message);
    }

    logError(message, error, onceKey);
    return;
  }

  logError('Unknown error', error, onceKey);
};

export const displayError = (error: unknown) => handleError(error);
export const displayErrorOnce = (error: unknown, key: string) =>
  handleError(error, key);
