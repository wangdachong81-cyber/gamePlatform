import { useEffect, useRef, useState } from 'react';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import { createGameClient } from '@youxi/game-sdk';
import { buildWorld, Track } from './track';
import { createCar, type CarRig } from './car';
import { createPlayerCar } from './player-car';
import { createEngineAudio } from './audio';
import {
  IDLE_INPUT,
  MAX_SPEED,
  clamp,
  createVehicle,
  resetVehicle,
  forwardFromHeading,
  headingFromTangent,
  stepVehicle,
  type DriveInput,
} from './physics';

const LAPS = 3;
const FIXED_DT = 1 / 120;

type Phase = 'countdown' | 'racing' | 'finished';

interface Rival {
  rig: CarRig;
  distance: number;
  previousDistance: number;
  speed: number;
  lane: number;
  baseSpeed: number;
  laps: number;
  startOffset: number;
  progress: number;
}

interface Result {
  time: number;
  best: number;
  rank: number;
  total: number;
}

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return '--:--.---';
  const total = Math.max(0, seconds);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${(total - minutes * 60).toFixed(3).padStart(6, '0')}`;
};

export default function NeonRacer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const speedRef = useRef<HTMLSpanElement>(null);
  const lapRef = useRef<HTMLSpanElement>(null);
  const posRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const bestRef = useRef<HTMLSpanElement>(null);
  const nitroRef = useRef<HTMLDivElement>(null);
  const gearRef = useRef<HTMLSpanElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const restartRef = useRef<() => void>(() => {});
  const audioRef = useRef<() => void>(() => {});

  const [phase, setPhase] = useState<Phase>('countdown');
  const [countdown, setCountdown] = useState('3');
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const client = createGameClient('neon-racer');

    let engine: Engine | undefined;
    let scene: Scene | undefined;
    let observer: ResizeObserver | undefined;
    let unsubscribe = () => {};
    let pausedLocal = false;
    let phaseLocal: Phase = 'countdown';
    let countdownRemaining = 3;
    let lastCountdown = 4;
    let goTimer = 0;
    let raceTime = 0;
    let lapStart = 0;
    let bestLap = Infinity;
    let lapShown = 1;
    let accumulator = 0;

    const audio = createEngineAudio();
    audioRef.current = audio.unlock;
    let audioMuted = false;
    const keys = { up: false, down: false, left: false, right: false, boost: false, brake: false };
    const resetKeys = () => {
      keys.up = false;
      keys.down = false;
      keys.left = false;
      keys.right = false;
      keys.boost = false;
      keys.brake = false;
    };

    try {
      engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true, antialias: true }, true);
      const activeEngine = engine;
      scene = new Scene(activeEngine);
      const activeScene = scene;
      scene.clearColor = new Color4(0.012, 0.016, 0.038, 1);
      scene.fogMode = Scene.FOGMODE_EXP2;
      scene.fogColor = new Color3(0.02, 0.03, 0.075);
      scene.fogDensity = 0.0018;

      const camera = new FreeCamera('chase', new Vector3(0, 6, -12), activeScene);
      camera.minZ = 0.4;
      camera.maxZ = 2600;
      camera.fov = 0.86;
      camera.inputs.clear();

      const hemi = new HemisphericLight('hemi', new Vector3(0.2, 1, 0.1), activeScene);
      hemi.intensity = 0.34;
      hemi.diffuse = new Color3(0.55, 0.62, 0.95);
      hemi.groundColor = new Color3(0.06, 0.04, 0.12);

      const moon = new DirectionalLight('moon', new Vector3(-0.4, -1, -0.3), activeScene);
      moon.intensity = 0.3;
      moon.diffuse = new Color3(0.6, 0.72, 1);

      const glow = new GlowLayer('glow', activeScene, { blurKernelSize: 32, mainTextureFixedSize: 512 });
      glow.intensity = 0.55;

      const track = new Track();
      const { startPose, sky } = buildWorld(activeScene, track);
      glow.addExcludedMesh(sky);
      const startHeading = headingFromTangent(startPose.tx, startPose.tz);

      // 玩家车用独立的程序化赛车；三台 AI 仍走 car.ts 的旧模型
      const player = createPlayerCar(activeScene, { color: '#e8eefc', accent: '#5ff2ff' });
      player.root.position.set(startPose.x, 0, startPose.z);
      player.root.rotation.y = startHeading;

      const rivalSpecs = [
        { color: '#ff3f6e', accent: '#ff8fae', lane: -3.6, offset: 9, base: 82 },
        { color: '#ffc24a', accent: '#ffe08a', lane: 3.6, offset: 9, base: 79 },
        { color: '#8b6bff', accent: '#c8b6ff', lane: 0, offset: 18, base: 76 },
      ];
      const rivals: Rival[] = rivalSpecs.map((spec) => {
        const rig = createCar(activeScene, { color: spec.color, accent: spec.accent });
        const distance = (track.length - spec.offset) % track.length;
        const pose = track.sampleAt(distance);
        rig.root.position.set(pose.x + pose.nx * spec.lane, 0, pose.z + pose.nz * spec.lane);
        rig.root.rotation.y = headingFromTangent(pose.tx, pose.tz);
        return {
          rig,
          distance,
          previousDistance: distance,
          speed: 0,
          lane: spec.lane,
          baseSpeed: spec.base,
          laps: -1,
          startOffset: distance,
          progress: 0,
        };
      });

      const vehicle = createVehicle(startPose);
      const driveInput: DriveInput = { throttle: 0, brake: 0, steer: 0, boost: false, active: true };

      // 相机位置与注视点分开平滑：注视点滞后一点，过弯才不会瞬间甩镜头
      const cameraBase = new Vector3();
      const lookTarget = new Vector3();
      const placeCameraAtStart = () => {
        const forward = forwardFromHeading(startHeading);
        cameraBase.set(startPose.x - forward.x * 8.8, 3.6, startPose.z - forward.z * 8.8);
        lookTarget.set(startPose.x + forward.x * 11, 1.45, startPose.z + forward.z * 11);
        camera.position.copyFrom(cameraBase);
        camera.setTarget(lookTarget);
        camera.fov = 0.86;
      };
      placeCameraAtStart();

      const reset = () => {
        resetVehicle(vehicle, startPose);
        player.root.position.set(startPose.x, 0, startPose.z);
        player.root.rotation.set(0, startHeading, 0);
        player.flames.forEach((flame) => flame.setEnabled(false));
        placeCameraAtStart();
        accumulator = 0;
        rivals.forEach((rival, i) => {
          const spec = rivalSpecs[i];
          const distance = (track.length - spec.offset) % track.length;
          const pose = track.sampleAt(distance);
          rival.distance = distance;
          rival.previousDistance = distance;
          rival.speed = 0;
          rival.laps = -1;
          rival.progress = 0;
          rival.startOffset = distance;
          rival.rig.root.position.set(pose.x + pose.nx * rival.lane, 0, pose.z + pose.nz * rival.lane);
          rival.rig.root.rotation.y = headingFromTangent(pose.tx, pose.tz);
        });
        countdownRemaining = 3;
        lastCountdown = 4;
        goTimer = 0;
        raceTime = 0;
        lapStart = 0;
        bestLap = Infinity;
        lapShown = 1;
        phaseLocal = 'countdown';
        pausedLocal = false;
        setPhase('countdown');
        setCountdown('3');
        setResult(null);
        setPaused(false);
        audio.setMuted(audioMuted);
        client.score(0);
        if (bestRef.current) bestRef.current.textContent = '--:--.---';
        if (timeRef.current) timeRef.current.textContent = '0:00.000';
      };
      restartRef.current = reset;

      const onKeyDown = (event: KeyboardEvent) => {
        switch (event.code) {
          case 'ArrowUp':
          case 'KeyW':
            keys.up = true;
            break;
          case 'ArrowDown':
          case 'KeyS':
            keys.down = true;
            break;
          case 'ArrowLeft':
          case 'KeyA':
            keys.left = true;
            break;
          case 'ArrowRight':
          case 'KeyD':
            keys.right = true;
            break;
          case 'ShiftLeft':
          case 'ShiftRight':
            keys.boost = true;
            break;
          case 'Space':
            keys.brake = true;
            break;
          case 'KeyR':
            if (!event.repeat) reset();
            break;
          case 'KeyM':
            if (!event.repeat) {
              audioMuted = !audioMuted;
              audio.setMuted(audioMuted);
            }
            break;
          default:
            return;
        }
        audio.unlock();
        event.preventDefault();
      };
      const onKeyUp = (event: KeyboardEvent) => {
        switch (event.code) {
          case 'ArrowUp':
          case 'KeyW':
            keys.up = false;
            break;
          case 'ArrowDown':
          case 'KeyS':
            keys.down = false;
            break;
          case 'ArrowLeft':
          case 'KeyA':
            keys.left = false;
            break;
          case 'ArrowRight':
          case 'KeyD':
            keys.right = false;
            break;
          case 'ShiftLeft':
          case 'ShiftRight':
            keys.boost = false;
            break;
          case 'Space':
            keys.brake = false;
            break;
          default:
            break;
        }
      };
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', resetKeys);

      // 小地图：静态赛道画一次路径，每帧只重绘车辆点位
      const mapCanvas = mapRef.current;
      const mapCtx = mapCanvas?.getContext('2d');
      let mapPath: Path2D | undefined;
      let mapToX = (x: number) => x;
      let mapToY = (z: number) => z;
      if (mapCanvas && mapCtx) {
        const size = 150;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        mapCanvas.width = size * dpr;
        mapCanvas.height = size * dpr;
        mapCtx.scale(dpr, dpr);
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (const sample of track.samples) {
          minX = Math.min(minX, sample.x);
          maxX = Math.max(maxX, sample.x);
          minZ = Math.min(minZ, sample.z);
          maxZ = Math.max(maxZ, sample.z);
        }
        const pad = 12;
        const scale = Math.min((size - pad * 2) / (maxX - minX), (size - pad * 2) / (maxZ - minZ));
        const offsetX = (size - (maxX - minX) * scale) / 2 - minX * scale;
        const offsetY = (size - (maxZ - minZ) * scale) / 2 - minZ * scale;
        mapToX = (x: number) => x * scale + offsetX;
        mapToY = (z: number) => z * scale + offsetY;
        mapPath = new Path2D();
        track.samples.forEach((sample, i) => {
          const px = mapToX(sample.x);
          const py = mapToY(sample.z);
          if (i === 0) mapPath!.moveTo(px, py);
          else mapPath!.lineTo(px, py);
        });
        mapPath.closePath();
      }
      const drawMap = () => {
        if (!mapCtx || !mapPath) return;
        mapCtx.clearRect(0, 0, 150, 150);
        mapCtx.lineJoin = 'round';
        mapCtx.strokeStyle = 'rgba(95,242,255,0.18)';
        mapCtx.lineWidth = 7;
        mapCtx.stroke(mapPath);
        mapCtx.strokeStyle = 'rgba(95,242,255,0.75)';
        mapCtx.lineWidth = 2;
        mapCtx.stroke(mapPath);
        for (const rival of rivals) {
          mapCtx.beginPath();
          mapCtx.arc(mapToX(rival.rig.root.position.x), mapToY(rival.rig.root.position.z), 2.6, 0, Math.PI * 2);
          mapCtx.fillStyle = '#ff9db4';
          mapCtx.fill();
        }
        mapCtx.beginPath();
        mapCtx.arc(mapToX(vehicle.x), mapToY(vehicle.z), 3.6, 0, Math.PI * 2);
        mapCtx.fillStyle = '#c6ff4f';
        mapCtx.shadowColor = '#c6ff4f';
        mapCtx.shadowBlur = 8;
        mapCtx.fill();
        mapCtx.shadowBlur = 0;
      };

      const updateHud = (kmh: number, lap: number, position: number, lapTime: number, best: number, nitro: number) => {
        if (speedRef.current) speedRef.current.textContent = String(Math.round(kmh));
        if (lapRef.current) lapRef.current.textContent = `${clamp(lap, 1, LAPS)}/${LAPS}`;
        if (posRef.current) posRef.current.textContent = `${position}/${rivals.length + 1}`;
        if (timeRef.current) timeRef.current.textContent = formatTime(lapTime);
        if (bestRef.current) bestRef.current.textContent = best < Infinity ? formatTime(best) : '--:--.---';
        if (nitroRef.current) nitroRef.current.style.width = `${Math.round(nitro * 100)}%`;
        if (gearRef.current) gearRef.current.textContent = kmh < 1 ? 'N' : `D${Math.min(6, 1 + Math.floor(kmh / 52))}`;
      };

      const finishRace = () => {
        phaseLocal = 'finished';
        const rank = 1 + rivals.filter((rival) => rival.progress > vehicle.progress).length;
        const best = Number.isFinite(bestLap) ? bestLap : raceTime;
        setPhase('finished');
        setResult({ time: raceTime, best, rank, total: rivals.length + 1 });
        client.score(Math.max(0, Math.round((LAPS * 108000 - raceTime * 1000) / 10) + (rivals.length + 1 - rank) * 1200));
        vehicle.boosting = false;
        player.flames.forEach((flame) => flame.setEnabled(false));
      };

      const syncPlayerRig = () => {
        const speedRatio = Math.min(1, Math.abs(vehicle.speed) / MAX_SPEED);
        player.root.position.set(vehicle.x, 0, vehicle.z);
        player.root.rotation.y = vehicle.heading;
        // 右转（steer > 0）时车身向左倾，给过弯一点重量感
        player.root.rotation.z = vehicle.steer * 0.085 * speedRatio;
        player.wheels.forEach((wheel) => {
          wheel.spinner.rotation.x = vehicle.spin;
          if (wheel.front) wheel.pivot.rotation.y = vehicle.steer * 0.42;
        });
        player.flames.forEach((flame) => {
          flame.setEnabled(vehicle.boosting);
          if (vehicle.boosting) flame.scaling.set(1, 0.8 + Math.random() * 0.7, 1);
        });
      };

      const stepRivals = (dt: number) => {
        for (const rival of rivals) {
          const curve = track.curvatureAhead(rival.distance, 60);
          const target = rival.baseSpeed * (1 - clamp(curve * 18, 0, 0.45));
          rival.speed += clamp(target - rival.speed, -34 * dt, 16 * dt);
          rival.distance = (rival.distance + rival.speed * dt) % track.length;
          const previous = rival.previousDistance;
          if (previous > track.length * 0.75 && rival.distance < track.length * 0.25) rival.laps += 1;
          else if (previous < track.length * 0.25 && rival.distance > track.length * 0.75) rival.laps -= 1;
          rival.previousDistance = rival.distance;
          rival.progress = (rival.laps + 1) * track.length + rival.distance - rival.startOffset;

          const pose = track.sampleAt(rival.distance);
          const lane = rival.lane * (0.78 + 0.22 * Math.sin(rival.distance * 0.02 + rival.lane));
          rival.rig.root.position.set(pose.x + pose.nx * lane, 0, pose.z + pose.nz * lane);
          rival.rig.root.rotation.y = headingFromTangent(pose.tx, pose.tz);
          rival.rig.wheels.forEach((wheel) => { wheel.spinner.rotation.x += (rival.speed * dt) / 0.41; });
        }
      };

      const updateCamera = (dt: number) => {
        const speedRatio = Math.min(1, Math.abs(vehicle.speed) / MAX_SPEED);
        const forward = forwardFromHeading(vehicle.heading);
        const back = 8.8 + speedRatio * 2.2;
        const height = 3.6 + speedRatio * 0.6;
        const positionSmooth = 1 - Math.exp(-dt * 7.5);
        cameraBase.x += (vehicle.x - forward.x * back - cameraBase.x) * positionSmooth;
        cameraBase.z += (vehicle.z - forward.z * back - cameraBase.z) * positionSmooth;
        cameraBase.y += (height - cameraBase.y) * positionSmooth;

        const lookSmooth = 1 - Math.exp(-dt * 5.5);
        lookTarget.x += (vehicle.x + forward.x * 11 - lookTarget.x) * lookSmooth;
        lookTarget.z += (vehicle.z + forward.z * 11 - lookTarget.z) * lookSmooth;
        lookTarget.y += (1.45 - lookTarget.y) * lookSmooth;

        const jitter = vehicle.shake * 0.11
          + (vehicle.offroadDepth > 0.2 ? 0.025 * vehicle.offroadDepth : 0)
          + (vehicle.boosting ? 0.012 : 0);
        // 抖动只叠加到渲染位置，不污染平滑基准，避免镜头越抖越偏
        camera.position.set(
          cameraBase.x + (Math.random() - 0.5) * jitter,
          cameraBase.y + (Math.random() - 0.5) * jitter,
          cameraBase.z,
        );
        camera.fov += (0.86 + speedRatio * 0.18 - camera.fov) * (1 - Math.exp(-dt * 4));
        camera.setTarget(lookTarget);
      };

      const step = (dt: number) => {
        if (phaseLocal === 'countdown') {
          countdownRemaining -= dt;
          const shown = Math.ceil(countdownRemaining);
          if (shown > 0 && shown !== lastCountdown) {
            lastCountdown = shown;
            setCountdown(String(shown));
            audio.beep(520, 0.16);
          }
          if (countdownRemaining <= 0) {
            phaseLocal = 'racing';
            setPhase('racing');
            setCountdown('GO');
            audio.beep(940, 0.42);
            goTimer = 0.85;
          }
        } else if (goTimer > 0) {
          goTimer -= dt;
          if (goTimer <= 0) setCountdown('');
        }

        driveInput.throttle = keys.up ? 1 : 0;
        driveInput.brake = keys.down || keys.brake ? 1 : 0;
        driveInput.steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
        driveInput.boost = keys.boost;
        driveInput.active = phaseLocal === 'racing';

        if (phaseLocal === 'racing') {
          raceTime += dt;
          stepVehicle(vehicle, driveInput, track, dt);
          const lap = Math.floor(vehicle.progress / track.length) + 1;
          if (lap > lapShown) {
            lapShown = lap;
            const lapTime = raceTime - lapStart;
            lapStart = raceTime;
            if (lapTime > 1 && lapTime < bestLap) bestLap = lapTime;
            if (vehicle.progress >= LAPS * track.length - 1) finishRace();
            else client.score((lap - 1) * 4000);
          }
          if (phaseLocal === 'racing' && vehicle.progress >= LAPS * track.length) finishRace();
        } else if (phaseLocal === 'finished') {
          // 冲线后忽略操作，靠阻力自然滑停
          stepVehicle(vehicle, IDLE_INPUT, track, dt);
        }

        if (phaseLocal !== 'countdown') stepRivals(dt);
        updateCamera(dt);
      };

      const present = () => {
        syncPlayerRig();
        const position = 1 + rivals.filter((rival) => rival.progress > vehicle.progress).length;
        updateHud(
          Math.abs(vehicle.speed) * 3.6,
          Math.floor(vehicle.progress / track.length) + 1,
          position,
          phaseLocal === 'racing' ? raceTime - lapStart : 0,
          bestLap,
          vehicle.nitro,
        );
        drawMap();
        audio.update(
          Math.min(1, Math.abs(vehicle.speed) / MAX_SPEED),
          phaseLocal === 'racing' && keys.up ? 1 : 0,
          vehicle.boosting,
          vehicle.offroad,
        );
      };

      // 物理走固定步长，手感不再随刷新率 / 掉帧变化；渲染只呈现最新状态
      activeScene.onBeforeRenderObservable.add(() => {
        if (pausedLocal) return;
        accumulator = Math.min(accumulator + Math.min(activeEngine.getDeltaTime(), 100) / 1000, 0.25);
        let steps = 0;
        while (accumulator >= FIXED_DT && steps < 30) {
          step(FIXED_DT);
          accumulator -= FIXED_DT;
          steps++;
        }
        present();
      });

      unsubscribe = client.onCommand((command) => {
        if (command === 'pause') {
          pausedLocal = true;
          accumulator = 0;
          resetKeys();
          audio.setMuted(true);
          setPaused(true);
        }
        if (command === 'resume') {
          pausedLocal = false;
          accumulator = 0;
          audio.setMuted(audioMuted);
          setPaused(false);
        }
        if (command === 'restart') reset();
      });

      activeEngine.runRenderLoop(() => activeScene.render());
      observer = new ResizeObserver(() => activeEngine.resize());
      observer.observe(canvas);

      let announced = false;
      activeScene.onAfterRenderObservable.add(() => {
        if (announced) return;
        announced = true;
        client.ready();
      });

      return () => {
        unsubscribe();
        audio.dispose();
        observer?.disconnect();
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', resetKeys);
        activeEngine.stopRenderLoop();
        activeScene.dispose();
        activeEngine.dispose();
      };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '3D 引擎启动失败，请使用支持 WebGL 的浏览器';
      setError(message);
      client.error(message);
      return () => {
        unsubscribe();
        audio.dispose();
        observer?.disconnect();
        engine?.stopRenderLoop();
        scene?.dispose();
        engine?.dispose();
      };
    }
  }, []);

  return (
    <div className="racer">
      <style>{css}</style>
      <canvas
        ref={canvasRef}
        className="racer-canvas"
        tabIndex={0}
        aria-label="霓虹疾驰 3D 赛车游戏画面"
        onClick={(event) => {
          event.currentTarget.focus();
          audioRef.current();
        }}
      />
      <div className="racer-vignette" />

      <div className="racer-hud">
        <div className="racer-panel racer-top-left">
          <div className="racer-label">圈数 LAP</div>
          <div className="racer-big"><span ref={lapRef}>1/{LAPS}</span></div>
          <div className="racer-sub">名次 <span ref={posRef} className="racer-accent">1/4</span></div>
        </div>

        <div className="racer-panel racer-top-right">
          <div className="racer-label">本圈 LAP TIME</div>
          <div className="racer-time" ref={timeRef}>0:00.000</div>
          <div className="racer-sub">最快 <span ref={bestRef}>--:--.---</span></div>
        </div>

        <div className="racer-bottom-right">
          <div className="racer-speed">
            <span ref={speedRef} className="racer-speed-value">0</span>
            <span className="racer-speed-unit">KM/H</span>
          </div>
          <div className="racer-gear"><span ref={gearRef}>N</span></div>
          <div className="racer-nitro">
            <div className="racer-nitro-label">NITRO</div>
            <div className="racer-nitro-track"><div ref={nitroRef} className="racer-nitro-fill" /></div>
          </div>
        </div>

        <div className="racer-hint">↑↓ 油门 / 刹车 · ←→ 转向 · SHIFT 氮气 · R 重开 · M 静音</div>
        <div className="racer-map"><canvas ref={mapRef} width={150} height={150} /></div>
      </div>

      {countdown && <div className={`racer-countdown${countdown === 'GO' ? ' go' : ''}`}>{countdown}</div>}

      {paused && <div className="racer-overlay"><div className="racer-overlay-card"><h2>已暂停</h2><p>点击继续回到赛道</p></div></div>}

      {phase === 'finished' && result && (
        <div className="racer-overlay">
          <div className="racer-overlay-card racer-result">
            <div className="racer-result-rank">P{result.rank}</div>
            <h2>{result.rank === 1 ? '冲线夺冠' : '完成比赛'}</h2>
            <dl>
              <div><dt>总用时</dt><dd>{formatTime(result.time)}</dd></div>
              <div><dt>最快单圈</dt><dd>{formatTime(result.best)}</dd></div>
              <div><dt>名次</dt><dd>{result.rank} / {result.total}</dd></div>
            </dl>
            <button type="button" onClick={() => restartRef.current()}>再来一局</button>
            <p className="racer-result-tip">或按 R 重新开始</p>
          </div>
        </div>
      )}

      {error && <p role="alert" className="racer-error">{error}</p>}
    </div>
  );
}

const css = `
.racer{position:relative;height:100%;width:100%;overflow:hidden;background:#05060d;color:#eaf4ff;font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;user-select:none}
.racer-canvas{display:block;width:100%;height:100%;outline:none;touch-action:none}
.racer-vignette{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 52%,transparent 45%,rgba(3,4,10,.62) 100%)}
.racer-hud{position:absolute;inset:0;pointer-events:none;font-variant-numeric:tabular-nums}
.racer-panel{position:absolute;top:18px;padding:12px 18px;border:1px solid rgba(95,242,255,.22);background:linear-gradient(160deg,rgba(8,14,26,.82),rgba(8,10,20,.62));backdrop-filter:blur(6px);border-radius:4px;box-shadow:0 0 24px rgba(0,0,0,.45),inset 0 0 20px rgba(95,242,255,.06)}
.racer-top-left{left:18px;min-width:132px;border-left:2px solid #5ff2ff}
.racer-top-right{right:18px;text-align:right;border-right:2px solid #ff3fbe}
.racer-label{font-size:10px;letter-spacing:2.4px;color:#7d93b3;text-transform:uppercase}
.racer-big{font-size:30px;font-weight:600;letter-spacing:1px;line-height:1.15;color:#eaf6ff;text-shadow:0 0 18px rgba(95,242,255,.55)}
.racer-time{font-size:26px;font-weight:600;letter-spacing:1px;color:#eaf6ff;text-shadow:0 0 18px rgba(255,63,190,.45);font-family:'SF Mono',ui-monospace,monospace}
.racer-sub{margin-top:4px;font-size:11px;color:#7d93b3;letter-spacing:1px}
.racer-accent{color:#c6ff4f}
.racer-bottom-right{position:absolute;right:22px;bottom:20px;display:flex;align-items:flex-end;gap:16px}
.racer-speed{display:flex;align-items:baseline;gap:8px;line-height:1}
.racer-speed-value{font-size:64px;font-weight:700;letter-spacing:-2px;color:#fff;text-shadow:0 0 26px rgba(95,242,255,.75),0 0 60px rgba(95,242,255,.35);font-family:'SF Mono',ui-monospace,monospace}
.racer-speed-unit{font-size:12px;letter-spacing:3px;color:#7d93b3;padding-bottom:10px}
.racer-gear{font-size:20px;font-weight:600;color:#c6ff4f;border:1px solid rgba(198,255,79,.35);border-radius:3px;padding:4px 10px;text-shadow:0 0 14px rgba(198,255,79,.6)}
.racer-nitro{width:132px;padding-bottom:6px}
.racer-nitro-label{font-size:9px;letter-spacing:2.6px;color:#7d93b3;margin-bottom:5px}
.racer-nitro-track{height:7px;background:rgba(255,255,255,.09);border-radius:2px;overflow:hidden}
.racer-nitro-fill{height:100%;width:100%;background:linear-gradient(90deg,#5ff2ff,#c6ff4f);box-shadow:0 0 14px rgba(95,242,255,.8)}
.racer-hint{position:absolute;left:22px;bottom:22px;font-size:11px;letter-spacing:1.4px;color:rgba(160,180,210,.65)}
.racer-map{position:absolute;left:20px;bottom:52px;width:150px;height:150px;border:1px solid rgba(95,242,255,.18);border-radius:4px;background:rgba(6,10,20,.55);backdrop-filter:blur(4px);padding:0;opacity:.92}
.racer-map canvas{display:block;width:150px;height:150px}
.racer-countdown{position:absolute;inset:0;display:grid;place-items:center;font-size:min(22vw,180px);font-weight:800;font-style:italic;letter-spacing:4px;color:#fff;text-shadow:0 0 40px rgba(95,242,255,.9),0 0 120px rgba(95,242,255,.45);pointer-events:none;animation:racer-pop .5s ease-out}
.racer-countdown.go{color:#c6ff4f;text-shadow:0 0 40px rgba(198,255,79,.95),0 0 130px rgba(198,255,79,.5)}
@keyframes racer-pop{from{transform:scale(1.6);opacity:0}to{transform:scale(1);opacity:1}}
.racer-overlay{position:absolute;inset:0;display:grid;place-items:center;background:rgba(3,5,12,.72);backdrop-filter:blur(4px);animation:racer-fade .25s ease-out}
@keyframes racer-fade{from{opacity:0}to{opacity:1}}
.racer-overlay-card{min-width:280px;padding:28px 34px;text-align:center;border:1px solid rgba(95,242,255,.28);border-radius:6px;background:linear-gradient(165deg,rgba(10,16,30,.96),rgba(8,10,20,.92));box-shadow:0 0 60px rgba(95,242,255,.12)}
.racer-overlay-card h2{margin:0 0 10px;font-size:24px;letter-spacing:3px;color:#eaf6ff}
.racer-overlay-card p{margin:0;font-size:12px;color:#7d93b3;letter-spacing:1px}
.racer-result-rank{font-size:64px;font-weight:800;font-style:italic;line-height:1;color:#c6ff4f;text-shadow:0 0 40px rgba(198,255,79,.6);margin-bottom:8px}
.racer-result dl{margin:18px 0 22px;display:grid;gap:8px;text-align:left}
.racer-result dl div{display:flex;justify-content:space-between;gap:32px;font-size:13px;border-bottom:1px solid rgba(125,147,179,.16);padding-bottom:6px}
.racer-result dt{color:#7d93b3;letter-spacing:1px}
.racer-result dd{margin:0;color:#eaf6ff;font-family:'SF Mono',ui-monospace,monospace}
.racer-result button{width:100%;padding:11px 18px;font:inherit;font-size:13px;letter-spacing:3px;color:#05060d;background:linear-gradient(90deg,#5ff2ff,#c6ff4f);border:0;border-radius:3px;cursor:pointer;font-weight:700}
.racer-result button:hover{filter:brightness(1.12)}
.racer-result-tip{margin-top:12px!important;font-size:11px!important}
.racer-error{position:absolute;inset:auto 0 50% 0;text-align:center;color:#ff8095}
@media (max-width:760px){.racer-hint{display:none}.racer-speed-value{font-size:44px}}
`;
