// Minimal stand-in for the `react-native` package so the REAL llama.rn JavaScript and the app services can run under Node.
exports.Platform = { OS: 'android', select: (o) => (o.android !== undefined ? o.android : o.default) };
exports.TurboModuleRegistry = { get: () => ({ install: async () => true }) };
exports.Linking = { openSettings: async () => undefined };
exports.PermissionsAndroid = { PERMISSIONS: { READ_EXTERNAL_STORAGE: 'r', WRITE_EXTERNAL_STORAGE: 'w' }, requestMultiple: async () => ({}) };
const listeners = { change: [], memoryWarning: [] };
globalThis.__appStateListeners = listeners;
exports.AppState = {
  currentState: 'active',
  addEventListener(type, cb) {
    (listeners[type] ||= []).push(cb);
    return { remove() { listeners[type] = listeners[type].filter((x) => x !== cb); } };
  },
};
