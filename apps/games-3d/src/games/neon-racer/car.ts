import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import type { Scene } from '@babylonjs/core/scene';

export interface Wheel {
  pivot: TransformNode;
  spinner: TransformNode;
  front: boolean;
}

export interface CarRig {
  root: TransformNode;
  wheels: Wheel[];
  flames: Mesh[];
  glow?: PointLight;
  body: Mesh;
}

export interface CarOptions {
  color: string;
  accent: string;
  player?: boolean;
}

function material(scene: Scene, name: string, diffuse: string, specular = 0.5) {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = Color3.FromHexString(diffuse);
  mat.specularColor = new Color3(specular, specular, specular);
  mat.specularPower = 72;
  return mat;
}

function neon(scene: Scene, name: string, color: string, intensity = 1.6) {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = Color3.FromHexString(color);
  mat.emissiveColor = Color3.FromHexString(color).scale(intensity);
  mat.specularColor = Color3.Black();
  return mat;
}

/** 把方块前部收窄、压低，做出楔形车身。 */
function taper(mesh: Mesh, noseTaper: number, noseDrop: number) {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  if (!positions) return;
  const depth = mesh.getBoundingInfo().boundingBox.extendSize.z * 2;
  const half = depth / 2;
  for (let i = 0; i < positions.length; i += 3) {
    const t = Math.min(1, Math.max(0, (positions[i + 2] + half) / depth));
    const k = t * t;
    positions[i] *= 1 - noseTaper * k;
    if (positions[i + 1] > 0) positions[i + 1] -= noseDrop * k;
  }
  mesh.updateVerticesData(VertexBuffer.PositionKind, positions);
  const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
  const indices = mesh.getIndices();
  if (normals && indices) {
    VertexData.ComputeNormals(positions, indices, normals);
    mesh.updateVerticesData(VertexBuffer.NormalKind, normals);
  }
}

