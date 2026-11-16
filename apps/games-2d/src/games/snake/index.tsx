import { useEffect, useRef, useState } from 'react';
import { createGameClient } from '@youxi/game-sdk';
import { createSnakeGame, type SnakeSnapshot } from './engine';
import type { Direction } from './model';
import './style.css';

const directions: Record<string, Direction> = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
const initial: SnakeSnapshot = { phase: 'title', score: 0, length: 3, best: 0, speed: 5.9 };
export default function SnakeGame() {
  const parent = useRef<HTMLDivElement>(null), engine = useRef<ReturnType<typeof createSnakeGame> | undefined>(undefined);
  const [state, setState] = useState(initial), [difficulty, setDifficulty] = useState(170), [error, setError] = useState('');
  const current = useRef(state); current.current = state;
  const swipe = useRef<{ x: number; y: number } | undefined>(undefined);
  useEffect(() => {
    const client = createGameClient('snake'); let unsubscribe = () => {};
    try {
      engine.current = createSnakeGame(parent.current!, setState, client.score, client.ready);
      unsubscribe = client.onCommand(command => engine.current?.[command]());
    } catch (cause) { const message = cause instanceof Error ? cause.message : '游戏启动失败'; setError(message); client.error(message); }
    const keydown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('button, select, input')) return;
      if (directions[event.code]) { event.preventDefault(); engine.current?.turn(directions[event.code]); }
      if ((event.code === 'Space' || event.code === 'Escape') && !event.repeat) {
        event.preventDefault();
        if (current.current.phase === 'playing') engine.current?.pause();
        else if (current.current.phase === 'paused') engine.current?.resume();
        else if (event.code === 'Space') engine.current?.start();
      }
      if (event.code === 'KeyR' && !event.repeat) engine.current?.restart();
    };
    const blur = () => engine.current?.pause();
    const visibility = () => { if (document.hidden) blur(); };
    window.addEventListener('keydown', keydown); window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
    return () => { unsubscribe(); window.removeEventListener('keydown', keydown); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility); engine.current?.dispose(); engine.current = undefined; };
  }, []);
  function focusBoard() { parent.current?.querySelector('canvas')?.focus(); }
  const playing = state.phase === 'playing', paused = state.phase === 'paused';
  return <div className="snake-game" data-phase={state.phase}>
    <header className="snake-header"><div><small>THE LITTLE ARCADE</small><h1>贪吃蛇<span>✦</span></h1></div><div className="snake-record"><span>BEST / 最高分</span><strong>{state.best}</strong></div></header>
    <div className="snake-layout"><div className="snake-board-wrap">
      <div ref={parent} className="snake-board" onPointerDown={event => { swipe.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); focusBoard(); }} onPointerUp={event => {
        const start = swipe.current; swipe.current = undefined; if (!start) return;
        const dx = event.clientX - start.x, dy = event.clientY - start.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 16) return;
        engine.current?.turn(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up');
      }} onPointerCancel={() => { swipe.current = undefined; }}/>
      {(!playing || error) && <div className="snake-overlay"><span className="snake-menu-mark">{state.phase === 'lost' ? '↻' : state.phase === 'won' ? '✦' : paused ? 'Ⅱ' : '〰'}</span><small>{paused ? 'TAKE A LITTLE BREAK' : state.phase === 'lost' ? 'ONE MORE BITE?' : state.phase === 'won' ? 'A PERFECT APPETITE' : 'SMALL BITES. BIG JOY.'}</small><h2>{error ? '启动失败' : paused ? '歇一小会儿。' : state.phase === 'lost' ? '再吃一口？' : state.phase === 'won' ? '你吃满了整个世界！' : '快乐，从一口开始。'}</h2><p>{error || (state.phase === 'lost' || state.phase === 'won' ? `本局得分 ${state.score} · 蛇身长度 ${state.length}` : paused ? '想好了下一步，就继续向前。' : '吃掉小果子，长成大长蛇。小心墙壁和自己的尾巴。')}</p><button className="snake-primary" onClick={() => { if (error) { location.reload(); return; } if (paused) engine.current?.resume(); else engine.current?.start(); focusBoard(); }}>{error ? '重新加载' : paused ? '继续游戏' : state.phase === 'title' ? '开始游戏' : '再来一局'} <span aria-hidden="true">↗</span></button></div>}
    </div><aside className="snake-sidebar"><div className="snake-score"><small>SCORE / 当前得分</small><strong data-testid="snake-score">{String(state.score).padStart(3, '0')}</strong><span>每颗果子 +10 分</span></div><div className="snake-facts"><div><span>蛇身长度</span><b>{state.length}</b></div><div><span>移动速度</span><b>{state.speed} 格/秒</b></div></div><label className="snake-difficulty">起始速度<select aria-label="起始速度" value={difficulty} disabled={playing || paused} onChange={event => { const value = Number(event.target.value); setDifficulty(value); engine.current?.setDifficulty(value); }}><option value={220}>慢慢来</option><option value={170}>刚刚好</option><option value={110}>快一点</option></select></label><div className="snake-buttons"><button disabled={!playing && !paused} onClick={() => { if (paused) engine.current?.resume(); else engine.current?.pause(); focusBoard(); }}>{paused ? '继续' : '暂停'}</button><button onClick={() => { engine.current?.restart(); focusBoard(); }}>重新开始</button></div><div className="snake-controls"><button aria-label="向上" onClick={() => { engine.current?.turn('up'); focusBoard(); }}>↑</button><div><button aria-label="向左" onClick={() => { engine.current?.turn('left'); focusBoard(); }}>←</button><button aria-label="向下" onClick={() => { engine.current?.turn('down'); focusBoard(); }}>↓</button><button aria-label="向右" onClick={() => { engine.current?.turn('right'); focusBoard(); }}>→</button></div></div><p className="snake-help">方向键 / WASD 控制<br/>空格暂停 · R 重开<br/>手机可滑动棋盘或点方向按钮</p></aside></div>
    <footer className="snake-footer"><span>越吃越长 · 越吃越快</span><span>JUST ONE MORE ROUND.</span></footer>
  </div>;
}
