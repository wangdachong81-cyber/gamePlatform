import { useEffect, useRef, useState } from 'react';
import { createGameClient } from '@youxi/game-sdk';
import { createAssault, type Snapshot } from './engine';
import './style.css';

const initial: Snapshot = { phase: 'title', room: 0, name: '外环警戒区', health: 100, score: 0, guards: 2, cores: 1, totalCores: 1, cleared: false, spread: false, hit: false, hurt: false, muted: false, locked: false, warning: false };
export default function BaseAssault() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<ReturnType<typeof createAssault> | undefined>(undefined);
  const [state, setState] = useState(initial), [error, setError] = useState('');
  useEffect(() => {
    const client = createGameClient('base-assault'); const title = document.title;
    document.title = '纵深突击 · 游隙';
    let unsubscribe = () => {};
    try {
      engine.current = createAssault(canvas.current!, setState, client.score);
      unsubscribe = client.onCommand(command => engine.current?.[command]());
      client.ready();
    } catch (cause) { const message = cause instanceof Error ? cause.message : '无法启动 WebGL'; setError(message); client.error(message); }
    return () => { unsubscribe(); engine.current?.dispose(); engine.current = undefined; document.title = title; };
  }, []);
  const move = (x: number, y: number) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); engine.current?.move(x, y); },
    onPointerUp: () => engine.current?.move(0, 0), onPointerCancel: () => engine.current?.move(0, 0), onLostPointerCapture: () => engine.current?.move(0, 0),
  });
  const playing = state.phase === 'playing';
  return <div className={`assault-game ${state.hurt ? 'is-hurt' : ''}`} data-phase={state.phase} data-room={state.room}>
    <canvas ref={canvas} tabIndex={0} aria-label="纵深突击第一人称游戏画面"/>
    <header className="assault-header"><a href="/?world=3d#/">← 游隙</a><span>DEPTH ASSAULT <b>纵深突击</b></span><button onClick={() => engine.current?.toggleMute()} aria-label={state.muted ? '开启声音' : '静音'}>{state.muted ? '声音关' : '声音开'}</button></header>
    <div className="assault-topline"><div><small>SECTOR {String(state.room + 1).padStart(2, '0')} / 04</small><h2>{state.name}</h2></div><div className="assault-score"><small>SCORE</small><strong>{String(state.score).padStart(6, '0')}</strong></div></div>
    {playing && <>
      <div className="assault-objective" role="status">{state.cleared ? '闸门已开启 · 向前穿过闸门' : state.guards > 0 ? `清除守卫 ${state.guards} · 核心护盾已开启` : state.room === 3 ? `摧毁机械核心 ${state.cores} / 3` : '护盾解除 · 射击正前方橙色核心'}</div>
      <div className={`assault-crosshair ${state.hit ? 'hit' : ''}`} aria-hidden="true"><i/><i/><i/><i/></div>
      {state.warning && <div className="assault-warning">⚠ 核心蓄能 · 横向躲避弹幕</div>}
      <div className="assault-bottom"><div className="assault-health"><small>ARMOR / 装甲</small><strong>{state.health}</strong><progress aria-label="装甲值" max="100" value={state.health}/></div><div className="assault-weapon"><small>{state.spread ? 'S / 散弹强化' : 'R / 突击步枪'}</small><strong>∞ <span>AMMO</span></strong></div></div>
      <div className="assault-hint">WASD 移动 · 鼠标 / 方向键瞄准 · 按住左键 / 空格开火 · ESC 暂停 · R 重开</div>
      {!state.locked && <div className="assault-lock-hint">点击画面捕获鼠标；也可按住拖动或使用方向键瞄准</div>}
      <button className="assault-pause" onClick={() => engine.current?.pause()}>暂停</button>
      <div className="assault-touch"><div className="assault-pad"><button aria-label="向前" {...move(0, 1)}>↑</button><div><button aria-label="向左" {...move(-1, 0)}>←</button><button aria-label="向后" {...move(0, -1)}>↓</button><button aria-label="向右" {...move(1, 0)}>→</button></div></div><button className="assault-fire" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); engine.current?.fire(true); }} onPointerUp={() => engine.current?.fire(false)} onPointerCancel={() => engine.current?.fire(false)} onLostPointerCapture={() => engine.current?.fire(false)}>开火</button></div>
    </>}
    {(!playing || error) && <div className="assault-overlay"><div className="assault-menu">
      <small className="assault-kicker">{state.phase === 'won' ? 'MISSION ACCOMPLISHED' : state.phase === 'dead' ? 'SIGNAL LOST' : state.phase === 'paused' ? 'STANDING BY' : 'INFILTRATE. DESTROY. ADVANCE.'}</small>
      <h1>{error ? '启动失败' : state.phase === 'won' ? '基地已瓦解。' : state.phase === 'dead' ? '任务中断。' : state.phase === 'paused' ? '稍作休整。' : <>纵深<br/><em>突击。</em></>}</h1>
      <p>{error || (state.phase === 'title' ? '四道防线，一颗机械心脏。清除守卫、击碎核心，向基地最深处推进。' : state.phase === 'won' ? `四道防线全部突破，最终得分 ${state.score}。` : state.phase === 'dead' ? '用侧移躲避红色弹丸，利用掩体。每通过一间房间可恢复装甲。' : '准备好了，就继续向前。')}</p>
      {!error && <button className="assault-primary" onClick={() => state.phase === 'paused' ? engine.current?.resume() : engine.current?.start()}>{state.phase === 'title' ? '开始突击' : state.phase === 'paused' ? '继续行动' : '重新部署'} <span>↗</span></button>}
      {error && <button className="assault-primary" onClick={() => location.reload()}>重新加载</button>}
      {state.phase === 'title' && <div className="assault-manual"><span>01 / 清守卫，解除核心护盾</span><span>02 / 打核心，过闸门回血升级</span><span>03 / 摧毁最终 Boss 的三个弱点</span></div>}
    </div><div className="assault-stamp">BROWSER ARCADE<br/>ORIGINAL PROCEDURAL WORLD<br/><b>NO DOWNLOAD REQUIRED</b></div></div>}
  </div>;
}
