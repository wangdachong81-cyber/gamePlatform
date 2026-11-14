// Own document queries, browser listeners, timers and audio for one game mount.
let current;
const nativeWindow = globalThis.window;
const nativeDocument = globalThis.document;

export function initializeEnvironment(root) {
  if (current) throw new Error('几猫游戏已在运行');
  const scope = { root, active: true, values: new Map(), listeners: [], timers: new Set(), intervals: new Set(), frames: new Set(), audio: new Set() };
  current = scope;
  return () => {
    scope.active = false;
    for (const [target, type, listener, options] of scope.listeners) target.removeEventListener(type, listener, options);
    for (const id of scope.timers) nativeWindow.clearTimeout(id);
    for (const id of scope.intervals) nativeWindow.clearInterval(id);
    for (const id of scope.frames) nativeWindow.cancelAnimationFrame(id);
    for (const audio of scope.audio) if (audio.state !== 'closed') void audio.close().catch(() => {});
    if (current === scope) current = undefined;
  };
}

export function assertActive() {
  if (!current?.active) throw new DOMException('游戏已关闭', 'AbortError');
}
export function getGameContext() { return current?.values.get('__G'); }
export function getGameStats() { return current?.values.get('__stats')?.(); }

function listen(target, type, listener, options) {
  assertActive();
  current.listeners.push([target, type, listener, options]);
  target.addEventListener(type, listener, options);
}
export const addEventListener = (...args) => listen(nativeWindow, ...args);
export const removeEventListener = (...args) => nativeWindow.removeEventListener(...args);
export function setTimeout(callback, delay, ...args) {
  assertActive();
  const scope = current;
  const id = nativeWindow.setTimeout(() => { scope.timers.delete(id); if (scope.active) callback(...args); }, delay);
  scope.timers.add(id); return id;
}
export function clearTimeout(id) { current?.timers.delete(id); nativeWindow.clearTimeout(id); }
export function setInterval(callback, delay, ...args) {
  assertActive();
  const scope = current;
  const id = nativeWindow.setInterval(() => { if (scope.active) callback(...args); }, delay);
  scope.intervals.add(id); return id;
}
export function clearInterval(id) { current?.intervals.delete(id); nativeWindow.clearInterval(id); }
export function requestAnimationFrame(callback) {
  assertActive();
  const scope = current;
  const id = nativeWindow.requestAnimationFrame(time => { scope.frames.delete(id); if (scope.active) callback(time); });
  scope.frames.add(id); return id;
}
export function cancelAnimationFrame(id) { current?.frames.delete(id); nativeWindow.cancelAnimationFrame(id); }

const scheduled = { addEventListener, removeEventListener, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame };
export const gameWindow = new Proxy(nativeWindow, {
  get(target, key) {
    if (typeof key === 'string' && key.startsWith('__')) return current?.values.get(key);
    if (key in scheduled) return scheduled[key];
    const value = Reflect.get(target, key, target);
    if ((key === 'AudioContext' || key === 'webkitAudioContext') && value) return new Proxy(value, { construct(Type, args) { const instance = new Type(...args); current?.audio.add(instance); return instance; } });
    return typeof value === 'function' ? value.bind(target) : value;
  },
  set(target, key, value) {
    if (typeof key === 'string' && key.startsWith('__')) { current?.values.set(key, value); return true; }
    return Reflect.set(target, key, value, target);
  },
});
export const gameDocument = new Proxy(nativeDocument, {
  get(target, key) {
    if (key === 'getElementById') return id => current?.root.querySelector('#' + CSS.escape(id)) ?? null;
    if (key === 'querySelector' || key === 'querySelectorAll') return (...args) => current?.root[key](...args);
    if (key === 'documentElement') return current?.root.host;
    if (key === 'body') return current?.root.querySelector('#app');
    if (key === 'pointerLockElement') return current?.root.pointerLockElement ?? target.pointerLockElement;
    if (key === 'fullscreenElement') return current?.root.fullscreenElement ?? target.fullscreenElement;
    if (key === 'addEventListener') return (...args) => listen(target, ...args);
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});
