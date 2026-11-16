import { lazy } from 'react';

export const games = {
  'snake': lazy(() => import('./games/snake')),
  'star-catcher': lazy(() => import('./games/star-catcher')),
};
