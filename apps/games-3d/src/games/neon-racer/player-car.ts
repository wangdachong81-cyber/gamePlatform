import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import type { Scene } from '@babylonjs/core/scene';
import type { CarRig, Wheel } from './car';

/**
 * 玩家专属赛车：纯程序化网格，不依赖任何外部资产或 loader。
 *
 * 沿用的硬契约（改动前先确认 physics.ts / index.tsx）：
 *   - 车头朝本地 +Z，root.rotation.y = heading 时前向量 (sin h, cos h)
 *   - 原点落在地面中心，车身长 4.4m、宽约 1.94m
 *   - 轮心 (±0.94, 0.42, +1.42 / -1.38)，轮半径 0.41（spin 用 speed*dt/0.41）
 *   - 轮轴沿 X：spinner.rotation.x 滚动，前轮 pivot.rotation.y 转向
 *   - CarRig 的 root / wheels / flames / glow / body 五个字段一个都不能少
 *
 * 造型做法：沿 Z 放样一组六边形截面（loft），每个三角形单独写解析法线，
 * 避免共享顶点把硬表面棱角抹圆。车身、玻璃罩、车门、发光描边按材质分组
 * 各自合并成一个网格，整车只产生十几个 mesh。
 */

const AXIS_Y = 0.65;
const WHEEL_X = 0.94;
const WHEEL_Y = 0.42;
const FRONT_Z = 1.42;
const REAR_Z = -1.38;

interface Section {
  z: number;
  /** 侧面半宽 */
  w: number;
  /** 顶面半宽 */
  wTop: number;
  yBottom: number;
  /** 腰线（侧面与肩部斜面的转折） */
  yShoulder: number;
  yTop: number;
}

/** 车尾 -Z → 车头 +Z。座舱隆起、前后轮拱外扩、车鼻收窄压低。 */
const BODY: readonly Section[] = [
  { z: -2.20, w: 0.86, wTop: 0.70, yBottom: 0.26, yShoulder: 0.72, yTop: 0.90 },
  { z: -2.05, w: 0.96, wTop: 0.82, yBottom: 0.26, yShoulder: 0.76, yTop: 0.98 },
  { z: -1.75, w: 0.99, wTop: 0.84, yBottom: 0.26, yShoulder: 0.80, yTop: 1.04 },
  { z: -1.38, w: 1.00, wTop: 0.82, yBottom: 0.26, yShoulder: 0.82, yTop: 1.06 },
  { z: -1.00, w: 0.96, wTop: 0.78, yBottom: 0.28, yShoulder: 0.82, yTop: 1.12 },
  { z: -0.55, w: 0.92, wTop: 0.70, yBottom: 0.30, yShoulder: 0.84, yTop: 1.30 },
  { z: 0.00, w: 0.90, wTop: 0.68, yBottom: 0.30, yShoulder: 0.84, yTop: 1.30 },
  { z: 0.55, w: 0.88, wTop: 0.66, yBottom: 0.30, yShoulder: 0.82, yTop: 1.22 },
  { z: 0.95, w: 0.90, wTop: 0.64, yBottom: 0.28, yShoulder: 0.76, yTop: 1.02 },
  { z: 1.42, w: 0.96, wTop: 0.60, yBottom: 0.26, yShoulder: 0.72, yTop: 0.94 },
  { z: 1.75, w: 0.92, wTop: 0.56, yBottom: 0.26, yShoulder: 0.68, yTop: 0.88 },
  { z: 2.05, w: 0.80, wTop: 0.50, yBottom: 0.28, yShoulder: 0.62, yTop: 0.80 },
  { z: 2.20, w: 0.70, wTop: 0.44, yBottom: 0.30, yShoulder: 0.56, yTop: 0.74 },
];

