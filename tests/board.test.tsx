import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'my-board',
  component: 'Pane',
  requestId: 'my-board',
  props: {
    title: 'Claude 보드',
    isFocused: false,
    bodyColumns: 48,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const NOW = Date.parse('2026-11-09T15:00:00Z')
const BOARD = {
  at: NOW,
  context: {
    tokens: 155723,
    window: 1000000,
    percent: 16,
    segments: [
      { name: '대화', tokens: 72567 },
      { name: '시스템 도구', tokens: 29844 },
      { name: '커넥터 도구', tokens: 29014 },
    ],
    buffer: 33000,
    model: 'claude-opus-5-5',
  },
  limits: [
    { kind: 'five_hour', percent: 11, resetsAt: '2026-11-09T16:30:00.000Z' },
    { kind: 'seven_day', percent: 85, resetsAt: '2026-11-09T22:00:00.000Z' },
  ],
  costUsd: 2.62,
  connectors: [
    { name: 'Notion', group: '문서·노트', tools: 78 },
    { name: 'Gmail', group: '소통·일정', tools: 30 },
  ],
  settings: { model: 'claude-opus-5-5', outputStyle: 'default', permissionMode: 'default', theme: 'dark' },
  history: [
    { t: NOW - 3_600_000, five: 5, week: 80, ctx: 10 },
    { t: NOW, five: 11, week: 85, ctx: 16 },
  ],
  errors: [],
}

test('the board draws on every surface', async ($, on) => {
  on('state.get', (_, e) => {
    const key = (e as { key?: string; ref?: { key?: string } }).key ?? (e as { ref?: { key?: string } }).ref?.key
    return { value: { value: key === 'data' ? { shape: 'data-1', value: BOARD } : null, version: 1 } }
  })
  on('clock.now', () => ({ value: NOW }))

  for (const surface of ['desktop', 'terminal', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    if (surface === 'desktop') expect((await ui.findAll({ type: 'Svg' })).length).toBe(3)
    expect((await ui.find({ type: 'Text', text: /^Claude 보드$/ }))?.text).toBe('Claude 보드')
    expect((await ui.find({ type: 'Text', text: /Notion/ }))?.text).toBe('Notion')
    await ui.unmount()
  }
})
