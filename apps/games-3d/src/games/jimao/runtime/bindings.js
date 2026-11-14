export function defineExports(target, getters) {
  for (const [name, get] of Object.entries(getters)) Object.defineProperty(target, name, { get, enumerable: true });
}