/** 座舱罩截面：与 BODY 对应区间一致，向前一直斜到引擎盖形成全景风挡。 */
const CANOPY: readonly Section[] = [
  { z: -0.68, w: 0.925, wTop: 0.715, yBottom: 0.30, yShoulder: 0.835, yTop: 1.275 },
  { z: -0.55, w: 0.920, wTop: 0.700, yBottom: 0.30, yShoulder: 0.840, yTop: 1.300 },
  { z: 0.00, w: 0.900, wTop: 0.680, yBottom: 0.30, yShoulder: 0.840, yTop: 1.300 },
  { z: 0.55, w: 0.880, wTop: 0.660, yBottom: 0.30, yShoulder: 0.820, yTop: 1.220 },
  { z: 0.95, w: 0.900, wTop: 0.640, yBottom: 0.28, yShoulder: 0.760, yTop: 1.020 },
];

type SectionKey = 'w' | 'wTop' | 'yBottom' | 'yShoulder' | 'yTop';

function sectionValueAt(z: number, key: SectionKey) {
  for (let i = 0; i < BODY.length - 1; i++) {
    const a = BODY[i];
    const b = BODY[i + 1];
    if (z >= a.z && z <= b.z) {
      const t = (z - a.z) / (b.z - a.z || 1);
      return a[key] + (b[key] - a[key]) * t;
    }
  }
  return z < BODY[0].z ? BODY[0][key] : BODY[BODY.length - 1][key];
}

const bodyWidthAt = (z: number) => sectionValueAt(z, 'w');

/**
 * 车身在某个 (z, y) 处的实际表面半宽：腰线以下是垂直侧面，
 * 腰线以上沿肩斜面收向顶面。发光描边必须贴这条曲面，
 * 否则车鼻/座舱收窄后从斜角看会变成悬空的圆环。
 */
function bodySurfaceXAt(z: number, y: number) {
  const width = sectionValueAt(z, 'w');
  const shoulder = sectionValueAt(z, 'yShoulder');
  if (y <= shoulder) return width;
  const top = sectionValueAt(z, 'yTop');
  const t = Math.min(1, Math.max(0, (y - shoulder) / (top - shoulder || 1)));
  return width + (sectionValueAt(z, 'wTop') - width) * t;
}

/** 同材质的一组三角面，最后合成单个网格。法线强制朝外，绕序不参与判断。 */
class Surface {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private readonly indices: number[] = [];

  tri(a: Vector3, b: Vector3, c: Vector3, facing?: Vector3) {
    const normal = Vector3.Cross(b.subtract(a), c.subtract(a));
    if (normal.lengthSquared() < 1e-10) return;
    normal.normalize();
    const reference = facing ?? new Vector3((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3 - AXIS_Y, 0);
    if (Vector3.Dot(normal, reference) < 0) normal.scaleInPlace(-1);
    const base = this.positions.length / 3;
    for (const v of [a, b, c]) {
      this.positions.push(v.x, v.y, v.z);
      this.normals.push(normal.x, normal.y, normal.z);
      this.uvs.push(v.x * 0.5 + 0.5, v.z * 0.23 + 0.5);
    }
    this.indices.push(base, base + 1, base + 2);
  }

  quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, facing?: Vector3) {
    this.tri(a, b, c, facing);
    this.tri(a, c, d, facing);
  }

  build(scene: Scene, name: string, material: StandardMaterial, parent: TransformNode): Mesh {
    const mesh = new Mesh(name, scene);
    const data = new VertexData();
    data.positions = this.positions;
    data.normals = this.normals;
    data.uvs = this.uvs;
    data.indices = this.indices;
    data.applyToMesh(mesh);
    mesh.material = material;
    mesh.parent = parent;
    mesh.isPickable = false;
    return mesh;
  }
}

/** 截面环：右下 → 右腰 → 右上 → 左上 → 左腰 → 左下。edge 1/2/3 是肩斜面与顶面。 */
function ringAt(section: Section, expand = 0): Vector3[] {
  const w = section.w + expand;
  const wTop = section.wTop + expand;
  const yBottom = section.yBottom;
  const yShoulder = section.yShoulder + expand * 0.45;
  const yTop = section.yTop + expand;
  return [
    new Vector3(w, yBottom, section.z),
    new Vector3(w, yShoulder, section.z),
    new Vector3(wTop, yTop, section.z),
    new Vector3(-wTop, yTop, section.z),
    new Vector3(-w, yShoulder, section.z),
    new Vector3(-w, yBottom, section.z),
  ];
}

