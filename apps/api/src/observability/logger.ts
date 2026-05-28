export const logger = {
  info(message: string, data?: unknown) {
    console.log(JSON.stringify({ level: "info", message, data, time: new Date().toISOString() }));
  },
  warn(message: string, data?: unknown) {
    console.warn(JSON.stringify({ level: "warn", message, data, time: new Date().toISOString() }));
  },
  error(message: string, data?: unknown) {
    console.error(JSON.stringify({ level: "error", message, data, time: new Date().toISOString() }));
  },
};
