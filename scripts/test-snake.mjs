import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSnake, turn, step, placeFood, SIZE } from '../apps/games-2d/src/games/snake/model.ts';

test('吃果子增长、加分，食物不落在蛇身上', () => {
  const state = createSnake(); state.phase = 'playing';
  step(state); step(state); assert.equal(step(state, () => 0), true);
  assert.equal(state.score, 10); assert.equal(state.body.length, 4);
  assert.equal(state.body.some(cell => cell.x === state.food.x && cell.y === state.food.y), false);
});
test('禁止掉头，快速连续转向分两个 tick 执行', () => {
  const state = createSnake(); state.phase = 'playing';
  turn(state, 'left'); assert.deepEqual(state.queued, []);
  turn(state, 'up'); turn(state, 'left'); turn(state, 'down');
  step(state); assert.deepEqual(state.body[0], { x: 7, y: 9 });
  step(state); assert.deepEqual(state.body[0], { x: 6, y: 9 });
});
test('尾巴空位可进入，撞身体和墙壁失败，暂停不推进', () => {
  const state = createSnake(); state.phase = 'playing';
  state.body = [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 0, y: 2 }, { x: 0, y: 1 }]; state.direction = 'left';
  step(state); assert.equal(state.phase, 'playing');
  step(state); assert.equal(state.phase, 'lost');
  const other = createSnake(); other.phase = 'playing'; other.direction = 'left';
  step(other); assert.equal(other.phase, 'lost');
  const paused = createSnake(); paused.phase = 'paused'; const before = JSON.stringify(paused);
  step(paused); turn(paused, 'down'); assert.equal(JSON.stringify(paused), before);
});
test('棋盘填满后胜利，不会陷入寻找食物的循环', () => {
  const full = Array.from({ length: SIZE * SIZE }, (_, i) => ({ x: i % SIZE, y: Math.floor(i / SIZE) }));
  assert.equal(placeFood(full, Math.random), null);
  const state = createSnake(); state.phase = 'playing'; state.direction = 'right';
  state.body = [{ x: 0, y: 0 }, ...full.filter(cell => cell.x !== 0 || cell.y !== 0).filter(cell => cell.x !== 1 || cell.y !== 0)];
  state.food = { x: 1, y: 0 }; step(state);
  assert.equal(state.phase, 'won'); assert.equal(state.body.length, 400);
});
