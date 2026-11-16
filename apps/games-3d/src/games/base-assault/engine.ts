import * as T from 'three';
import { advanceRoom, createMission, damagePlayer, hitTarget, ROOM_NAMES, type Mission } from './model';

export interface Snapshot { phase: Mission['phase']; room: number; name: string; health: number; score: number; guards: number; cores: number; totalCores: number; cleared: boolean; spread: boolean; hit: boolean; hurt: boolean; muted: boolean; locked: boolean; warning: boolean; }
interface Actor { mesh: T.Group; target: Mission['targets'][number]; timer: number; origin: T.Vector3; lamp: T.Mesh; }
interface Bullet { mesh: T.Mesh; velocity: T.Vector3; ttl: number; }

export function createAssault(canvas: HTMLCanvasElement, publish: (value: Snapshot) => void, reportScore: (score: number) => void) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = T.SRGBColorSpace;
  const scene = new T.Scene(); scene.background = new T.Color('#09131d'); scene.fog = new T.Fog('#09131d', 16, 40);
  const camera = new T.PerspectiveCamera(68, 1, .05, 60); camera.rotation.order = 'YXZ'; scene.add(camera);
  scene.add(new T.HemisphereLight('#b6ecff', '#142338', 2.1));
  const sun = new T.DirectionalLight('#c5e4fa', 2.3); sun.position.set(3, 7, 8); scene.add(sun);
  const world = new T.Group(); scene.add(world);
  const weapon = new T.Group(); camera.add(weapon); weapon.position.set(.3, -.27, -.65);
  const materials = new Set<T.Material>(), geometries = new Set<T.BufferGeometry>();
  const material = (color: string, emissive?: string) => {
    const result = new T.MeshStandardMaterial({ color, roughness: .65, metalness: .4, emissive: emissive ?? '#000000', emissiveIntensity: emissive ? 1.5 : 0 });
    materials.add(result); return result;
  };
  const metal = material('#263c4c'), dark = material('#111c2a'), trim = material('#607480');
  const cyan = material('#62e8dd', '#1e7972'), orange = material('#ffb754', '#cf6018'), red = material('#f76a5c', '#a62218');
  const floorMat = material('#182a36'), guardMat = material('#577679');
  const boxGeometry = new T.BoxGeometry(1, 1, 1); geometries.add(boxGeometry);
  const sphereGeometry = new T.SphereGeometry(1, 8, 6); geometries.add(sphereGeometry);
  function box(parent: T.Object3D, size: [number, number, number], position: [number, number, number], mat: T.Material) {
    const mesh = new T.Mesh(boxGeometry, mat); mesh.scale.set(...size); mesh.position.set(...position); parent.add(mesh); return mesh;
  }
  box(weapon, [.18, .19, .58], [0, 0, 0], metal); box(weapon, [.08, .08, .4], [0, .02, -.44], dark);
  box(weapon, [.05, .025, .36], [0, .115, -.05], cyan); box(weapon, [.1, .2, .13], [0, -.15, .12], dark);
  const flash = box(weapon, [.18, .18, .06], [0, .02, -.66], orange); flash.visible = false;
  let mission = createMission(), actors: Actor[] = [], bullets: Bullet[] = [], blockers: T.Mesh[] = [], covers: T.Box3[] = [];
  let gate: T.Group, coreShield: T.Mesh | undefined;
  let yaw = 0, pitch = 0, fireHeld = false, sinceShot = 0, elapsed = 0, publishTime = 0, recoil = 0, hitUntil = 0, hurtUntil = 0;
  let audio: AudioContext | undefined, muted = false, destroyed = false, last = performance.now(), wasPlaying = false;
  const keys = new Set<string>(), touchMove = { x: 0, y: 0 };
  const ray = new T.Raycaster(), direction = new T.Vector3(), forward = new T.Vector3(), right = new T.Vector3();
  const cleanups: Array<() => void> = [];
  let resizeObserver: ResizeObserver | undefined;
  const host = canvas.parentElement!;
  function listen(target: EventTarget, type: string, fn: EventListener, options?: AddEventListenerOptions) {
    target.addEventListener(type, fn, options); cleanups.push(() => target.removeEventListener(type, fn, options));
  }
  function tone(frequency: number, length: number, type: OscillatorType = 'square') {
    if (muted || !audio || audio.state !== 'running') return;
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, audio.currentTime); oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * .25), audio.currentTime + length);
    gain.gain.setValueAtTime(.035, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + length);
    oscillator.connect(gain).connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + length);
  }
  function initAudio() { try { audio ??= new AudioContext(); void audio.resume().catch(() => {}); } catch { /* Silent play remains available. */ } }
  function snapshot() {
    publish({ phase: mission.phase, room: mission.room, name: ROOM_NAMES[mission.room], health: mission.health, score: mission.score,
      guards: mission.targets.filter(item => item.kind === 'guard' && item.hp > 0).length,
      cores: mission.targets.filter(item => item.kind !== 'guard' && item.hp > 0).length,
      totalCores: mission.room === 3 ? 3 : 1, cleared: mission.cleared, spread: mission.spread,
      hit: elapsed < hitUntil, hurt: elapsed < hurtUntil, muted, locked: document.pointerLockElement === canvas,
      warning: mission.room === 3 && actors.some(actor => actor.target.hp > 0 && actor.timer < .7),
    });
  }
  function makeRoom() {
    world.clear(); actors = []; bullets = []; blockers = []; covers = []; coreShield = undefined;
    camera.position.set(0, 1.65, 7.5); yaw = 0; pitch = 0; camera.rotation.set(0, 0, 0); keys.clear();
    box(world, [14, .4, 34], [0, -.2, -6], floorMat);
    box(world, [14, .35, 34], [0, 6, -6], dark);
    box(world, [.4, 6, 34], [-7, 3, -6], metal); box(world, [.4, 6, 34], [7, 3, -6], metal);
    box(world, [14, 6, .5], [0, 3, 11], metal);
    for (const [x, z] of [[-3.8, 2], [3.8, -3]]) {
      const cover = box(world, [2, 1.8, 1.4], [x, .9, z], metal);
      blockers.push(cover); covers.push(new T.Box3().setFromObject(cover));
      box(world, [1.8, .08, 1.45], [x, 1.82, z], trim);
    }
    for (let z = 8; z >= -21; z -= 5) {
      for (const x of [-6.75, 6.75]) { box(world, [.45, 6, .5], [x, 3, z], trim); box(world, [.08, 3.5, .15], [x + (x < 0 ? .3 : -.3), 3, z], mission.room === 3 ? red : cyan); }
      box(world, [10, .08, .15], [0, 5.7, z], trim);
      for (const x of [-4.5, 4.5]) box(world, [.08, .02, 2.5], [x, .025, z], cyan);
    }
    gate = new T.Group(); world.add(gate);
    box(gate, [5.4, 5, .6], [0, 2.5, -17], dark);
    for (const x of [-4.9, 4.9]) box(world, [4.4, 6, .6], [x, 3, -17], metal);
    box(world, [5.4, 1, .6], [0, 5.5, -17], metal);
    box(gate, [4.7, .08, .05], [0, 3.8, -16.65], red);
    for (const target of mission.targets) {
      const root = new T.Group(); world.add(root);
      let lamp: T.Mesh;
      if (target.kind === 'guard') {
        const index = Number(target.id.split('-')[1]);
        root.position.set((index % 2 ? 1 : -1) * (2.6 + Math.floor(index / 2) * 1.4), 0, -3.5 - Math.floor(index / 2) * 5);
        box(root, [.9, 1, .65], [0, 1.4, 0], guardMat); box(root, [.65, .55, .6], [0, 2.15, 0], metal);
        lamp = box(root, [.47, .12, .06], [0, 2.2, .34], red);
        for (const x of [-.3, .3]) box(root, [.25, .8, .3], [x, .4, 0], dark);
        box(root, [1.4, .23, .3], [0, 1.45, .42], dark);
      } else {
        const index = target.kind === 'boss' ? Number(target.id.split('-')[1]) : 0;
        root.position.set(target.kind === 'boss' ? (index - 1) * 3.1 : 0, target.kind === 'boss' ? (index === 1 ? 3.1 : 2) : 2.6, -15.7);
        box(root, [2.1, 2.1, .5], [0, 0, -.1], trim);
        box(root, [1.65, 1.65, .6], [0, 0, .2], dark);
        lamp = box(root, [1.1, 1.1, .35], [0, 0, .65], target.kind === 'boss' ? red : orange);
        if (target.kind === 'core') { coreShield = box(root, [1.8, 1.8, .05], [0, 0, .88], cyan); }
      }
      root.traverse(object => { object.userData.targetId = target.id; });
      actors.push({ mesh: root, target, lamp, origin: root.position.clone(), timer: 2 + actors.length * .65 });
    }
    world.updateMatrixWorld(true); snapshot();
  }
  function releasePointer() { if (document.pointerLockElement === canvas) document.exitPointerLock(); }
  function capturePointer() { try { const request = canvas.requestPointerLock?.(); if (request) void request.catch(() => {}); } catch { /* Drag / keyboard aim works without lock. */ } }
  function start() { if ((mission.phase as Mission['phase']) === 'dead' || (mission.phase as Mission['phase']) === 'won') restart(); mission.phase = 'playing'; initAudio(); canvas.focus(); capturePointer(); snapshot(); }
  function pause() { if (mission.phase !== 'playing') return; mission.phase = 'paused'; fireHeld = false; keys.clear(); touchMove.x = touchMove.y = 0; releasePointer(); void audio?.suspend(); snapshot(); }
  function resume() { if (mission.phase !== 'paused') return; mission.phase = 'playing'; initAudio(); canvas.focus(); capturePointer(); snapshot(); }
  function restart() { mission = createMission(); mission.phase = 'playing'; elapsed = 0; sinceShot = 0; hitUntil = hurtUntil = 0; fireHeld = false; makeRoom(); initAudio(); reportScore(0); }
  function toggleMute() { muted = !muted; snapshot(); }
  function shoot() {
    if (mission.phase !== 'playing' || sinceShot < .12) return;
    sinceShot = 0; recoil = 1; tone(170, .055);
    const live = actors.filter(actor => actor.target.hp > 0).map(actor => actor.mesh);
    for (const offset of (mission.spread ? [-.035, 0, .035] : [0])) {
      camera.getWorldDirection(direction); direction.applyAxisAngle(new T.Vector3(0, 1, 0), offset);
      ray.set(camera.position, direction); ray.far = 45;
      const hit = ray.intersectObjects([...live, ...blockers], true)[0];
      if (!hit?.object.userData.targetId) continue;
      const actor = actors.find(item => item.target.id === hit.object.userData.targetId)!;
      if (hitTarget(mission, actor.target.id)) { hitUntil = elapsed + .12; tone(actor.target.hp === 0 ? 320 : 700, .05, 'triangle'); reportScore(mission.score); }
    }
    snapshot();
  }
  function projectile(actor: Actor, angle = 0) {
    const mesh = new T.Mesh(sphereGeometry, actor.target.kind === 'boss' ? orange : red); mesh.scale.setScalar(.16);
    mesh.position.copy(actor.mesh.position).add(new T.Vector3(0, actor.target.kind === 'guard' ? 1.7 : 0, .8));
    const velocity = camera.position.clone().sub(mesh.position).normalize().applyAxisAngle(new T.Vector3(0, 1, 0), angle).multiplyScalar(actor.target.kind === 'boss' ? 8 : 6.5);
    world.add(mesh); bullets.push({ mesh, velocity, ttl: 6 });
  }
  let pointer: { id: number; x: number; y: number } | undefined;
  listen(canvas, 'contextmenu', event => event.preventDefault());
  listen(canvas, 'pointerdown', ((event: PointerEvent) => {
    if (event.button !== 0) return;
    if (event.pointerType !== 'mouse') { pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); }
    else { fireHeld = true; capturePointer(); shoot(); }
  }) as EventListener);
  listen(window, 'pointerup', (() => { fireHeld = false; pointer = undefined; }) as EventListener);
  listen(window, 'pointermove', ((event: PointerEvent) => {
    if (mission.phase !== 'playing') return;
    if (document.pointerLockElement === canvas) { yaw -= event.movementX * .0024; pitch -= event.movementY * .0024; }
    else if ((pointer && pointer.id === event.pointerId) || (event.buttons === 1 && event.target === canvas)) {
      yaw -= (pointer ? event.clientX - pointer.x : event.movementX) * .004;
      pitch -= (pointer ? event.clientY - pointer.y : event.movementY) * .004;
      if (pointer) { pointer.x = event.clientX; pointer.y = event.clientY; }
    }
    pitch = T.MathUtils.clamp(pitch, -.85, .85);
  }) as EventListener);
  listen(window, 'keydown', ((event: KeyboardEvent) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    if (event.repeat && ['Escape', 'KeyR', 'KeyM'].includes(event.code)) return;
    if (event.code === 'Escape') { if (mission.phase === 'playing') pause(); else resume(); }
    if (event.code === 'KeyR') restart();
    if (event.code === 'KeyM') toggleMute();
    keys.add(event.code);
  }) as EventListener);
  listen(window, 'keyup', ((event: KeyboardEvent) => { keys.delete(event.code); }) as EventListener);
  listen(window, 'blur', (() => pause()) as EventListener);
  listen(document, 'visibilitychange', (() => { if (document.hidden) pause(); }) as EventListener);
  listen(document, 'pointerlockchange', (() => { if (wasPlaying && document.pointerLockElement !== canvas) pause(); wasPlaying = document.pointerLockElement === canvas; }) as EventListener);
  function resize() { const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); }
  function step(now: number) {
    if (destroyed) return;
    const dt = Math.min((now - last) / 1000, .05); last = now;
    if (mission.phase === 'playing') {
      elapsed += dt; sinceShot += dt;
      yaw += ((keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0)) * dt * 1.3;
      pitch = T.MathUtils.clamp(pitch + ((keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0)) * dt, -.85, .85);
      camera.rotation.set(pitch, yaw, 0);
      forward.set(-Math.sin(yaw), 0, -Math.cos(yaw)); right.set(Math.cos(yaw), 0, -Math.sin(yaw));
      const x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + touchMove.x;
      const z = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) + touchMove.y;
      const old = camera.position.clone(), speed = (keys.has('ShiftLeft') ? 6 : 4.3) * dt / Math.max(1, Math.hypot(x, z));
      camera.position.addScaledVector(right, x * speed).addScaledVector(forward, z * speed);
      camera.position.x = T.MathUtils.clamp(camera.position.x, -6.3, 6.3); camera.position.z = T.MathUtils.clamp(camera.position.z, mission.cleared ? -19 : -13, 9.5);
      if (covers.some(cover => camera.position.x > cover.min.x - .3 && camera.position.x < cover.max.x + .3 && camera.position.z > cover.min.z - .3 && camera.position.z < cover.max.z + .3)) camera.position.copy(old);
      if (fireHeld || keys.has('Space')) shoot();
      const guardsAlive = mission.targets.some(item => item.kind === 'guard' && item.hp > 0);
      if (coreShield) coreShield.visible = guardsAlive;
      for (const actor of actors) {
        actor.mesh.visible = actor.target.hp > 0;
        if (!actor.mesh.visible) continue;
        const exposed = actor.target.kind !== 'core' || !guardsAlive;
        actor.lamp.scale.x = (actor.target.kind === 'guard' ? .47 : 1.1) * actor.target.hp / actor.target.maxHp;
        if (!exposed || actor.target.kind === 'core') continue;
        actor.timer -= dt;
        if (actor.target.kind === 'guard') actor.mesh.position.x = actor.origin.x + Math.sin(elapsed * 1.1 + actor.origin.z) * .8;
        if (actor.timer <= 0) {
          if (actor.target.kind === 'boss') for (const angle of [-.18, 0, .18]) projectile(actor, angle);
          else projectile(actor);
          actor.timer = actor.target.kind === 'boss' ? 2.6 : Math.max(1.4, 3.2 - mission.room * .45);
        }
      }
      for (const bullet of bullets) {
        const distance = bullet.velocity.length() * dt;
        ray.set(bullet.mesh.position, direction.copy(bullet.velocity).normalize()); ray.far = distance + .2;
        if (ray.intersectObjects(blockers, false).length) bullet.ttl = 0;
        const segment = new T.Line3(bullet.mesh.position.clone(), bullet.mesh.position.clone().addScaledVector(bullet.velocity, dt));
        if (segment.closestPointToPoint(camera.position, true, new T.Vector3()).distanceTo(camera.position) < .48 && bullet.ttl > 0) { damagePlayer(mission, 12); hurtUntil = elapsed + .25; bullet.ttl = 0; tone(65, .1); }
        bullet.mesh.position.addScaledVector(bullet.velocity, dt); bullet.ttl -= dt;
      }
      bullets = bullets.filter(bullet => { if (bullet.ttl > 0) return true; world.remove(bullet.mesh); return false; });
      gate.position.y = T.MathUtils.damp(gate.position.y, mission.cleared ? 5.8 : 0, 4, dt);
      if (mission.cleared && mission.room < 3 && camera.position.z < -18 && Math.abs(camera.position.x) < 2.3) { advanceRoom(mission); makeRoom(); tone(700, .15, 'triangle'); }
      if ((mission.phase as Mission['phase']) === 'dead' || (mission.phase as Mission['phase']) === 'won') { releasePointer(); fireHeld = false; snapshot(); }
    }
    recoil = Math.max(0, recoil - dt * 9); weapon.position.z = -.65 + recoil * .07; flash.visible = recoil > .7;
    publishTime += dt; if (publishTime > .08) { publishTime = 0; snapshot(); }
    renderer.render(scene, camera);
  }
  try { resize(); makeRoom(); resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host); renderer.setAnimationLoop(step); }
  catch (error) { renderer.dispose(); materials.forEach(value => value.dispose()); geometries.forEach(value => value.dispose()); cleanups.forEach(cleanup => cleanup()); throw error; }
  return { start, pause, resume, restart, toggleMute, fire: (active: boolean) => { fireHeld = active; if (active) shoot(); },
    move: (x: number, y: number) => { touchMove.x = x; touchMove.y = y; },
    dispose() { destroyed = true; renderer.setAnimationLoop(null); releasePointer(); cleanups.forEach(cleanup => cleanup()); resizeObserver?.disconnect(); void audio?.close().catch(() => {}); materials.forEach(value => value.dispose()); geometries.forEach(value => value.dispose()); renderer.dispose(); renderer.forceContextLoss(); scene.clear(); },
  };
}
