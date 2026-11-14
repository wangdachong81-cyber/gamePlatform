import { useEffect, useRef, useState } from 'react';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreatePolyhedron } from '@babylonjs/core/Meshes/Builders/polyhedronBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';
import { createGameClient } from '@youxi/game-sdk';

export default function CrystalWorld() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    const client = createGameClient('crystal-world');
    let engine: Engine | undefined;
    let scene: Scene | undefined;
    let observer: ResizeObserver | undefined;
    let unsubscribe = () => {};
    let paused = false;
    let total = 0;
    try {
      engine = new Engine(canvas.current!, true, { preserveDrawingBuffer: false, stencil: true });
      const activeEngine = engine;
      scene = new Scene(engine);
      const activeScene = scene;
      scene.clearColor = new Color4(.055, .06, .11, 1);
      const camera = new ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 3, 10, new Vector3(0, .7, 0), scene);
      camera.attachControl(canvas.current!, true); camera.lowerRadiusLimit = 6; camera.upperRadiusLimit = 16;
      new HemisphericLight('sky', new Vector3(.4, 1, -.3), scene).intensity = 1.15;
      const material = new StandardMaterial('crystal-material', scene);
      material.diffuseColor = Color3.FromHexString('#bca3ff');
      material.emissiveColor = Color3.FromHexString('#271d44');
      material.specularColor = new Color3(.8, .8, 1);
      const platformMaterial = new StandardMaterial('platform-material', scene);
      platformMaterial.diffuseColor = Color3.FromHexString('#30394e');
      const ringMaterial = new StandardMaterial('ring-material', scene);
      ringMaterial.diffuseColor = Color3.FromHexString('#74ddeb'); ringMaterial.emissiveColor = Color3.FromHexString('#164a52');
      const platform = CreateCylinder('island', { height: .5, diameterTop: 6, diameterBottom: 4.8, tessellation: 6 }, scene);
      platform.material = platformMaterial; platform.position.y = -.7; platform.isPickable = false;
      const ring = CreateTorus('orbit', { diameter: 5, thickness: .035, tessellation: 64 }, scene);
      ring.material = ringMaterial; ring.position.y = .4; ring.rotation.z = .22; ring.isPickable = false;
      const crystals = Array.from({ length: 5 }, (_, i) => {
        const crystal = CreatePolyhedron(`crystal-${i}`, { type: 1, size: .55 }, activeScene);
        crystal.material = material;
        crystal.position.set(Math.cos(i / 5 * Math.PI * 2) * 1.9, .6, Math.sin(i / 5 * Math.PI * 2) * 1.9);
        crystal.scaling.y = 1.6;
        return crystal;
      });
      let elapsed = 0;
      scene.onBeforeRenderObservable.add(() => {
        if (paused) return;
        const delta = Math.min(activeEngine.getDeltaTime(), 50) / 1000; elapsed += delta;
        crystals.forEach((crystal, i) => { crystal.rotation.y += delta * .65; crystal.position.y = .7 + Math.sin(elapsed * 1.5 + i) * .22; });
        ring.rotation.y += delta * .15;
      });
      scene.onPointerObservable.add(event => {
        if (paused || event.type !== PointerEventTypes.POINTERPICK || !event.pickInfo?.pickedMesh) return;
        const crystal = crystals.find(item => item === event.pickInfo!.pickedMesh);
        if (!crystal) return;
        total += 10; setScore(total); client.score(total);
        const angle = Math.random() * Math.PI * 2;
        crystal.position.x = Math.cos(angle) * (1.2 + Math.random());
        crystal.position.z = Math.sin(angle) * (1.2 + Math.random());
      });
      unsubscribe = client.onCommand(command => {
        if (command === 'pause') { paused = true; camera.detachControl(); }
        if (command === 'resume') { paused = false; camera.attachControl(canvas.current!, true); }
        if (command === 'restart') {
          total = 0; elapsed = 0; paused = false; setScore(0); client.score(0);
          camera.alpha = -Math.PI / 2; camera.beta = Math.PI / 3; camera.radius = 10; camera.attachControl(canvas.current!, true);
          crystals.forEach((crystal, i) => { crystal.position.set(Math.cos(i / 5 * Math.PI * 2) * 1.9, .6, Math.sin(i / 5 * Math.PI * 2) * 1.9); crystal.rotation.setAll(0); });
        }
      });
      engine.runRenderLoop(() => activeScene.render());
      observer = new ResizeObserver(() => activeEngine.resize()); observer.observe(canvas.current!);
      scene.executeWhenReady(() => client.ready());
    } catch (cause) { const message = cause instanceof Error ? cause.message : '3D 引擎启动失败，请使用支持 WebGL 的浏览器'; setError(message); client.error(message); }
    return () => { unsubscribe(); observer?.disconnect(); engine?.stopRenderLoop(); scene?.dispose(); engine?.dispose(); };
  }, []);
  return <div className="game-shell dimension-3d"><header className="game-hud"><span>◇ 浮空晶境 <small>BABYLON.JS / 3D</small></span><strong>{score} 能量</strong></header>{error ? <p role="alert">{error}</p> : <canvas ref={canvas} className="babylon-canvas" aria-label="3D 水晶游戏：点击水晶收集能量"/>}<footer className="game-instructions">拖动旋转视角 · 滚轮缩放 · 点击水晶收集能量</footer></div>;
}
