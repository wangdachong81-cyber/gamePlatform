import { Suspense, useEffect, useState } from 'react';
import { getRouteGameId } from '@youxi/game-sdk';
import { games } from './registry';

export default function App() {
  const [gameId, setGameId] = useState(() => getRouteGameId('star-catcher'));
  useEffect(() => {
    const change = () => setGameId(getRouteGameId('star-catcher'));
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  const Game = games[gameId as keyof typeof games];
  if (!Game) return <div className="game-empty"><h1>这个游戏还在开发中</h1><a href="#/games/star-catcher">体验示例游戏</a></div>;
  return <Suspense fallback={<div className="game-empty" role="status">正在加载游戏资源…</div>}><Game key={gameId}/></Suspense>;
}
