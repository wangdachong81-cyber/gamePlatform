export type Phase = 'title' | 'playing' | 'paused' | 'dead' | 'won';
export interface Target { id: string; kind: 'guard' | 'core' | 'boss'; hp: number; maxHp: number; }
export interface Mission {
  phase: Phase; room: number; health: number; score: number; cleared: boolean;
  spread: boolean; targets: Target[]; hits: number;
}
export const ROOM_NAMES = ['外环警戒区', '能源控制室', '重装防线', '中央机械心脏'];
export function createMission(): Mission {
  return { phase: 'title', room: 0, health: 100, score: 0, cleared: false, spread: false, targets: roomTargets(0), hits: 0 };
}
function roomTargets(room: number): Target[] {
  if (room === 3) return Array.from({ length: 3 }, (_, i) => ({ id: `boss-${i}`, kind: 'boss', hp: 9, maxHp: 9 }));
  const guards = Array.from({ length: room + 2 }, (_, i): Target => ({ id: `guard-${i}`, kind: 'guard', hp: 3 + room, maxHp: 3 + room }));
  return [...guards, { id: 'core', kind: 'core', hp: 8 + room * 2, maxHp: 8 + room * 2 }];
}
export function hitTarget(mission: Mission, id: string): boolean {
  const target = mission.targets.find(item => item.id === id);
  if (mission.phase !== 'playing' || !target || target.hp <= 0) return false;
  if (target.kind === 'core' && mission.targets.some(item => item.kind === 'guard' && item.hp > 0)) return false;
  target.hp--; mission.hits++;
  if (target.hp === 0) mission.score += target.kind === 'guard' ? 100 : target.kind === 'core' ? 300 : 400;
  if (mission.targets.every(item => item.hp <= 0)) {
    mission.cleared = true;
    if (mission.room === 3) { mission.phase = 'won'; mission.score += 1000; }
  }
  return true;
}
export function advanceRoom(mission: Mission): boolean {
  if (mission.phase !== 'playing' || !mission.cleared || mission.room >= 3) return false;
  mission.room++; mission.targets = roomTargets(mission.room); mission.cleared = false;
  mission.health = Math.min(100, mission.health + 25); mission.spread = true;
  return true;
}
export function damagePlayer(mission: Mission, amount: number) {
  if (mission.phase !== 'playing') return;
  mission.health = Math.max(0, mission.health - amount);
  if (mission.health === 0) mission.phase = 'dead';
}
