import { z } from 'zod';

const entrySchema = z.string().refine((value) => {
  try {
    const url = new URL(value, 'https://platform.example');
    return ['https:', 'http:'].includes(url.protocol) && !url.hash && !url.search;
  } catch { return false; }
}, 'entry 必须为 HTTP(S) 地址或站内路径，且不含 query/hash');

export const catalogSchema = z.object({
  schemaVersion: z.literal(1),
  apps: z.record(z.string(), z.object({
    name: z.string().min(1),
    dimension: z.enum(['2d', '3d']),
    entry: entrySchema,
  })),
  games: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    appId: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
    icon: z.string().min(1),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    openMode: z.enum(['embedded', 'new-tab']),
    enabled: z.boolean().default(true),
    sort: z.number().default(0),
    accent: z.enum(['mint', 'orange', 'purple', 'blue']).default('mint'),
    status: z.enum(['playable', 'coming-soon']).default('playable'),
  })),
}).superRefine((catalog, ctx) => {
  const ids = new Set<string>();
  catalog.games.forEach((game, index) => {
    if (ids.has(game.id)) ctx.addIssue({ code: 'custom', path: ['games', index, 'id'], message: '游戏 ID 重复' });
    if (!catalog.apps[game.appId]) ctx.addIssue({ code: 'custom', path: ['games', index, 'appId'], message: '子平台不存在' });
    ids.add(game.id);
  });
});

export type Catalog = z.infer<typeof catalogSchema>;
export type GameInfo = Catalog['games'][number];
export type Dimension = '2d' | '3d';
export type GameCommand = 'pause' | 'resume' | 'restart';
export type GameEvent =
  | { type: 'ready'; gameId: string }
  | { type: 'score'; gameId: string; score: number }
  | { type: 'error'; gameId: string; message: string };
export interface PlatformBridge {
  emit: (event: GameEvent) => void;
  subscribe: (listener: (command: GameCommand) => void) => () => void;
}

export function getGameUrl(catalog: Catalog, game: GameInfo): string {
  const entry = new URL(catalog.apps[game.appId].entry, window.location.origin);
  entry.hash = `/games/${game.id}`;
  return entry.href;
}
