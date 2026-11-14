import type { GameCommand, PlatformBridge } from '@youxi/contracts';

type GameWindow = Window & {
  $wujie?: { props?: { bridge?: PlatformBridge } };
  __POWERED_BY_WUJIE__?: boolean;
  __WUJIE_MOUNT?: () => void;
  __WUJIE_UNMOUNT?: () => void;
  __WUJIE?: { mount: () => void };
};

export function mountGameApplication(mount: () => void, unmount: () => void) {
  const runtime = window as GameWindow;
  if (runtime.__POWERED_BY_WUJIE__) {
    runtime.__WUJIE_MOUNT = mount;
    runtime.__WUJIE_UNMOUNT = unmount;
    runtime.__WUJIE?.mount();
  } else mount();
}

export function createGameClient(gameId: string) {
  const bridge = (window as GameWindow).$wujie?.props?.bridge;
  return {
    ready: () => bridge?.emit({ type: 'ready', gameId }),
    score: (score: number) => bridge?.emit({ type: 'score', gameId, score }),
    error: (message: string) => bridge?.emit({ type: 'error', gameId, message }),
    onCommand: (listener: (command: GameCommand) => void) => bridge?.subscribe(listener) ?? (() => {}),
  };
}

export function getRouteGameId(fallback: string) {
  return window.location.hash.match(/^#\/games\/([a-z0-9-]+)$/)?.[1] ?? fallback;
}
