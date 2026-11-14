import { lazy } from 'react';

export const games = {
  'jimao': lazy(() => import('./games/jimao')),
  'crystal-world': lazy(() => import('./games/crystal-world')),
  'neon-racer': lazy(() => import('./games/neon-racer')),
};
