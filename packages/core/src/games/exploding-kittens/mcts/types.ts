// ── MCTS Node ───────────────────────────────────────────────────────────────

export interface MCTSNode {
  actionKey: string;
  parent: MCTSNode | null;
  children: Map<string, MCTSNode>;
  visits: number;
  totalReward: number;
}

// ── Configuration ───────────────────────────────────────────────────────────

export interface MCTSConfig {
  iterations: number;
  explorationConstant: number;
}

export const DEFAULT_MCTS_CONFIG: MCTSConfig = {
  iterations: 2000,
  explorationConstant: 1.0,
};