function loftInto(surface: Surface, sections: readonly Section[], edges: readonly number[], expand: number, capEnds: boolean) {
  const rings = sections.map((section) => ringAt(section, expand));
  for (let i = 0; i < rings.length - 1; i++) {
    for (const edge of edges) {
      const next = (edge + 1) % 6;
      surface.quad(rings[i][edge], rings[i][next], rings[i + 1][next], rings[i + 1][edge]);
    }
  }
  if (!capEnds) return;
  const caps: Array<{ ring: Vector3[]; sign: number }> = [
    { ring: rings[0], sign: -1 },
    { ring: rings[rings.length - 1], sign: 1 },
  ];
  for (const cap of caps) {
    const center = new Vector3(0, AXIS_Y, cap.ring[0].z);
    const facing = new Vector3(0, 0, cap.sign);
    for (let j = 0; j < 6; j++) surface.tri(center, cap.ring[j], cap.ring[(j + 1) % 6], facing);
  }
}

interface PanelSpec {
  z0: number;
  z1: number;
  y0: number;
  y1: number;
  /** 四周内缩，用来做门缝 */
  inset: number;
  /** 相对车身侧面的外凸量 */
  lift: number;
}

/** 贴合 loft 侧面的曲面带：车门板、门缝框、侧裙都用它生成。 */
function sidePanel(surface: Surface, side: 1 | -1, spec: PanelSpec) {
  const segments = 10;
  const facing = new Vector3(side, 0, 0);
  const bottom: Vector3[] = [];
  const top: Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const z = spec.z0 + (spec.z1 - spec.z0) * (i / segments);
    const x = side * (bodyWidthAt(z) + spec.lift);
    bottom.push(new Vector3(x, spec.y0 + spec.inset, z));
    top.push(new Vector3(x, spec.y1 - spec.inset, z));
  }
  for (let i = 0; i < segments; i++) {
    surface.quad(bottom[i], bottom[i + 1], top[i + 1], top[i], facing);
  }
}

/** 车门上的斜向特征线，从前下扫到后上。 */
function doorCrease(surface: Surface, side: 1 | -1) {
  const segments = 12;
  const facing = new Vector3(side, 0, 0);
  const z0 = 0.62;
  const z1 = -0.74;
  const y0 = 0.49;
  const y1 = 0.74;
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const za = z0 + (z1 - z0) * t0;
    const zb = z0 + (z1 - z0) * t1;
    const ya = y0 + (y1 - y0) * t0;
    const yb = y0 + (y1 - y0) * t1;
    const x = side * (bodyWidthAt((za + zb) / 2) + 0.032);
    surface.quad(
      new Vector3(x, ya, za),
      new Vector3(x, yb, zb),
      new Vector3(x, yb + 0.018, zb),
      new Vector3(x, ya + 0.018, za),
      facing,
    );
  }
}

/** 轮拱上半圈的发光轮眉，宽度方向贴齐轮胎外沿。 */
function wheelArch(surface: Surface, side: 1 | -1, wheelZ: number) {
  const segments = 16;
  const radius = 0.45;
  const thickness = 0.065;
  const facing = new Vector3(side, 0, 0);
  // x/y 都取车身实际曲面，弧才不会在斜视角下浮到车外
  const point = (angle: number, r: number) => {
    const z = wheelZ + Math.cos(angle) * r;
    const y = WHEEL_Y + Math.sin(angle) * r;
    return new Vector3(side * (bodySurfaceXAt(z, y) + 0.028), y, z);
  };
  for (let i = 0; i < segments; i++) {
    const a0 = (Math.PI * i) / segments;
    const a1 = (Math.PI * (i + 1)) / segments;
    surface.quad(
      point(a0, radius),
      point(a1, radius),
      point(a1, radius + thickness),
      point(a0, radius + thickness),
      facing,
    );
  }
}

