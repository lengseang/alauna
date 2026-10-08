// expo-keep-awake + expo-intent-launcher no-ops (the exports are the union; each module only uses its own).
exports.activateKeepAwakeAsync = async () => undefined;
exports.deactivateKeepAwake = async () => undefined;
exports.startActivityAsync = async () => ({ resultCode: 0 });
