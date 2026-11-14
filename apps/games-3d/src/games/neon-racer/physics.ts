import { ROAD_HALF_WIDTH, WALL_GAP } from './track';

/**
 * 街机车辆运动学。这里不引用任何渲染对象，方便在 Node 里独立仿真调参。
 *
 * 坐标约定（与 Babylon 保持一致，全工程只认这一套）：
 *   车模型车头朝本地 +Z，root.rotation.y = heading 时世界前向量为 (sin h, cos h)。
 *   因此沿赛道切线 (tx, tz) 行驶时 heading = atan2(tx, tz)，而不是 atan2(-tx, tz)。
 *   屏幕右为 +X，所以 heading 增大是右转，左键要给负的 steer。
 */

export const MAX_SPEED = 86;
export const BOOST_SPEED = 112;

const ACCEL = 36;
const BRAKE_FORCE = 78;
const DRAG = 0.4;
const COAST_DRAG = 9;
const REVERSE_MAX = 18;
const OFFROAD_MAX = 32;
const TURN_RATE = 2.05;
const STEER_RESPONSE = 11;
const NITRO_DRAIN = 0.36;
const NITRO_REGEN = 0.085;

const OFFROAD_START = ROAD_HALF_WIDTH - 0.6;
const OFFROAD_RAMP = 2.4;
const WALL_LIMIT = ROAD_HALF_WIDTH + WALL_GAP - 1.3;

export interface SurfaceSample {
  tx: number;
  tz: number;
  nx: number;
  nz: number;
}

export interface NearestQuery {
  index: number;
  lateral: number;
  distance: number;
}

/** Track 类的最小结构子集，Track / 测试用假赛道都能直接传入。 */
export interface TrackLike {
  readonly length: number;
  readonly samples: ReadonlyArray<SurfaceSample>;
  nearest(x: number, z: number, hint: number): NearestQuery;
}

export interface DriveInput {
  throttle: number;
  brake: number;
  /** -1 = 左，+1 = 右 */
  steer: number;
  boost: boolean;
  /** 冲线后为 false：忽略操作，只保留惯性滑行 */
  active: boolean;
}

export interface VehicleState {
  x: number;
  z: number;
  heading: number;
  speed: number;
  steer: number;
  spin: number;
  nitro: number;
  boosting: boolean;
  index: number;
  lateral: number;
  distance: number;
  previousDistance: number;
  laps: number;
  progress: number;
  offroad: boolean;
  /** 0..1，压线越深惩罚越重，避免布尔开关造成的速度突变 */
  offroadDepth: number;
  wallContact: boolean;
  /** 撞击冲击量，交给相机做抖动 */
  shake: number;
}

export interface StartPose {
  x: number;
  z: number;
  tx: number;
  tz: number;
}

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
export const headingFromTangent = (tx: number, tz: number) => Math.atan2(tx, tz);
export const forwardFromHeading = (heading: number) => ({ x: Math.sin(heading), z: Math.cos(heading) });

export function createVehicle(pose: StartPose): VehicleState {
  return {
    x: pose.x,
    z: pose.z,
    heading: headingFromTangent(pose.tx, pose.tz),
    speed: 0,
    steer: 0,
    spin: 0,
    nitro: 1,
    boosting: false,
    index: 0,
    lateral: 0,
    distance: 0,
    previousDistance: 0,
    laps: -1,
    progress: 0,
    offroad: false,
    offroadDepth: 0,
    wallContact: false,
    shake: 0,
  };
}

export function resetVehicle(vehicle: VehicleState, pose: StartPose) {
  Object.assign(vehicle, createVehicle(pose));
}

export const IDLE_INPUT: DriveInput = { throttle: 0, brake: 0, steer: 0, boost: false, active: false };

