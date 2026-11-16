import Phaser from 'phaser';
import { createSnake, step, turn, SIZE, type Direction, type Phase } from './model';

export interface SnakeSnapshot { phase: Phase; score: number; length: number; best: number; speed: number; }
export function createSnakeGame(parent: HTMLElement, publish: (value: SnakeSnapshot) => void, report: (score: number) => void, ready: () => void) {
  let state = createSnake(), elapsed = 0, baseSpeed = 170, best = 0, alive = true;
  let scene: Board | undefined;
  try { const value = Number(localStorage.getItem('youxi.snake.best.v1')); if (Number.isFinite(value) && value >= 0) best = value; } catch { /* Storage is optional. */ }
  const interval = () => Math.max(65, baseSpeed - Math.floor(state.score / 30) * 10);
  const snapshot = () => { if (alive) publish({ phase: state.phase, score: state.score, length: state.body.length, best, speed: Math.round(1000 / interval() * 10) / 10 }); };
  function saveBest() { if (state.score <= best) return; best = state.score; try { localStorage.setItem('youxi.snake.best.v1', String(best)); } catch { /* In-memory best still works. */ } }
  function start() { if (state.phase === 'playing') return; if (state.phase === 'paused') { resume(); return; } state = createSnake(); state.phase = 'playing'; elapsed = 0; report(0); snapshot(); scene?.paint(); }
  function pause() { if (state.phase === 'playing') { state.phase = 'paused'; elapsed = 0; snapshot(); } }
  function resume() { if (state.phase === 'paused') { state.phase = 'playing'; elapsed = 0; snapshot(); } }
  function restart() { state = createSnake(); start(); }
  class Board extends Phaser.Scene {
    pieces!: Phaser.GameObjects.Graphics;
    create() {
      scene = this;
      this.game.canvas.tabIndex = 0;
      const background = this.add.graphics();
      background.fillStyle(0x0d211c); background.fillRoundedRect(8, 8, 624, 624, 16);
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { background.fillStyle((x + y) % 2 ? 0x122a22 : 0x142e25); background.fillRect(20 + x * 30, 20 + y * 30, 30, 30); }
      this.pieces = this.add.graphics(); this.paint(); snapshot(); ready();
    }
    paint() {
      if (!this.pieces) return;
      const graphic = this.pieces.clear();
      if (state.food) {
        const x = 35 + state.food.x * 30, y = 35 + state.food.y * 30;
        graphic.fillStyle(0xffbd73, .12); graphic.fillCircle(x, y, 15);
        graphic.fillStyle(0xf6b26c); graphic.fillRoundedRect(x - 9, y - 8, 18, 18, 6);
        graphic.lineStyle(3, 0x91c879); graphic.lineBetween(x, y - 8, x + 3, y - 14);
        graphic.fillStyle(0xffddb2); graphic.fillCircle(x - 3, y - 3, 2);
      }
      state.body.slice().reverse().forEach((cell, reverseIndex) => {
        const head = reverseIndex === state.body.length - 1;
        graphic.fillStyle(head ? 0xe0ff9c : 0x9dc76b); graphic.fillRoundedRect(22 + cell.x * 30, 22 + cell.y * 30, 26, 26, head ? 8 : 6);
        if (!head) return;
        const cx = 35 + cell.x * 30, cy = 35 + cell.y * 30;
        const eyePairs = { right: [[6, -5], [6, 5]], left: [[-6, -5], [-6, 5]], up: [[-5, -6], [5, -6]], down: [[-5, 6], [5, 6]] };
        graphic.fillStyle(0x173521);
        for (const [dx, dy] of eyePairs[state.direction]) graphic.fillCircle(cx + dx, cy + dy, 2.4);
      });
    }
    update(_time: number, delta: number) {
      if (state.phase !== 'playing') return;
      elapsed += Math.min(delta, 200);
      let ticks = 0;
      while (elapsed >= interval() && state.phase === 'playing' && ticks++ < 3) {
        elapsed -= interval();
        const ate = step(state);
        if (ate) { saveBest(); report(state.score); }
        this.paint(); snapshot();
      }
    }
  }
  const game = new Phaser.Game({ type: Phaser.AUTO, parent, width: 640, height: 640, backgroundColor: '#0d211c', scene: Board, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, audio: { noAudio: true }, banner: false });
  return {
    start, pause, resume, restart,
    turn: (direction: Direction) => turn(state, direction),
    setDifficulty(value: number) { if (state.phase === 'playing' || state.phase === 'paused') return; baseSpeed = value; snapshot(); },
    dispose() { alive = false; scene = undefined; game.destroy(true); },
  };
}
