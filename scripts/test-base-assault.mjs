import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMission, hitTarget, advanceRoom, damagePlayer } from '../apps/games-3d/src/games/base-assault/model.ts';

test('核心护盾、房间通关、回血升级和最终胜利', () => {
  const mission = createMission();
  assert.equal(hitTarget(mission, 'guard-0'), false);
  mission.phase = 'playing';
  assert.equal(hitTarget(mission, 'core'), false);
  assert.equal(advanceRoom(mission), false);
  damagePlayer(mission, 35);
  for (let room = 0; room < 4; room++) {
    for (const target of mission.targets) while (target.hp > 0) assert.equal(hitTarget(mission, target.id), true);
    assert.equal(mission.cleared, true);
    if (room < 3) {
      const before = mission.health;
      assert.equal(advanceRoom(mission), true);
      assert.equal(mission.room, room + 1);
      assert.equal(mission.health, Math.min(100, before + 25));
      assert.equal(mission.spread, true);
    }
  }
  assert.equal(mission.phase, 'won');
  assert.equal(mission.score, 4000);
  assert.equal(advanceRoom(mission), false);
});

test('暂停免伤、死亡阻断射击和继续推进', () => {
  const mission = createMission(); mission.phase = 'paused';
  damagePlayer(mission, 100); assert.equal(mission.health, 100);
  mission.phase = 'playing'; damagePlayer(mission, 120);
  assert.equal(mission.health, 0); assert.equal(mission.phase, 'dead');
  assert.equal(hitTarget(mission, 'guard-0'), false);
  assert.equal(advanceRoom(mission), false);
});
