export type Limit = { kind: string; percent: number; resetsAt?: string }
export type Segment = { name: string; tokens: number }
export type Connector = { name: string; group: string; tools: number }
export type Sample = { t: number; five?: number; week?: number; ctx?: number }
export type Settings = { model: string; outputStyle: string; permissionMode: string; theme: string }

export type BoardData = {
  at: number
  context: { tokens: number; window: number; percent: number; segments: Segment[]; buffer: number; model: string }
  limits: Limit[]
  costUsd?: number
  connectors: Connector[]
  settings: Settings
  history: Sample[]
  columns?: number
  errors: string[]
}

// ─── what Claude is doing now ───────────────────────────────────────────────

export type PlanItem = { content: string; status: 'pending' | 'in_progress' | 'completed' }
export type ToolEvent = { id: string; label: string; detail?: string; at: number; endedAt?: number; isAgent?: boolean }
export type Activity = {
  isWorking: boolean
  turnStartedAt?: number
  lastDurationMs?: number
  prompt?: string
  plan: PlanItem[]
  tools: ToolEvent[]
  tick: number
}

// ─── second brain ───────────────────────────────────────────────────────────

/** One conversation as scripts/conversations.py reads it. */
export type Conv = {
  id: string
  title: string
  first: string
  samples: string[]
  userMsgs: number
  tools: string[]
  startedAt?: string | null
  lastAt?: string | null
  mtimeMs: number
  size: number
}
/** What the model made of a conversation, kept in $.store. */
export type Tagged = { tags: string[]; summary: string; atMsgs: number }
/** Conversations with the same title folded into one node. */
export type BrainNode = {
  key: string
  title: string
  ids: string[]
  count: number
  userMsgs: number
  lastAt: number
  tags: string[]
  summary: string
  connectors: string[]
}
export type BrainView = {
  at: number
  status: string
  isBusy: boolean
  currentId: string
  nodes: BrainNode[]
  theme: string
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    'my-board': {
      data: Shaped<BoardData | null>
      busy: string | null
      activity: Shaped<Activity>
      brain: Shaped<BrainView | null>
    }
  }
}