/** 推进一个固定步长。所有平滑都用指数形式，结果与帧率无关。 */
export function stepVehicle(vehicle: VehicleState, input: DriveInput, track: TrackLike, dt: number) {
  const throttle = input.active ? clamp(input.throttle, 0, 1) : 0;
  const braking = input.active ? clamp(input.brake, 0, 1) : 0;
  const steerInput = input.active ? clamp(input.steer, -1, 1) : 0;

  vehicle.shake = Math.max(0, vehicle.shake - dt * 2.6);

  const boosting = input.active && input.boost && vehicle.nitro > 0.02 && vehicle.speed > 4 && throttle > 0;
  vehicle.boosting = boosting;
  vehicle.nitro = boosting
    ? Math.max(0, vehicle.nitro - NITRO_DRAIN * dt)
    : Math.min(1, vehicle.nitro + NITRO_REGEN * dt);

  const topSpeed = boosting ? BOOST_SPEED : Math.max(MAX_SPEED, vehicle.speed - 24 * dt);
  let acceleration = 0;
  if (throttle) acceleration += ACCEL * (boosting ? 1.9 : 1) * throttle;
  if (braking) acceleration -= (vehicle.speed > 1 ? BRAKE_FORCE : ACCEL * 0.55) * braking;
  acceleration -= vehicle.speed * DRAG;
  if (!throttle && !braking) acceleration -= Math.sign(vehicle.speed) * COAST_DRAG;
  // 出界阻力随越界深度连续增长：压到边线只轻微拖慢，冲进草地才明显掉速
  acceleration -= vehicle.offroadDepth * (0.95 * vehicle.speed + Math.max(0, vehicle.speed - OFFROAD_MAX) * 2.2);
  vehicle.speed = clamp(vehicle.speed + acceleration * dt, -REVERSE_MAX, topSpeed);

  // 方向盘：输入平滑 + 速度门槛。静止时不能原地拧车头，高速时略微收敛避免一打就飞
  const absSpeed = Math.abs(vehicle.speed);
  const speedRatio = Math.min(1, absSpeed / MAX_SPEED);
  const grip = 1 - 0.38 * vehicle.offroadDepth;
  vehicle.steer += (steerInput - vehicle.steer) * (1 - Math.exp(-dt * STEER_RESPONSE));
  const engage = Math.min(1, absSpeed / 5);
  const ramp = 0.45 + 0.55 * Math.min(1, absSpeed / 28);
  const highSpeedDamp = 1 - 0.25 * speedRatio;
  const yawRate = TURN_RATE * vehicle.steer * engage * ramp * highSpeedDamp * grip;
  vehicle.heading = wrapAngle(vehicle.heading + yawRate * dt * Math.sign(vehicle.speed || 1));

  const forward = forwardFromHeading(vehicle.heading);
  vehicle.x += forward.x * vehicle.speed * dt;
  vehicle.z += forward.z * vehicle.speed * dt;

  const query = track.nearest(vehicle.x, vehicle.z, vehicle.index);
  vehicle.index = query.index;
  vehicle.lateral = query.lateral;
  vehicle.offroadDepth = clamp((Math.abs(query.lateral) - OFFROAD_START) / OFFROAD_RAMP, 0, 1);
  vehicle.offroad = vehicle.offroadDepth > 0;

  // 滞回：贴墙后稍微松一点才判定脱离，避免边界浮点抖动反复触发「首次撞击」
  const contactLimit = vehicle.wallContact ? WALL_LIMIT - 0.15 : WALL_LIMIT;
  const contact = Math.abs(query.lateral) > contactLimit;
  if (contact) {
    const overshoot = Math.max(0, Math.abs(query.lateral) - WALL_LIMIT);
    const sign = Math.sign(query.lateral);
    const sample = track.samples[query.index];
    vehicle.x -= sample.nx * sign * overshoot;
    vehicle.z -= sample.nz * sign * overshoot;
    vehicle.lateral = sign * Math.min(Math.abs(query.lateral), WALL_LIMIT);

    const outward = forward.x * sample.nx * sign + forward.z * sample.nz * sign;
    if (outward > 0) {
      // 车头朝墙外时把朝向缓缓拉回切线，让车沿墙滑走而不是每帧顶墙抖动
      const wallHeading = headingFromTangent(sample.tx, sample.tz);
      vehicle.heading = wrapAngle(
        vehicle.heading + wrapAngle(wallHeading - vehicle.heading) * Math.min(1, dt * 6),
      );
    }
    const impact = clamp(outward, 0, 1);
    if (!vehicle.wallContact) {
      vehicle.speed *= 1 - 0.32 * impact;
      vehicle.shake = Math.min(1, vehicle.shake + 0.22 + impact * 0.45);
    } else {
      vehicle.speed *= Math.max(0.85, 1 - (0.25 + impact * 0.4) * dt);
    }
  }
  vehicle.wallContact = contact;

  const previous = vehicle.previousDistance;
  if (previous > track.length * 0.75 && query.distance < track.length * 0.25) vehicle.laps += 1;
  else if (previous < track.length * 0.25 && query.distance > track.length * 0.75) vehicle.laps -= 1;
  vehicle.previousDistance = query.distance;
  vehicle.distance = query.distance;
  vehicle.progress = (vehicle.laps + 1) * track.length + query.distance;

  vehicle.spin += (vehicle.speed * dt) / 0.41;
}