/** 沿车顶中线的发光条，跟随 yTop 起伏。 */
function roofStripe(surface: Surface) {
  const segments = 16;
  const facing = new Vector3(0, 1, 0);
  for (let i = 0; i < segments; i++) {
    const za = -1.05 + (2.45 * i) / segments;
    const zb = -1.05 + (2.45 * (i + 1)) / segments;
    // 玻璃罩外扩 0.022，光条再抬高，避免共面闪烁导致线条断续
    const ya = sectionValueAt(za, 'yTop') + 0.05;
    const yb = sectionValueAt(zb, 'yTop') + 0.05;
    surface.quad(
      new Vector3(-0.035, ya, za),
      new Vector3(0.035, ya, za),
      new Vector3(0.035, yb, zb),
      new Vector3(-0.035, yb, zb),
      facing,
    );
  }
}

function paintMaterial(scene: Scene, name: string, hex: string, specular = 0.85) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.FromHexString(hex);
  material.emissiveColor = Color3.FromHexString(hex).scale(0.07);
  material.specularColor = new Color3(specular, specular, specular);
  material.specularPower = 96;
  material.backFaceCulling = false;
  return material;
}

function neonMaterial(scene: Scene, name: string, hex: string, intensity = 1.4) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.FromHexString(hex);
  material.emissiveColor = Color3.FromHexString(hex).scale(intensity);
  material.specularColor = Color3.Black();
  material.backFaceCulling = false;
  return material;
}

function glassMaterial(scene: Scene, name: string) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = new Color3(0.035, 0.08, 0.13);
  material.emissiveColor = new Color3(0.04, 0.13, 0.2);
  material.specularColor = new Color3(1, 1, 1);
  material.specularPower = 220;
  material.alpha = 0.82;
  material.backFaceCulling = false;
  return material;
}

/** 轮子外侧的五根辐条，合成一个网格挂在 spinner 下随轮滚动。 */
function buildSpokes(scene: Scene, side: 1 | -1, material: StandardMaterial, parent: TransformNode) {
  const surface = new Surface();
  const facing = new Vector3(side, 0, 0);
  const x = side * 0.172;
  for (let k = 0; k < 5; k++) {
    const angle = (k * Math.PI * 2) / 5;
    const dy = Math.cos(angle);
    const dz = Math.sin(angle);
    const py = -dz;
    const pz = dy;
    const inner = 0.085;
    const outer = 0.30;
    const wIn = 0.026;
    const wOut = 0.042;
    surface.quad(
      new Vector3(x, dy * inner - py * wIn, dz * inner - pz * wIn),
      new Vector3(x, dy * outer - py * wOut, dz * outer - pz * wOut),
      new Vector3(x, dy * outer + py * wOut, dz * outer + pz * wOut),
      new Vector3(x, dy * inner + py * wIn, dz * inner + pz * wIn),
      facing,
    );
  }
  return surface.build(scene, 'player-spokes', material, parent);
}

export interface PlayerCarOptions {
  color: string;
  accent: string;
}

