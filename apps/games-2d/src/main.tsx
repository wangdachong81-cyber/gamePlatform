import { createRoot, type Root } from 'react-dom/client';
import { mountGameApplication } from '@youxi/game-sdk';
import App from './App';
import '@youxi/game-sdk/styles.css';
let root: Root | undefined;
mountGameApplication(
  () => { root ??= createRoot(document.getElementById('root')!); root.render(<App/>); },
  () => { root?.unmount(); root = undefined; },
);