export function createCar(scene: Scene, options: CarOptions): CarRig {
  const { color, accent, player = false } = options;
  const root = new TransformNode(`car-${color}`, scene);
  root.rotation.y = 0;

  const bodyMaterial = material(scene, `body-${color}`, color, 0.9);
  bodyMaterial.emissiveColor = Color3.FromHexString(color).scale(0.07);

  const body = CreateBox('car-body', { width: 1.94, height: 0.62, depth: 4.4 }, scene);
  taper(body, 0.17, 0.24);
  body.material = bodyMaterial;
  body.position.y = 0.72;
  body.parent = root;
  body.isPickable = false;

  const cabin = CreateBox('car-cabin', { width: 1.5, height: 0.34, depth: 1.95 }, scene);
  taper(cabin, 0.3, 0.06);
  cabin.material = new StandardMaterial(`canopy-${color}`, scene);
  (cabin.material as StandardMaterial).diffuseColor = new Color3(0.02, 0.035, 0.06);
  (cabin.material as StandardMaterial).emissiveColor = new Color3(0.03, 0.09, 0.14);
  (cabin.material as StandardMaterial).specularColor = new Color3(1, 1, 1);
  (cabin.material as StandardMaterial).specularPower = 220;
  cabin.position.set(0, 1.0, -0.3);
  cabin.parent = root;
  cabin.isPickable = false;


  const windshieldMaterial = new StandardMaterial(`glass-${color}`, scene);
  windshieldMaterial.diffuseColor = new Color3(0.04, 0.09, 0.14);
  windshieldMaterial.emissiveColor = new Color3(0.05, 0.16, 0.24);
  windshieldMaterial.specularColor = new Color3(1, 1, 1);
  windshieldMaterial.specularPower = 200;

  const windshield = CreateBox('car-windshield', { width: 1.24, height: 0.5, depth: 0.1 }, scene);
  windshield.material = windshieldMaterial;
  windshield.position.set(0, 1.02, 0.66);
  windshield.rotation.x = -0.62;
  windshield.parent = root;
  windshield.isPickable = false;

  const accentMaterial = neon(scene, `accent-${color}`, accent, 1.9);
  for (const side of [-1, 1]) {
    const stripe = CreateBox('car-stripe', { width: 0.1, height: 0.06, depth: 3.1 }, scene);
    stripe.material = accentMaterial;
    stripe.position.set(side * 0.62, 0.9, 0.2);
    stripe.parent = root;
    stripe.isPickable = false;
  }

  const spoiler = CreateBox('car-spoiler', { width: 1.86, height: 0.09, depth: 0.52 }, scene);
  spoiler.material = bodyMaterial;
  spoiler.position.set(0, 1.24, -2.0);
  spoiler.parent = root;
  spoiler.isPickable = false;
  for (const side of [-1, 1]) {
    const support = CreateBox('car-spoiler-support', { width: 0.09, height: 0.34, depth: 0.16 }, scene);
    support.material = bodyMaterial;
    support.position.set(side * 0.68, 1.04, -1.98);
    support.parent = root;
    support.isPickable = false;
  }

  const headlightMaterial = neon(scene, `headlight-${color}`, '#eaf6ff', 2.6);
  for (const side of [-1, 1]) {
    const light = CreateBox('car-headlight', { width: 0.42, height: 0.13, depth: 0.08 }, scene);
    light.material = headlightMaterial;
    light.position.set(side * 0.52, 0.62, 2.16);
    light.parent = root;
    light.isPickable = false;
  }

  const tailMaterial = neon(scene, `tail-${color}`, '#ff2b4d', 2.4);
  const tail = CreateBox('car-tail', { width: 1.5, height: 0.12, depth: 0.06 }, scene);
  tail.material = tailMaterial;
  tail.position.set(0, 0.78, -2.2);
  tail.parent = root;
  tail.isPickable = false;

  const tyreMaterial = material(scene, `tyre-${color}`, '#0a0c12', 0.2);
  const rimMaterial = neon(scene, `rim-${color}`, accent, 1.4);
  const wheels: Wheel[] = [];
  const wheelPositions: Array<[number, number, boolean]> = [
    [-0.94, 1.42, true],
    [0.94, 1.42, true],
    [-0.94, -1.38, false],
    [0.94, -1.38, false],
  ];
  for (const [x, z, front] of wheelPositions) {
    const pivot = new TransformNode('wheel-pivot', scene);
    pivot.parent = root;
    pivot.position.set(x, 0.42, z);

    const spinner = new TransformNode('wheel-spin', scene);
    spinner.parent = pivot;

    const tyre = CreateCylinder('wheel-tyre', { height: 0.32, diameter: 0.82, tessellation: 18 }, scene);
    tyre.material = tyreMaterial;
    tyre.rotation.z = Math.PI / 2;
    tyre.parent = spinner;
    tyre.isPickable = false;

    const rim = CreateTorus('wheel-rim', { diameter: 0.52, thickness: 0.07, tessellation: 14 }, scene);
    rim.material = rimMaterial;
    rim.rotation.z = Math.PI / 2;
    rim.position.x = x > 0 ? 0.17 : -0.17;
    rim.parent = spinner;
    rim.isPickable = false;

    wheels.push({ pivot, spinner, front });
  }

  const flames: Mesh[] = [];
  if (player) {
    const flameMaterial = new StandardMaterial(`flame-${color}`, scene);
    flameMaterial.diffuseColor = new Color3(1, 0.45, 0.1);
    flameMaterial.emissiveColor = new Color3(1, 0.55, 0.15).scale(2.2);
    flameMaterial.alpha = 0.85;
    for (const side of [-1, 1]) {
      const flame = CreateCylinder('boost-flame', { height: 1.6, diameterTop: 0.3, diameterBottom: 0.02, tessellation: 12 }, scene);
      flame.material = flameMaterial;
      flame.rotation.x = Math.PI / 2;
      flame.position.set(side * 0.42, 0.55, -2.65);
      flame.parent = root;
      flame.isPickable = false;
      flame.setEnabled(false);
      flames.push(flame);
    }
  }

  const glow = player ? new PointLight('underglow', new Vector3(0, 0.18, 0), scene) : undefined;
  if (glow) {
    glow.diffuse = Color3.FromHexString(accent);
    glow.specular = Color3.Black();
    glow.radius = 9;
    glow.intensity = 0.7;
    glow.parent = root;
  }

  if (player) {
    const rim = new PointLight('car-rim', new Vector3(0, 5.2, 0.6), scene);
    rim.diffuse = new Color3(0.8, 0.88, 1);
    rim.specular = new Color3(0.9, 0.95, 1);
    rim.radius = 11;
    rim.intensity = 0.55;
    rim.parent = root;
  }

  return { root, wheels, flames, glow, body };
}
