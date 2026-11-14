import type { Scene, WebGLRenderer } from 'three';
export interface GameContext {
  renderer?: WebGLRenderer;
  scene?: Scene;
  render?: { dispose?: () => void };
  game?: { state: string; pause: () => void; resume: () => void; start: (options?: { skipIntro?: boolean; quick?: boolean }) => void };
  input?: { exitLock?: () => void; setGameplay?: (enabled: boolean) => void };
  events?: { on: (type: string, listener: () => void) => () => void };
}
export function startGame(options?: { onReady?: () => void; onContext?: (context: GameContext) => void }): Promise<GameContext>;
