import { Color3 } from '@babylonjs/core/Maths/math.color';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import type { Scene } from '@babylonjs/core/scene';

export const ROAD_HALF_WIDTH = 8.6;
export const WALL_GAP = 2.6;
export const WALL_HEIGHT = 1.1;

/** 赛道控制点，闭合 Catmull-Rom 曲线。起点在 (0,0)，切线由前后控制点决定（约偏 +X 30°）。 */
const CONTROL_POINTS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0, 140],
  [58, 212],
  [158, 238],
  [252, 216],
  [306, 150],
  [300, 62],
  [250, 2],
  [272, -80],
  [212, -150],
  [120, -176],
  [30, -164],
  [-48, -120],
  [-90, -50],
  [-70, 18],
];

export interface TrackSample {
  x: number;
  z: number;
  tx: number;
  tz: number;
  nx: number;
  nz: number;
  curvature: number;
  distance: number;
}

export interface TrackQuery {
  index: number;
  lateral: number;
  distance: number;
}

export interface TrackPose {
  x: number;
  z: number;
  tx: number;
  tz: number;
  nx: number;
  nz: number;
  curvature: number;
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Track {
  readonly samples: TrackSample[] = [];
  readonly length: number;

  constructor(points: ReadonlyArray<readonly [number, number]> = CONTROL_POINTS, perSegment = 26) {
    const raw: Array<[number, number]> = [];
    const count = points.length;
    for (let i = 0; i < count; i++) {
      const p0 = points[(i - 1 + count) % count];
      const p1 = points[i];
      const p2 = points[(i + 1) % count];
      const p3 = points[(i + 2) % count];
      for (let k = 0; k < perSegment; k++) {
        const t = k / perSegment;
        raw.push([catmullRom(p0[0], p1[0], p2[0], p3[0], t), catmullRom(p0[1], p1[1], p2[1], p3[1], t)]);
      }
    }

    const n = raw.length;
    let total = 0;
    const tangents: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      const prev = raw[(i - 1 + n) % n];
      const next = raw[(i + 1) % n];
      const dx = next[0] - prev[0];
      const dz = next[1] - prev[1];
      const len = Math.hypot(dx, dz) || 1;
      tangents.push([dx / len, dz / len]);
    }

    for (let i = 0; i < n; i++) {
      const next = raw[(i + 1) % n];
      const step = Math.hypot(next[0] - raw[i][0], next[1] - raw[i][1]);
      const [tx, tz] = tangents[i];
      this.samples.push({ x: raw[i][0], z: raw[i][1], tx, tz, nx: -tz, nz: tx, curvature: 0, distance: total });
      total += step;
    }
    this.length = total;

    // 曲率 = 切线转角 / 弧长，再做一次滑动平均，避免 AI 抖动
    const rawCurve = this.samples.map((sample, i) => {
      const next = this.samples[(i + 1) % n];
      const step = (next.distance - sample.distance + this.length) % this.length || 1;
      const dot = Math.min(1, Math.max(-1, sample.tx * next.tx + sample.tz * next.tz));
      return Math.acos(dot) / step;
    });
    for (let i = 0; i < n; i++) {
      let sum = 0;
      let weight = 0;
      for (let k = -9; k <= 9; k++) {
        const w = 1 - Math.abs(k) / 10;
        sum += rawCurve[(i + k + n) % n] * w;
        weight += w;
      }
      this.samples[i].curvature = sum / weight;
    }
  }

  /** 在中心线附近查找最近点；hint 为上一帧索引，可大幅减少遍历量。 */
  nearest(x: number, z: number, hint = -1): TrackQuery {
    const n = this.samples.length;
    let best = 0;
    let bestDistance = Infinity;
    const from = hint < 0 ? 0 : hint - 30;
    const to = hint < 0 ? n - 1 : hint + 30;
    for (let k = from; k <= to; k++) {
      const index = ((k % n) + n) % n;
      const sample = this.samples[index];
      const dx = x - sample.x;
      const dz = z - sample.z;
      const dist = dx * dx + dz * dz;
      if (dist < bestDistance) {
        bestDistance = dist;
        best = index;
      }
    }
    const sample = this.samples[best];
    const dx = x - sample.x;
    const dz = z - sample.z;
    const along = dx * sample.tx + dz * sample.tz;
    const lateral = dx * sample.nx + dz * sample.nz;
    return { index: best, lateral, distance: (sample.distance + along + this.length) % this.length };
  }