export function createPlayerCar(scene: Scene, options: PlayerCarOptions): CarRig {
  const { color, accent } = options;
  const root = new TransformNode('player-car', scene);

  const paintMat = paintMaterial(scene, 'player-paint', color);
  const carbonMat = paintMaterial(scene, 'player-carbon', '#101722', 0.3);
  const glassMat = glassMaterial(scene, 'player-glass');
  const trimMat = neonMaterial(scene, 'player-trim', accent, 1.35);
  const headMat = neonMaterial(scene, 'player-headlight', '#eaf6ff', 2.2);
  const tailMat = neonMaterial(scene, 'player-taillight', '#ff2b4d', 2.1);
  const tyreMat = paintMaterial(scene, 'player-tyre', '#0a0c12', 0.16);
  const rimMat = neonMaterial(scene, 'player-rim', accent, 1.1);

  const paint = new Surface();
  const carbon = new Surface();
  const glass = new Surface();
  const trim = new Surface();
  const head = new Surface();
  const tail = new Surface();

  // 车身壳体 + 泡泡座舱罩（只取肩斜面与顶面三条边）
  loftInto(paint, BODY, [0, 1, 2, 3, 4, 5], 0, true);
  loftInto(glass, CANOPY, [1, 2, 3], 0.022, false);

  for (const side of [-1, 1] as const) {
    // 车门：深色门缝框比车漆门板大一圈，四周留 0.04 的缝
    sidePanel(carbon, side, { z0: -0.90, z1: 0.76, y0: 0.40, y1: 0.85, inset: 0, lift: 0.012 });
    sidePanel(paint, side, { z0: -0.86, z1: 0.72, y0: 0.40, y1: 0.82, inset: 0.040, lift: 0.022 });
    doorCrease(trim, side);

    const handleX = side * (bodyWidthAt(-0.5) + 0.036);
    trim.quad(
      new Vector3(handleX, 0.755, -0.62),
      new Vector3(handleX, 0.755, -0.38),
      new Vector3(handleX, 0.785, -0.38),
      new Vector3(handleX, 0.785, -0.62),
      new Vector3(side, 0, 0),
    );

    // 深色下包围探到 0.16，视觉上把车压低，避免整车像悬浮
    sidePanel(carbon, side, { z0: -1.15, z1: 1.05, y0: 0.16, y1: 0.38, inset: 0, lift: 0.018 });
    sidePanel(trim, side, { z0: -1.15, z1: 1.05, y0: 0.185, y1: 0.202, inset: 0, lift: 0.026 });

    wheelArch(trim, side, FRONT_Z);
    wheelArch(trim, side, REAR_Z);

    // 头灯：贴着车鼻肩部斜面，不越过收窄后的端面
    const hx0 = side > 0 ? 0.22 : -0.58;
    const hx1 = side > 0 ? 0.58 : -0.22;
    head.quad(
      new Vector3(hx0, 0.545, 2.205),
      new Vector3(hx1, 0.545, 2.205),
      new Vector3(hx1, 0.605, 2.205),
      new Vector3(hx0, 0.605, 2.205),
      new Vector3(0, 0, 1),
    );
  }

  roofStripe(trim);

  // 前唇：留在车鼻轮廓内，发光刃贴在端面而不是悬在前方
  carbon.quad(
    new Vector3(-0.70, 0.30, 2.08),
    new Vector3(0.70, 0.30, 2.08),
    new Vector3(0.66, 0.24, 2.22),
    new Vector3(-0.66, 0.24, 2.22),
    new Vector3(0, 1, 0),
  );
  trim.quad(
    new Vector3(-0.56, 0.415, 2.205),
    new Vector3(0.56, 0.415, 2.205),
    new Vector3(0.56, 0.44, 2.205),
    new Vector3(-0.56, 0.44, 2.205),
    new Vector3(0, 0, 1),
  );

  // 尾翼：主翼 + 两端端板
  paint.quad(
    new Vector3(-0.94, 1.32, -2.30),
    new Vector3(0.94, 1.32, -2.30),
    new Vector3(0.94, 1.32, -1.80),
    new Vector3(-0.94, 1.32, -1.80),
    new Vector3(0, 1, 0),
  );
  for (const side of [-1, 1] as const) {
    const x = side * 0.96;
    const facing = new Vector3(side, 0, 0);
    paint.quad(
      new Vector3(x, 1.08, -2.32),
      new Vector3(x, 1.08, -1.78),
      new Vector3(x, 1.46, -1.78),
      new Vector3(x, 1.46, -2.32),
      facing,
    );
    // 尾翼支柱
    const sx = side * 0.56;
    paint.quad(
      new Vector3(sx, 1.00, -2.08),
      new Vector3(sx + 0.05, 1.00, -2.08),
      new Vector3(sx + 0.05, 1.31, -1.98),
      new Vector3(sx, 1.31, -1.98),
      new Vector3(0, 0, -1),
    );
  }

  // 后扩散器：短斜底板 + 贴在车尾端面的发光鳍，避免黑色锯齿状垂片
  carbon.quad(
    new Vector3(-0.76, 0.26, -2.20),
    new Vector3(0.76, 0.26, -2.20),
    new Vector3(0.72, 0.18, -2.34),
    new Vector3(-0.72, 0.18, -2.34),
    new Vector3(0, 1, 0),
  );
  for (let i = 0; i < 5; i++) {
    const x = -0.60 + i * 0.30;
    trim.quad(
      new Vector3(x, 0.265, -2.205),
      new Vector3(x + 0.035, 0.265, -2.205),
      new Vector3(x + 0.035, 0.40, -2.205),
      new Vector3(x, 0.40, -2.205),
      new Vector3(0, 0, -1),
    );
  }

  // 贯穿式尾灯
  tail.quad(
    new Vector3(-0.66, 0.76, -2.205),
    new Vector3(0.66, 0.76, -2.205),
    new Vector3(0.66, 0.87, -2.205),
    new Vector3(-0.66, 0.87, -2.205),
    new Vector3(0, 0, -1),
  );

  const body = paint.build(scene, 'player-body', paintMat, root);
  carbon.build(scene, 'player-carbon-parts', carbonMat, root);
  glass.build(scene, 'player-canopy', glassMat, root);
  trim.build(scene, 'player-neon-trim', trimMat, root);
  head.build(scene, 'player-headlights', headMat, root);
  tail.build(scene, 'player-taillight', tailMat, root);

  // 轮组：几何变了，但位置、半径、轴向契约完全不变
  const wheels: Wheel[] = [];
  const wheelPositions: Array<[number, number, boolean]> = [
    [-WHEEL_X, FRONT_Z, true],
    [WHEEL_X, FRONT_Z, true],
    [-WHEEL_X, REAR_Z, false],
    [WHEEL_X, REAR_Z, false],
  ];
  for (const [x, z, front] of wheelPositions) {
    const side: 1 | -1 = x > 0 ? 1 : -1;
    const pivot = new TransformNode('player-wheel-pivot', scene);
    pivot.parent = root;
    pivot.position.set(x, WHEEL_Y, z);

    const spinner = new TransformNode('player-wheel-spin', scene);
    spinner.parent = pivot;

    const tyre = CreateCylinder('player-tyre', { height: 0.32, diameter: 0.82, tessellation: 24 }, scene);
    tyre.material = tyreMat;
    tyre.rotation.z = Math.PI / 2;
    tyre.parent = spinner;
    tyre.isPickable = false;

    const disc = CreateCylinder('player-rim-disc', { height: 0.335, diameter: 0.62, tessellation: 20 }, scene);
    disc.material = carbonMat;
    disc.rotation.z = Math.PI / 2;
    disc.parent = spinner;
    disc.isPickable = false;

    // 发光圈收在轮毂内：放到轮胎外沿会从对侧车头轮廓外露出半圈，像悬空光环
    const ring = CreateTorus('player-rim-ring', { diameter: 0.62, thickness: 0.05, tessellation: 20 }, scene);
    ring.material = rimMat;
    ring.rotation.z = Math.PI / 2;
    ring.position.x = side * 0.172;
    ring.parent = spinner;
    ring.isPickable = false;

    buildSpokes(scene, side, rimMat, spinner);
    wheels.push({ pivot, spinner, front });
  }

  // 氮气尾焰：主循环会写 scaling.y，几何须保持沿局部 Y（旋转后指向 -Z）
  const flameMaterial = neonMaterial(scene, 'player-flame', '#ff7a2a', 2.2);
  flameMaterial.alpha = 0.85;
  const flames: Mesh[] = [];
  for (const side of [-1, 1]) {
    const flame = CreateCylinder('player-boost-flame', { height: 1.6, diameterTop: 0.3, diameterBottom: 0.02, tessellation: 12 }, scene);
    flame.material = flameMaterial;
    flame.rotation.x = Math.PI / 2;
    flame.position.set(side * 0.42, 0.55, -2.65);
    flame.parent = root;
    flame.isPickable = false;
    flame.setEnabled(false);
    flames.push(flame);
  }

  const glow = new PointLight('player-underglow', new Vector3(0, 0.18, 0), scene);
  glow.diffuse = Color3.FromHexString(accent);
  glow.specular = Color3.Black();
  glow.radius = 9;
  glow.intensity = 0.7;
  glow.parent = root;

  const rim = new PointLight('player-rim', new Vector3(0, 5.2, 0.6), scene);
  rim.diffuse = new Color3(0.8, 0.88, 1);
  rim.specular = new Color3(0.9, 0.95, 1);
  rim.radius = 11;
  rim.intensity = 0.55;
  rim.parent = root;

  return { root, wheels, flames, glow, body };
}
