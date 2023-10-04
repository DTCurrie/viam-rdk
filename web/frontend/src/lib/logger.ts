import { get, writable } from 'svelte/store';

export interface Logger {
  debug: (message: string, data?: unknown, once?: boolean) => void;
  info: (message: string, data?: unknown, once?: boolean) => void;
  warn: (message: string, data?: unknown, once?: boolean) => void;
  error: (message: string, data?: unknown, once?: boolean) => void;
}

const createConditionalLogger = (key: string, condition: boolean) => {
  const onceMap = writable<Record<string, boolean>>({});

  const log = (
    type: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    data?: unknown,
    once = false
  ) => {
    if (!condition) {
      return;
    }

    if (once) {
      const map = get(onceMap);
      if (map[message]) {
        return;
      }

      onceMap.set({ ...map, [message]: true });
    }

    if (data) {
      // eslint-disable-next-line no-console
      console[type](`[${key}] ${message}`, data);
    } else {
      // eslint-disable-next-line no-console
      console[type](`[${key}] ${message}`);
    }
  };

  const debug = (message: string, data?: unknown, once = false) =>
    log('debug', message, data, once);

  const info = (message: string, data?: unknown, once = false) =>
    log('info', message, data, once);

  const warn = (message: string, data?: unknown, once = false) =>
    log('warn', message, data, once);

  const error = (message: string, data?: unknown, once = false) =>
    log('error', message, data, once);

  return {
    debug,
    info,
    warn,
    error,
  };
};

export const createLogger = (key: string) =>
  createConditionalLogger(key, Boolean(localStorage.getItem('Viam.Debug.RC')));

export const createRequestLogger = (key: string, prefix: string) => {
  const logger = createConditionalLogger(
    key,
    Boolean(localStorage.getItem('Viam.Debug.GRPC'))
  );

  return {
    requestLogger: (request: unknown) => logger.debug(prefix, request),
  };
};
