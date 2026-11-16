export type Direction = 'up' | 'down' | 'left' | 'right';
export type Phase = 'title' | 'playing' | 'paused' | 'lost' | 'won';
export interface Cell { x: number; y: number; }
export interface SnakeState { body: Cell[]; direction: Direction; queued: Direction[]; food: Cell | null; score: number; phase: Phase; }
export const SIZE = 20;
const vectors: Record<Direction, Cell> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
export function createSnake(): SnakeState {
  return { body: [{ x: 7, y: 10 }, { x: 6, y: 10 }, { x: 5, y: 10 }], direction: 'right', queued: [], food: { x: 10, y: 10 }, score: 0, phase: 'title' };
}
export function turn(state: SnakeState, next: Direction) {
  if (state.phase !== 'playing' || state.queued.length >= 2) return;
  const last = state.queued.at(-1) ?? state.direction;
  if (last === next || vectors[last].x + vectors[next].x === 0 && vectors[last].y + vectors[next].y === 0) return;
  state.queued.push(next);
}
export function placeFood(body: Cell[], random: () => number): Cell | null {
  const occupied = new Set(body.map(cell => cell.y * SIZE + cell.x));
  const free: Cell[] = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (!occupied.has(y * SIZE + x)) free.push({ x, y });
  return free[Math.min(free.length - 1, Math.max(0, Math.floor(random() * free.length)))] ?? null;
}
export function step(state: SnakeState, random = Math.random): boolean {
  if (state.phase !== 'playing') return false;
  state.direction = state.queued.shift() ?? state.direction;
  const vector = vectors[state.direction], head = { x: state.body[0].x + vector.x, y: state.body[0].y + vector.y };
  const eating = state.food?.x === head.x && state.food.y === head.y;
  const collisionBody = eating ? state.body : state.body.slice(0, -1);
  if (head.x < 0 || head.y < 0 || head.x >= SIZE || head.y >= SIZE || collisionBody.some(cell => cell.x === head.x && cell.y === head.y)) {
    state.phase = 'lost'; state.queued = []; return false;
  }
  state.body.unshift(head);
  if (eating) {
    state.score += 10; state.food = placeFood(state.body, random);
    if (!state.food) state.phase = 'won';
  } else state.body.pop();
  return eating;
}