  sampleAt(distance: number): TrackPose {
    const n = this.samples.length;
    const target = ((distance % this.length) + this.length) % this.length;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.samples[mid].distance <= target) lo = mid;
      else hi = mid - 1;
    }
    const a = this.samples[lo];
    const b = this.samples[(lo + 1) % n];
    const span = (b.distance - a.distance + this.length) % this.length || 1;
    const t = Math.min(1, Math.max(0, (target - a.distance) / span));
    const tx = a.tx + (b.tx - a.tx) * t;
    const tz = a.tz + (b.tz - a.tz) * t;
    const len = Math.hypot(tx, tz) || 1;
    return {
      x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t,
      tx: tx / len,
      tz: tz / len,
      nx: -tz / len,
      nz: tx / len,
      curvature: a.curvature + (b.curvature - a.curvature) * t,
    };
  }

  /** 前进方向上的最大曲率，用于 AI 预判弯道。 */
  curvatureAhead(distance: number, lookahead = 45) {
    let peak = 0;
    for (let d = 0; d <= lookahead; d += lookahead / 3) peak = Math.max(peak, this.sampleAt(distance + d).curvature);
    return peak;
  }
}

/** 沿中心线生成带状网格（左右偏移 + 高度）。 */
function ribbonData(track: Track, inner: number, outer: number, y: number, vScale: number) {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const samples = track.samples;
  const n = samples.length;
  for (let i = 0; i <= n; i++) {
    const sample = samples[i % n];
    positions.push(sample.x + sample.nx * inner, y, sample.z + sample.nz * inner);
    positions.push(sample.x + sample.nx * outer, y, sample.z + sample.nz * outer);
    normals.push(0, 1, 0, 0, 1, 0);
    const v = sample.distance / vScale;
    uvs.push(0, v, 1, v);
    if (i < n) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.uvs = uvs;
  data.indices = indices;
  return data;
}

/** 竖直护墙：沿偏移量拉出一圈围栏。 */
function wallData(track: Track, offset: number) {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const samples = track.samples;
  const n = samples.length;
  for (let i = 0; i <= n; i++) {
    const sample = samples[i % n];
    const x = sample.x + sample.nx * offset;
    const z = sample.z + sample.nz * offset;
    positions.push(x, 0, z, x, WALL_HEIGHT, z);
    const side = offset > 0 ? 1 : -1;
    normals.push(sample.nx * side, 0, sample.nz * side, sample.nx * side, 0, sample.nz * side);
    if (i < n) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.indices = indices;
  return data;
}

/** 中心虚线：每隔一段放一块小方片，合并成一个网格。 */
function dashData(track: Track, gap: number, dash: number, width: number, y: number) {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let cursor = 0;
  let quad = 0;
  const half = width / 2;
  while (cursor < track.length) {
    const a = track.sampleAt(cursor);
    const b = track.sampleAt(cursor + dash);
    const points: Array<[number, number]> = [
      [a.x - a.nx * half, a.z - a.nz * half],
      [a.x + a.nx * half, a.z + a.nz * half],
      [b.x + b.nx * half, b.z + b.nz * half],
      [b.x - b.nx * half, b.z - b.nz * half],
    ];
    for (const [x, z] of points) {
      positions.push(x, y, z);
      normals.push(0, 1, 0);
    }
    const base = quad * 4;
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    quad++;
    cursor += gap;
  }
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.indices = indices;
  return data;
}

function makeMaterial(scene: Scene, name: string, diffuse: string, emissive: string, emissiveIntensity = 1) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.FromHexString(diffuse);
  material.emissiveColor = Color3.FromHexString(emissive).scale(emissiveIntensity);
  material.specularColor = Color3.Black();
  material.backFaceCulling = false;
  return material;
}

function asphaltTexture(scene: Scene) {
  const texture = new DynamicTexture('asphalt', { width: 128, height: 128 }, scene, false);
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = '#181c27';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2600; i++) {
    const g = 20 + ((Math.random() * 30) | 0);
    ctx.fillStyle = `rgb(${g},${g + 3},${g + 12})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  texture.update();
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.uScale = 2;
  return texture;
}

function checkerTexture(scene: Scene) {
  const texture = new DynamicTexture('checker', { width: 256, height: 64 }, scene, false);
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  const cell = 32;
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 8; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#cfd7e6' : '#101420';
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  texture.update();
  return texture;
}

function windowTexture(scene: Scene, tint: string, seed: number) {
  const random = mulberry32(seed);
  const texture = new DynamicTexture(`windows-${seed}`, { width: 64, height: 128 }, scene, false);
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = '#05060c';
  ctx.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 124; y += 8) {
    for (let x = 4; x < 60; x += 8) {
      if (random() > 0.55) continue;
      ctx.fillStyle = random() > 0.78 ? tint : 'rgba(150,185,235,0.75)';
      ctx.fillRect(x, y, 4, 4);
    }
  }
  texture.update();
  return texture;
}

export interface World {
  startPose: TrackPose;
  sky: Mesh;
}

/** 夜空穹顶：地平线泛紫、天顶深蓝，外加星点。 */
function buildSky(scene: Scene) {
  const texture = new DynamicTexture('sky-texture', { width: 128, height: 512 }, scene, true);
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  const gradient = ctx.createLinearGradient(0, 512, 0, 0);
  gradient.addColorStop(0, '#0b1024');
  gradient.addColorStop(0.4, '#232f66');
  gradient.addColorStop(0.5, '#1b2450');
  gradient.addColorStop(0.72, '#0a0f24');
  gradient.addColorStop(1, '#04060e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 512);
  const random = mulberry32(77);
  for (let i = 0; i < 220; i++) {
    const y = 10 + random() * 220;
    const alpha = 0.25 + random() * 0.7;
    ctx.fillStyle = `rgba(210,228,255,${alpha.toFixed(2)})`;
    ctx.fillRect(random() * 128, y, random() > 0.9 ? 2 : 1, random() > 0.9 ? 2 : 1);
  }
  texture.update();

  const material = new StandardMaterial('sky-material', scene);
  material.emissiveTexture = texture;
  material.emissiveColor = Color3.Black();
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.fogEnabled = false;

  const sky = CreateSphere('sky', { diameter: 3600, segments: 16, sideOrientation: Mesh.BACKSIDE }, scene);
  sky.material = material;
  sky.infiniteDistance = true;
  sky.isPickable = false;
  return sky;
}

export function buildWorld(scene: Scene, track: Track): World {
  const roadMaterial = new StandardMaterial('road-material', scene);
  roadMaterial.diffuseColor = new Color3(1, 1, 1);
  roadMaterial.diffuseTexture = asphaltTexture(scene);
  roadMaterial.specularColor = new Color3(0.12, 0.14, 0.2);
  roadMaterial.specularPower = 64;
  roadMaterial.emissiveColor = new Color3(0.02, 0.025, 0.04);
  roadMaterial.backFaceCulling = false;

  const road = new Mesh('road', scene);
  road.material = roadMaterial;
  ribbonData(track, -ROAD_HALF_WIDTH, ROAD_HALF_WIDTH, 0, 11).applyToMesh(road);
  road.isPickable = false;

  const edgeMaterial = makeMaterial(scene, 'edge-neon', '#1b3a44', '#54e9ff', 0.78);
  for (const side of [-1, 1]) {
    const edge = new Mesh(`edge-${side}`, scene);
    edge.material = edgeMaterial;
    ribbonData(track, side * (ROAD_HALF_WIDTH - 0.85), side * (ROAD_HALF_WIDTH - 0.3), 0.02, 8).applyToMesh(edge);
    edge.isPickable = false;
  }

  const dashMaterial = makeMaterial(scene, 'dash', '#3a4152', '#8ea6c8', 0.6);
  const dashes = new Mesh('dashes', scene);
  dashes.material = dashMaterial;
  dashData(track, 17, 7.5, 0.36, 0.03).applyToMesh(dashes);
  dashes.isPickable = false;

  // 护墙：左粉右青，方便判断内外侧
  const wallMaterials = [
    makeMaterial(scene, 'wall-left', '#151024', '#ff3fbe', 0.5),
    makeMaterial(scene, 'wall-right', '#0f1a24', '#5ff2ff', 0.5),
  ];
  const capMaterials = [
    makeMaterial(scene, 'cap-left', '#2a0f22', '#ff3fbe', 1.35),
    makeMaterial(scene, 'cap-right', '#0b2530', '#5ff2ff', 1.35),
  ];

  [-1, 1].forEach((side, i) => {
    const offset = side * (ROAD_HALF_WIDTH + WALL_GAP);
    const wall = new Mesh(`wall-${side}`, scene);
    wall.material = wallMaterials[i];
    wallData(track, offset).applyToMesh(wall);
    wall.isPickable = false;

    const cap = new Mesh(`cap-${side}`, scene);
    cap.material = capMaterials[i];
    ribbonData(track, offset - 0.16, offset + 0.16, WALL_HEIGHT, 6).applyToMesh(cap);
    cap.isPickable = false;
  });

  // 起跑线 + 发车门
  const startPose = track.sampleAt(0);
  const startLineMaterial = new StandardMaterial('start-line', scene);
  startLineMaterial.diffuseTexture = checkerTexture(scene);
  startLineMaterial.emissiveColor = new Color3(0.1, 0.11, 0.15);
  startLineMaterial.specularColor = Color3.Black();
  startLineMaterial.backFaceCulling = false;

  const lineHalf = 2.4;
  const a = track.sampleAt(-lineHalf);
  const b = track.sampleAt(lineHalf);
  const lineData = new VertexData();
  lineData.positions = [
    a.x - a.nx * ROAD_HALF_WIDTH, 0.035, a.z - a.nz * ROAD_HALF_WIDTH,
    a.x + a.nx * ROAD_HALF_WIDTH, 0.035, a.z + a.nz * ROAD_HALF_WIDTH,
    b.x - b.nx * ROAD_HALF_WIDTH, 0.035, b.z - b.nz * ROAD_HALF_WIDTH,
    b.x + b.nx * ROAD_HALF_WIDTH, 0.035, b.z + b.nz * ROAD_HALF_WIDTH,
  ];
  lineData.uvs = [0, 0, 0, 1, 1, 0, 1, 1];
  lineData.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
  lineData.indices = [0, 1, 2, 1, 3, 2];
  const startLine = new Mesh('start-line', scene);
  startLine.material = startLineMaterial;
  lineData.applyToMesh(startLine);
  startLine.isPickable = false;

  const gateMaterial = makeMaterial(scene, 'gate', '#12172a', '#2a3350', 0.6);
  const gateNeon = makeMaterial(scene, 'gate-neon', '#0a2a33', '#6ff8ff', 0.9);
  const heading = Math.atan2(startPose.tx, startPose.tz);
  const gateParts: Mesh[] = [];
  for (const side of [-1, 1]) {
    const px = startPose.x + startPose.nx * side * (ROAD_HALF_WIDTH + 3.4);
    const pz = startPose.z + startPose.nz * side * (ROAD_HALF_WIDTH + 3.4);
    const pillar = CreateBox('gate-pillar', { width: 1.1, height: 11.4, depth: 1.1 }, scene);
    pillar.material = gateMaterial;
    pillar.position.set(px, 5.7, pz);
    pillar.rotation.y = heading;
    pillar.isPickable = false;
    gateParts.push(pillar);

    const strip = CreateBox('gate-strip', { width: 0.26, height: 10.6, depth: 1.16 }, scene);
    strip.material = gateNeon;
    strip.position.set(px, 5.9, pz);
    strip.rotation.y = heading;
    strip.isPickable = false;
    gateParts.push(strip);
  }
  const beamWidth = (ROAD_HALF_WIDTH + 3.4) * 2 + 1.1;
  const beam = CreateBox('gate-beam', { width: beamWidth, height: 1.6, depth: 1.4 }, scene);
  beam.material = gateMaterial;
  beam.position.set(startPose.x, 12.2, startPose.z);
  beam.rotation.y = heading;
  beam.isPickable = false;
  gateParts.push(beam);

  const beamStrip = CreateBox('gate-beam-strip', { width: beamWidth + 0.1, height: 0.16, depth: 1.46 }, scene);
  beamStrip.material = gateNeon;
  beamStrip.position.set(startPose.x, 11.34, startPose.z);
  beamStrip.rotation.y = heading;
  beamStrip.isPickable = false;
  gateParts.push(beamStrip);

  buildCity(scene, track);
  const sky = buildSky(scene);
  return { startPose, sky };
}

function mergeInto(scene: Scene, name: string, material: StandardMaterial, parts: Mesh[]) {
  if (!parts.length) return;
  const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, false);
  if (!merged) return;
  merged.name = name;
  merged.material = material;
  merged.isPickable = false;
  scene.addMesh(merged);
}

function buildCity(scene: Scene, track: Track) {
  const random = mulberry32(20261114);
  const coarse = track.samples.filter((_, i) => i % 10 === 0);

  const towerMaterials = ['#ff3fbe', '#5ff2ff', '#c6ff4f', '#ffb347'].map((tint, i) => {
    const material = new StandardMaterial(`tower-${i}`, scene);
    material.diffuseColor = new Color3(0.02, 0.025, 0.05);
    material.emissiveTexture = windowTexture(scene, tint, 17 + i * 31);
    material.emissiveColor = new Color3(0.05, 0.06, 0.1);
    material.specularColor = Color3.Black();
    return material;
  });

  const buckets: Mesh[][] = towerMaterials.map(() => []);
  let placed = 0;
  let attempts = 0;
  while (placed < 220 && attempts < 1400) {
    attempts++;
    const angle = random() * Math.PI * 2;
    const radius = 200 + random() * 430;
    const x = Math.cos(angle) * radius + 95;
    const z = Math.sin(angle) * radius + 25;
    let clearance = Infinity;
    for (const sample of coarse) clearance = Math.min(clearance, Math.hypot(sample.x - x, sample.z - z));
    if (clearance < 72) continue;
    const height = 26 + random() * 118;
    const width = 13 + random() * 15;
    const bucket = (random() * buckets.length) | 0;
    const tower = CreateBox('tower', { width, height, depth: width * (0.7 + random() * 0.6) }, scene);
    tower.position.set(x, height / 2 - 1, z);
    tower.rotation.y = random() * Math.PI;
    tower.material = towerMaterials[bucket];
    tower.isPickable = false;
    buckets[bucket].push(tower);
    placed++;
  }
  buckets.forEach((parts, i) => mergeInto(scene, `towers-${i}`, towerMaterials[i], parts));

  // 路灯：交替颜色的立柱，提供速度参照
  const poleMaterial = makeMaterial(scene, 'pole', '#0d1220', '#243656', 0.5);
  const lampCyan = makeMaterial(scene, 'lamp-cyan', '#0a2a33', '#5ff2ff', 1.5);
  const lampPink = makeMaterial(scene, 'lamp-pink', '#2a0f22', '#ff3fbe', 1.5);
  const poles: Mesh[] = [];
  const lampsCyan: Mesh[] = [];
  const lampsPink: Mesh[] = [];
  let index = 0;
  for (let d = 0; d < track.length; d += 34) {
    for (const side of [-1, 1]) {
      const pose = track.sampleAt(d);
      const offset = side * (ROAD_HALF_WIDTH + WALL_GAP + 2.4);
      const x = pose.x + pose.nx * offset;
      const z = pose.z + pose.nz * offset;
      const pole = CreateBox('pole', { width: 0.34, height: 5.4, depth: 0.34 }, scene);
      pole.position.set(x, 2.7, z);
      pole.material = poleMaterial;
      pole.isPickable = false;
      poles.push(pole);
      const lamp = CreateBox('lamp', { width: 0.62, height: 0.9, depth: 0.62 }, scene);
      lamp.position.set(x, 5.6, z);
      lamp.material = index % 2 === 0 ? lampCyan : lampPink;
      lamp.isPickable = false;
      (index % 2 === 0 ? lampsCyan : lampsPink).push(lamp);
      index++;
    }
  }
  mergeInto(scene, 'poles', poleMaterial, poles);
  mergeInto(scene, 'lamps-cyan', lampCyan, lampsCyan);
  mergeInto(scene, 'lamps-pink', lampPink, lampsPink);

  // 地面：深色网格，作为赛道的底衬
  const groundMaterial = new StandardMaterial('ground', scene);
  groundMaterial.diffuseColor = new Color3(0.03, 0.04, 0.06);
  groundMaterial.emissiveColor = new Color3(0.04, 0.05, 0.09);
  groundMaterial.specularColor = Color3.Black();
  const groundTexture = new DynamicTexture('ground-grid', { width: 256, height: 256 }, scene, false);
  const ctx = groundTexture.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = '#05070d';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(70,110,175,0.75)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(60,90,140,0.22)';
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 64, 0);
    ctx.lineTo(i * 64, 256);
    ctx.moveTo(0, i * 64);
    ctx.lineTo(256, i * 64);
    ctx.stroke();
  }
  groundTexture.update();
  groundTexture.wrapU = Texture.WRAP_ADDRESSMODE;
  groundTexture.wrapV = Texture.WRAP_ADDRESSMODE;
  groundTexture.uScale = 40;
  groundTexture.vScale = 40;
  groundMaterial.emissiveTexture = groundTexture;
  groundMaterial.diffuseTexture = groundTexture;

  const ground = CreateBox('ground', { width: 2400, height: 0.4, depth: 2400 }, scene);
  ground.material = groundMaterial;
  ground.position.set(90, -0.26, 30);
  ground.isPickable = false;
}
