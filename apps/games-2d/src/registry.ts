import { lazy } from 'react';

export const games = {
  'star-catcher': lazy(() => import('./games/star-catcher')),
};
