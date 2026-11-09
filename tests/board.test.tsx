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

const ACTIVITY = {
  isWorking: true,
  turnStartedAt: NOW - 75_000,
  prompt: '세컨드 브레인 만들어 줘',
  plan: [
    { content: '필요한 API 확인', status: 'completed' },
    { content: '세컨드 브레인 패널 만들기', status: 'in_progress' },
    { content: '화면에서 확인', status: 'pending' },
  ],
  tools: [
    { id: 't1', label: '파일 읽기', detail: 'register.tsx', at: NOW - 60_000, endedAt: NOW - 59_000 },
    { id: 't2', label: '명령 실행', detail: '검사 실행', at: NOW - 5_000 },
  ],
  tick: 3,
}

const node = (key: string, tags: string[], connectors: string[], extra: Record<string, unknown> = {}) => ({
  key,
  title: key,
  ids: [key],
  count: 1,
  userMsgs: 8,
  lastAt: NOW - 86_400_000,
  tags,
  summary: `${key} 요약`,
  connectors,
  ...extra,
})
const BRAIN = {
  at: NOW,
  status: '정리 완료 · 대화 4개',
  isBusy: false,
  currentId: 'board',
  theme: 'dark',
  nodes: [
    node('보드 만들기', ['모드 개발', '사용량', '노션 정리'], ['Notion'], { ids: ['board'] }),
    node('녹음 전사', ['녹음 전사', '회의록'], ['Plaud', 'Notion']),
    node('자료 정리', ['자료 정리', '노션 정리', '회의록'], ['Notion']),
    node('할 일 정리', ['일정 관리', '노션 정리'], ['Notion', 'Google Calendar']),
    node('영수증 모으기', ['영수증', '메일 정리'], ['Gmail']),
    node('반복 작업', ['디데이', '예약 작업'], [], { count: 6, ids: ['a', 'b', 'c', 'd', 'e', 'f'] }),
  ],
}

test('the brain pane draws its map and lists', async ($, on) => {
  on('state.get', (_, e) => {
    const key = (e as { key?: string; ref?: { key?: string } }).key ?? (e as { ref?: { key?: string } }).ref?.key
    return { value: { value: key === 'brain' ? { shape: 'brain-1', value: BRAIN } : null, version: 1 } }
  })
  on('clock.now', () => ({ value: NOW }))

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, requestId: 'my-brain', props: { ...PANE.props, title: '세컨드 브레인' }, surface })
    expect((await ui.find({ type: 'Text', text: /^세컨드 브레인$/ }))?.text).toBe('세컨드 브레인')
    expect((await ui.find({ type: 'Text', text: /녹음 전사 요약/ }))?.text).toBe('녹음 전사 요약')
    if (surface === 'desktop') expect((await ui.findAll({ type: 'Svg' })).length).toBe(1)
    await ui.unmount()
  }
})

test('the board draws on every surface', async ($, on) => {
  on('state.get', (_, e) => {
    const key = (e as { key?: string; ref?: { key?: string } }).key ?? (e as { ref?: { key?: string } }).ref?.key
    const value =
      key === 'data'
        ? { shape: 'data-1', value: BOARD }
        : key === 'activity'
          ? { shape: 'activity-1', value: ACTIVITY }
          : key === 'brain'
            ? { shape: 'brain-1', value: BRAIN }
            : null
    return { value: { value, version: 1 } }
  })
  on('clock.now', () => ({ value: NOW }))

  for (const surface of ['desktop', 'terminal', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    if (surface === 'desktop') expect((await ui.findAll({ type: 'Svg' })).length).toBe(3)
    expect((await ui.find({ type: 'Text', text: /세컨드 브레인 패널 만들기/ }))?.text).toBe('세컨드 브레인 패널 만들기')
    expect((await ui.find({ type: 'Text', text: /^Claude 보드$/ }))?.text).toBe('Claude 보드')
    expect((await ui.find({ type: 'Text', text: /Notion/ }))?.text).toBe('Notion')
    await ui.unmount()
  }
})
