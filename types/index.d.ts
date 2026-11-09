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

declare module 'claude-code' {
  interface PluginState {
    'my-board': { data: Shaped<BoardData | null>; busy: string | null }
  }
}
