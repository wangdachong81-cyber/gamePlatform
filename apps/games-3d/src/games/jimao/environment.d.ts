import type { GameContext } from './runtime/bootstrap';
export function initializeEnvironment(root: ShadowRoot): () => void;
export function getGameContext(): GameContext | undefined;
export function getGameStats(): { state?: string; fps?: number } | undefined;
