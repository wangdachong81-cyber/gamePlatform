import { useEffect, useRef, useState } from 'react';
import { createGameClient } from '@youxi/game-sdk';
import { initializeEnvironment, getGameContext } from './environment.js';
import { startGame, type GameContext } from './runtime/bootstrap.js';
import markup from './markup.html?raw';
import css from './game.css?raw';

function disposeGame(context?: GameContext) {
  context?.renderer?.setAnimationLoop(null);
  context?.input?.setGameplay?.(false);
  context?.input?.exitLock?.();
  const resources = new Set<{ dispose: () => void }>();
  context?.scene?.traverse(object => {
    const mesh = object as typeof object & { geometry?: { dispose: () => void }; material?: import('three').Material | import('three').Material[] };
    if (mesh.geometry) resources.add(mesh.geometry);
    const materials = mesh.material ? Array.isArray(mesh.material) ? mesh.material : [mesh.material] : [];
    for (const material of materials) {
      resources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
    }
  });
  resources.forEach(resource => resource.dispose());
  context?.render?.dispose?.();
  context?.scene?.clear();
}

export default function JimaoGame() {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const client = createGameClient('jimao');
    const element = host.current!;
    const root = element.shadowRoot ?? element.attachShadow({ mode: 'open' });
    const style = document.createElement('style'); style.textContent = css;
    root.innerHTML = markup; root.prepend(style);
    const closeEnvironment = initializeEnvironment(root);
    const previousTitle = document.title;
    document.title = '几猫国产3A大作 · 游隙';
    let disposed = false;
    let context: GameContext | undefined;
    let unsubscribeScore = () => {};
    const unsubscribeCommands = client.onCommand(command => {
      if (command === 'pause') context?.game?.pause();
      if (command === 'resume') context?.game?.resume();
      if (command === 'restart') context?.game?.start({ skipIntro: true, quick: true });
    });
    void startGame({
      onReady: () => { if (!disposed) { element.dataset.ready = 'true'; client.ready(); } },
      onContext: value => { context = value; },
    }).then(value => {
      if (disposed) { disposeGame(value); return; }
      let kills = 0;
      unsubscribeScore = value.events?.on('enemy:killed', () => client.score(++kills * 100)) ?? (() => {});
    }).catch(cause => {
      if (disposed) return;
      const message = cause instanceof Error ? cause.message : '几猫游戏启动失败';
      setError(message); client.error(message);
    });
    const onPageHide = (event: PageTransitionEvent) => { if (event.persisted) context?.game?.pause(); };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      disposed = true;
      unsubscribeCommands(); unsubscribeScore();
      window.removeEventListener('pagehide', onPageHide);
      disposeGame(context ?? getGameContext());
      closeEnvironment(); root.replaceChildren();
      document.title = previousTitle;
    };
  }, []);
  return <div style={{ width: '100%', height: '100%', minHeight: '100dvh', position: 'relative', background: '#0b0d0f' }}>
    <div ref={host} data-game="jimao" style={{ position: 'absolute', inset: 0, display: 'block' }}/>
    {error && <div role="alert" style={{ position: 'absolute', left: 16, right: 16, bottom: 16, zIndex: 100, color: '#ffb4a8', background: '#28100c', padding: 16 }}>游戏启动失败：{error}<button onClick={() => window.location.reload()} style={{ marginLeft: 16 }}>重新加载</button></div>}
  </div>;
}
