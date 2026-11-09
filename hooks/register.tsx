import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { BoardData, Connector, Limit, Sample, Segment, Settings } from '../types'

// ─── constants ──────────────────────────────────────────────────────────────

const PANE = 'my-board'
const TITLE = 'Claude 보드'
const HISTORY_KEY = 'history-v1'
const ALERTS_KEY = 'alerts-v1'
const HISTORY_MAX = 240

const data = atom({ plugin: 'my-board', key: 'data' } as const, null, { shape: 'data-1' })
const busy = atom({ plugin: 'my-board', key: 'busy' } as const, null)

// claude.ai connectors arrive as ids; the names come from the app's connector list.
const CONNECTORS: Record<string, { name: string; group: string }> = {
  'c5099e57-a99c-416c-a4bd-07a186eea3c8': { name: 'Notion', group: '문서·노트' },
  '8d7c375e-e32b-4ceb-bdbc-3f3627734f20': { name: 'Google Docs', group: '문서·노트' },
  '1f328096-7e9b-4c3e-8f56-6c84b04f2801': { name: 'Google Sheets', group: '문서·노트' },
  '1a59c906-04da-521d-bda7-7f71b9f9e01c': { name: 'Claude Docs', group: '문서·노트' },
  '312e4d41-e30e-4b1e-a156-df5b0b1dc578': { name: 'Google Drive', group: '파일' },
  '2c329b58-3d52-468c-aabb-b26fcb44ae80': { name: 'Dropbox', group: '파일' },
  '264c3014-3301-438c-80f3-8c133020fbbe': { name: 'Gmail', group: '소통·일정' },
  '3a882acb-0b3b-4d36-a970-95f7b921c86e': { name: 'Google Calendar', group: '소통·일정' },
  '8549a66e-ac75-4658-b7c3-c13fa6f01e34': { name: 'Plaud', group: '소통·일정' },
  '899fc4c9-b864-4e62-8321-5e907a582bfd': { name: 'Canva', group: '디자인' },
  'e4a50ff4-e1ff-4fa1-85dd-0e7f87e0893c': { name: 'Adobe', group: '디자인' },
  '71118d6b-a62f-47ac-bc47-9c76af95cca4': { name: 'Supabase', group: '데이터' },
  Control_Chrome: { name: 'Chrome 제어', group: '브라우저·자동화' },
  'claude-in-chrome': { name: 'Claude in Chrome', group: '브라우저·자동화' },
  'scheduled-tasks': { name: '예약 작업', group: '브라우저·자동화' },
}
const GROUP_ORDER = ['문서·노트', '파일', '소통·일정', '디자인', '데이터', '브라우저·자동화', '기타']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const SEGMENT_NAMES: Record<string, string> = {
  Messages: '대화',
  'System tools': '시스템 도구',
  'MCP tools': '커넥터 도구',
  'System prompt': '시스템 지침',
  Skills: '스킬',
  'Memory files': '메모리',
  'Custom agents': '에이전트',
  'MCP server instructions': '커넥터 안내',
}
const SEGMENT_COLORS = ['#60a5fa', '#a78bfa', '#f472b6', '#fbbf24', '#34d399', '#2dd4bf', '#fb923c', '#94a3b8']

const MODEL_OPTIONS = [
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'fable', label: 'Fable' },
  { value: 'haiku', label: 'Haiku' },
]
const STYLE_OPTIONS = [
  { value: 'default', label: '기본' },
  { value: 'Concise', label: '간결' },
  { value: 'Explanatory', label: '설명형' },
  { value: 'Learning', label: '학습형' },
]
const PERMISSION_OPTIONS = [
  { value: 'default', label: '매번 확인' },
  { value: 'plan', label: '계획 먼저' },
  { value: 'acceptEdits', label: '편집 자동' },
  { value: 'auto', label: '자동' },
]

// ─── palette ────────────────────────────────────────────────────────────────

type Palette = {
  text: string
  sub: string
  faint: string
  track: string
  card: string
  border: string
  chip: string
}
const DARK: Palette = {
  text: '#eef0f6',
  sub: '#9097a8',
  faint: '#5d6375',
  track: '#ffffff14',
  card: '#ffffff08',
  border: '#ffffff1a',
  chip: '#ffffff0d',
}
const LIGHT: Palette = {
  text: '#141722',
  sub: '#5d6375',
  faint: '#9aa0b0',
  track: '#0f172a14',
  card: '#0f172a06',
  border: '#0f172a1a',
  chip: '#0f172a0a',
}
const paletteFor = (theme: string) => (theme.startsWith('light') ? LIGHT : DARK)

const RINGS: Record<string, { label: string; from: string; to: string }> = {
  five_hour: { label: '5시간', from: '#67e8f9', to: '#3b82f6' },
  seven_day: { label: '주간', from: '#d8b4fe', to: '#6366f1' },
  context: { label: '컨텍스트', from: '#6ee7b7', to: '#14b8a6' },
}
const HOT = { from: '#fda4af', to: '#f43f5e' }
const FONT = `-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', 'Segoe UI', sans-serif`

const level = (p: number) => (p >= 80 ? '위험' : p >= 50 ? '주의' : '여유')
const levelColor = (p: number) => (p >= 80 ? '#fb7185' : p >= 50 ? '#fbbf24' : '#34d399')

// ─── small helpers ──────────────────────────────────────────────────────────

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err))
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const kTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : `${n}`

const untilText = (iso: string | undefined, now: number) => {
  if (!iso) return ''
  const ms = Date.parse(iso) - now
  if (!Number.isFinite(ms)) return ''
  if (ms <= 0) return '곧 초기화'
  const d = Math.floor(ms / 86_400_000)
  const h = Math.floor((ms % 86_400_000) / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  if (d > 0) return `${d}일 ${h}시간 후 초기화`

  return `${h > 0 ? `${h}시간 ` : ''}${m}분 후 초기화`
}

const clockText = (t: number) => {
  const d = new Date(t)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')

  return `${hh}:${mm}`
}

const modelKey = (v: string) => {
  const s = v.toLowerCase()

  return s.includes('opus') ? 'opus' : s.includes('sonnet') ? 'sonnet' : s.includes('fable') ? 'fable' : s.includes('haiku') ? 'haiku' : s
}

// ─── SVG builders ───────────────────────────────────────────────────────────

type RingRow = { key: string; label: string; percent: number; sub: string }

function ringsSvg(rows: RingRow[], pal: Palette) {
  const cx = 92
  const cy = 98
  const radii = [78, 60, 42]
  const w = 12
  let defs = ''
  let arcs = ''
  rows.forEach((row, i) => {
    const r = radii[i] ?? 30
    const c = 2 * Math.PI * r
    const pct = Math.max(0, Math.min(100, row.percent))
    const len = (c * pct) / 100
    const g = row.percent >= 80 ? HOT : (RINGS[row.key] ?? HOT)
    defs += `<linearGradient id="g${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${g.from}"/><stop offset="1" stop-color="${g.to}"/></linearGradient>`
    arcs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${pal.track}" stroke-width="${w}"/>`
    if (len > 0.5) {
      arcs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#g${i})" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${len.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})" filter="url(#glow)"><title>${esc(row.label)} ${row.percent}%</title><animate attributeName="stroke-dasharray" from="0 ${c.toFixed(1)}" to="${len.toFixed(1)} ${c.toFixed(1)}" dur="1.1s" begin="${(i * 0.12).toFixed(2)}s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.16 1 0.3 1"/></circle>`
    }
  })
  const top = rows.reduce((a, b) => (b.percent > a.percent ? b : a), rows[0] ?? { key: '', label: '', percent: 0, sub: '' })
  let legend = ''
  rows.forEach((row, i) => {
    const y = 26 + i * 60
    const g = row.percent >= 80 ? HOT : (RINGS[row.key] ?? HOT)
    legend += `<circle cx="196" cy="${y - 5}" r="4" fill="${g.from}"/>`
    legend += `<text x="208" y="${y}" font-size="12" fill="${pal.sub}">${esc(row.label)}</text>`
    legend += `<text x="330" y="${y}" font-size="11" fill="${levelColor(row.percent)}" text-anchor="end">${level(row.percent)}</text>`
    legend += `<text x="196" y="${y + 24}" font-size="22" font-weight="700" fill="${pal.text}" style="font-variant-numeric: tabular-nums">${row.percent}<tspan font-size="13" font-weight="500" fill="${pal.sub}">%</tspan></text>`
    legend += `<text x="196" y="${y + 40}" font-size="10.5" fill="${pal.faint}">${esc(row.sub)}</text>`
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 196" width="340" height="196" font-family="${FONT}">
<defs>${defs}<filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
${arcs}
<text x="${cx}" y="${cy + 2}" text-anchor="middle" font-size="24" font-weight="800" fill="${pal.text}" style="font-variant-numeric: tabular-nums">${top.percent}<tspan font-size="12" fill="${pal.sub}">%</tspan></text>
<text x="${cx}" y="${cy + 19}" text-anchor="middle" font-size="10" fill="${pal.sub}">가장 높은 · ${esc(top.label)}</text>
${legend}
</svg>`
}

function contextSvg(ctx: BoardData['context'], pal: Palette) {
  const x0 = 4
  const W = 332
  const y = 4
  const h = 14
  const scale = (n: number) => (W * n) / Math.max(1, ctx.window)
  let x = x0
  let segs = ''
  const shown = ctx.segments.slice(0, 8)
  shown.forEach((s, i) => {
    const sw = scale(s.tokens)
    if (sw < 0.4) return
    segs += `<rect x="${x.toFixed(1)}" y="${y}" width="${sw.toFixed(1)}" height="${h}" fill="${SEGMENT_COLORS[i] ?? '#94a3b8'}"><title>${esc(s.name)} ${kTokens(s.tokens)}</title></rect>`
    x += sw
  })
  const bw = scale(ctx.buffer)
  const buffer =
    bw > 0.5
      ? `<rect x="${(x0 + W - bw).toFixed(1)}" y="${y}" width="${bw.toFixed(1)}" height="${h}" fill="url(#stripe)"><title>자동 압축 구간 ${kTokens(ctx.buffer)}</title></rect>`
      : ''
  let legend = ''
  const items = [...shown.map((s, i) => ({ name: s.name, tokens: s.tokens, fill: SEGMENT_COLORS[i] ?? '#94a3b8' }))]
  if (ctx.buffer > 0) items.push({ name: '압축 구간', tokens: ctx.buffer, fill: 'url(#stripe)' })
  items.forEach((s, i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    const lx = 4 + col * 112
    const ly = 40 + row * 18
    legend += `<rect x="${lx}" y="${ly - 8}" width="8" height="8" rx="2" fill="${s.fill}"/>`
    legend += `<text x="${lx + 13}" y="${ly}" font-size="10.5" fill="${pal.sub}">${esc(s.name)} <tspan fill="${pal.text}" font-weight="600">${kTokens(s.tokens)}</tspan></text>`
  })
  const rows = Math.ceil(items.length / 3)
  const H = 40 + Math.max(0, rows - 1) * 18 + 8

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 ${H}" width="340" height="${H}" font-family="${FONT}">
<defs>
<clipPath id="bar"><rect x="${x0}" y="${y}" width="${W}" height="${h}" rx="7"/></clipPath>
<pattern id="stripe" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${pal.track}"/><rect width="2.5" height="6" fill="${pal.faint}"/></pattern>
</defs>
<g clip-path="url(#bar)"><rect x="${x0}" y="${y}" width="${W}" height="${h}" fill="${pal.track}"/>${segs}${buffer}</g>
${legend}
</svg>`
}

function trendSvg(history: Sample[], now: number, pal: Palette) {
  const W = 340
  const H = 104
  const left = 26
  const right = 336
  const top = 22
  const bottom = 86
  const span = 6 * 3_600_000
  const from = now - span
  const pts = history.filter(s => s.t >= from)
  const X = (t: number) => left + ((right - left) * (t - from)) / span
  const Y = (p: number) => bottom - ((bottom - top) * Math.max(0, Math.min(100, p))) / 100
  const line = (key: 'five' | 'week' | 'ctx') => {
    const ps = pts.filter(s => typeof s[key] === 'number')
    if (ps.length < 2) return { d: '', area: '', last: ps[ps.length - 1] }
    const d = ps.map((s, i) => `${i ? 'L' : 'M'}${X(s.t).toFixed(1)} ${Y(s[key] as number).toFixed(1)}`).join(' ')
    const first = ps[0] as Sample
    const last = ps[ps.length - 1] as Sample
    const area = `${d} L${X(last.t).toFixed(1)} ${bottom} L${X(first.t).toFixed(1)} ${bottom} Z`

    return { d, area, last }
  }
  const five = line('five')
  const week = line('week')
  const ctx = line('ctx')
  const ticks = [0, 2, 4, 6]
    .map(hAgo => {
      const t = now - hAgo * 3_600_000
      const anchor = hAgo === 0 ? 'end' : hAgo === 6 ? 'start' : 'middle'
      return `<text x="${X(t).toFixed(1)}" y="${bottom + 13}" font-size="9" fill="${pal.faint}" text-anchor="${anchor}">${hAgo === 0 ? '지금' : `${hAgo}시간 전`}</text>`
    })
    .join('')
  const empty =
    !five.d && !week.d && !ctx.d
      ? `<text x="${(left + right) / 2}" y="${(top + bottom) / 2 + 4}" font-size="11" fill="${pal.faint}" text-anchor="middle">사용 기록을 모으는 중… 대화가 오갈수록 선이 그려집니다</text>`
      : ''
  const series = [
    { s: five, c: '#38bdf8', id: 'a5' },
    { s: week, c: '#a78bfa', id: 'aw' },
    { s: ctx, c: '#2dd4bf', id: 'ac' },
  ]
  const defs = series
    .map(
      x =>
        `<linearGradient id="${x.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${x.c}" stop-opacity="0.28"/><stop offset="1" stop-color="${x.c}" stop-opacity="0"/></linearGradient>`,
    )
    .join('')
  const paths = series
    .map(x =>
      x.s.d
        ? `<path d="${x.s.area}" fill="url(#${x.id})"/><path d="${x.s.d}" fill="none" stroke="${x.c}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>${
            x.s.last ? `<circle cx="${X(x.s.last.t).toFixed(1)}" cy="${Y((x.id === 'a5' ? x.s.last.five : x.id === 'aw' ? x.s.last.week : x.s.last.ctx) ?? 0).toFixed(1)}" r="3" fill="${x.c}"/>` : ''
          }`
        : '',
    )
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}">
<defs>${defs}</defs>
<text x="4" y="12" font-size="12" fill="${pal.sub}">최근 6시간 추이</text>
<g font-size="10" text-anchor="end">
<circle cx="206" cy="8" r="3" fill="#38bdf8"/><text x="236" y="12" fill="${pal.sub}">5시간</text>
<circle cx="250" cy="8" r="3" fill="#a78bfa"/><text x="276" y="12" fill="${pal.sub}">주간</text>
<circle cx="288" cy="8" r="3" fill="#2dd4bf"/><text x="336" y="12" fill="${pal.sub}">컨텍스트</text>
</g>
<line x1="${left}" x2="${right}" y1="${Y(80)}" y2="${Y(80)}" stroke="#fb7185" stroke-opacity="0.45" stroke-dasharray="3 4"/>
<line x1="${left}" x2="${right}" y1="${Y(50)}" y2="${Y(50)}" stroke="${pal.faint}" stroke-opacity="0.35" stroke-dasharray="3 4"/>
<line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" stroke="${pal.track}"/>
<text x="${left - 5}" y="${Y(80) + 3}" font-size="9" fill="#fb7185" text-anchor="end">80</text>
<text x="${left - 5}" y="${Y(50) + 3}" font-size="9" fill="${pal.faint}" text-anchor="end">50</text>
${paths}${empty}${ticks}
</svg>`
}

// ─── data collection ────────────────────────────────────────────────────────

async function collect($: EngineInterface, columns?: number) {
  const now = await $.clock.now()
  const errors: string[] = []

  let limits: Limit[] = []
  let costUsd: number | undefined
  let context: BoardData['context'] = { tokens: 0, window: 1, percent: 0, segments: [], buffer: 0, model: '' }
  try {
    const u = await $.session.usage({ breakdown: 'summary' })
    limits = u.rateLimits.map(r => ({ kind: r.kind, percent: r.percentUsed, resetsAt: r.resetsAt }))
    costUsd = u.cost?.usd
    const b = u.context.breakdown
    const segments: Segment[] = (b?.categories ?? [])
      .filter(c => !c.isDeferred && c.tokens > 0 && c.name !== 'Free space' && c.name !== 'Autocompact buffer')
      .sort((a, z) => z.tokens - a.tokens)
      .map(c => ({ name: SEGMENT_NAMES[c.name] ?? c.name, tokens: c.tokens }))
    const buffer = b?.categories.find(c => c.name === 'Autocompact buffer')?.tokens ?? 0
    context = {
      tokens: u.context.tokens ?? 0,
      window: u.context.window,
      percent: u.context.percent ?? 0,
      segments,
      buffer,
      model: b?.model ?? '',
    }
  } catch (err) {
    errors.push(`사용량: ${errText(err)}`)
  }

  const connectors: Connector[] = []
  try {
    const tools = await $.tool.list()
    const counts = new Map<string, number>()
    for (const t of tools) {
      if (!t.mcp) continue
      const server = t.name.split('__')[1] ?? ''
      counts.set(server, (counts.get(server) ?? 0) + 1)
    }
    for (const [server, n] of counts) {
      const known = CONNECTORS[server]
      if (known) connectors.push({ name: known.name, group: known.group, tools: n })
      else if (UUID.test(server)) connectors.push({ name: `새 커넥터 ${server.slice(0, 4)}`, group: '기타', tools: n })
    }
  } catch (err) {
    errors.push(`커넥터: ${errText(err)}`)
  }

  const settings: Settings = { model: '', outputStyle: '', permissionMode: '', theme: 'dark' }
  try {
    const rows = await $.config.list()
    const get = (k: string) => {
      const v = rows.find(r => r.key === k)?.value
      return typeof v === 'string' ? v : ''
    }
    settings.model = get('model')
    settings.outputStyle = get('outputStyle')
    settings.permissionMode = get('permissionMode')
    settings.theme = get('theme') || 'dark'
  } catch (err) {
    errors.push(`설정: ${errText(err)}`)
  }

  // history across sessions, one sample at most per 2 minutes unless a value moved
  let history: Sample[] = []
  try {
    const stored = await $.store.get(HISTORY_KEY)
    history = Array.isArray(stored) ? (stored as Sample[]) : []
    const five = limits.find(l => l.kind === 'five_hour')?.percent
    const week = limits.find(l => l.kind === 'seven_day')?.percent
    const sample: Sample = { t: now, five, week, ctx: context.percent }
    const last = history[history.length - 1]
    const moved = !last || last.five !== five || last.week !== week || last.ctx !== sample.ctx
    if (moved || now - last.t > 120_000) {
      history = [...history, sample].filter(s => now - s.t < 24 * 3_600_000).slice(-HISTORY_MAX)
      await $.store.set(HISTORY_KEY, history)
    }
  } catch (err) {
    errors.push(`기록: ${errText(err)}`)
  }

  const board: BoardData = { at: now, context, limits, costUsd, connectors, settings, history, columns, errors }

  return board
}

async function alertIfHot($: EngineInterface, board: BoardData) {
  const rows = [
    ...board.limits.map(l => ({ id: l.kind, label: RINGS[l.kind]?.label ?? l.kind, p: l.percent, window: l.resetsAt ?? '' })),
    { id: 'context', label: '컨텍스트', p: board.context.percent, window: 'session' },
  ]
  const storedAlerts = await $.store.get(ALERTS_KEY)
  const alerts: Record<string, string> =
    storedAlerts && typeof storedAlerts === 'object' ? { ...(storedAlerts as Record<string, string>) } : {}
  let changed = false
  for (const r of rows) {
    const step = r.p >= 95 ? '95' : r.p >= 80 ? '80' : ''
    const mark = `${r.window}:${step}`
    if (step && alerts[r.id] !== mark) {
      $.ui.toast(`⚠ ${r.label} 사용량 ${r.p}% — ${step === '95' ? '거의 다 찼어요' : '80%를 넘었어요'}`)
      alerts[r.id] = mark
      changed = true
    }
    if (!step && alerts[r.id]) {
      delete alerts[r.id]
      changed = true
    }
  }
  if (changed) await $.store.set(ALERTS_KEY, alerts)
}

function statusLine(board: BoardData) {
  const five = board.limits.find(l => l.kind === 'five_hour')
  const week = board.limits.find(l => l.kind === 'seven_day')
  const dot = (p: number) => (p >= 80 ? '🔴' : p >= 50 ? '🟡' : '🟢')
  const max = Math.max(five?.percent ?? 0, week?.percent ?? 0, board.context.percent)

  return [
    dot(max),
    five ? `5시간 ${five.percent}%` : undefined,
    week ? `주간 ${week.percent}%` : undefined,
    `컨텍스트 ${board.context.percent}%`,
  ]
    .filter(Boolean)
    .join(' · ')
}

async function refresh($: EngineInterface, columns?: number) {
  const board = await collect($, columns)
  await update($, data, () => board)
  $.ui.status(statusLine(board))
  try {
    await alertIfHot($, board)
  } catch {
    // an alert that cannot be stored is shown again later; nothing else depends on it
  }
}

async function applySetting($: EngineInterface, key: string, value: string, label: string) {
  await update($, busy, () => `${label}(으)로 바꾸는 중…`)
  try {
    const r = await $.config.set({ key, value })
    if ('deny' in r && r.deny) {
      $.ui.toast(`바꾸지 못했어요: ${String(r.deny)}`)
    } else {
      $.ui.toast(`${label}(으)로 바꿨어요`)
    }
  } catch (err) {
    $.ui.toast(`바꾸지 못했어요: ${errText(err)}`)
  }
  await update($, busy, () => null)
  await refresh($)
}

// ─── hooks ──────────────────────────────────────────────────────────────────

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: 'board', description: 'Claude 보드를 열고 값을 새로 읽기' })
    void $.ui.open({ id: PANE, title: TITLE })
    await refresh($)

    return result
  })

  on('session.measure', async ($, e, next) => {
    await refresh($)

    return next(e)
  })

  on('command.run', { command: 'board' }, async $ => {
    await refresh($)
    const opened = await $.ui.open({ id: PANE, title: TITLE })

    return { text: opened.isPlaced ? 'Claude 보드를 새로 읽었어요.' : '값은 새로 읽었지만 보드를 그릴 화면이 없어요.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Svg = 'Svg' in els ? els.Svg : undefined
    const board = await read($, data)
    const working = await read($, busy)
    if (!board) return <Text dimColor>보드를 준비하는 중…</Text>

    const pal = paletteFor(board.settings.theme)
    const now = await $.clock.now()
    const ringRows: RingRow[] = [
      ...(['five_hour', 'seven_day'] as const).map(kind => {
        const l = board.limits.find(x => x.kind === kind)
        return {
          key: kind,
          label: RINGS[kind]?.label ?? kind,
          percent: l?.percent ?? 0,
          sub: l ? untilText(l.resetsAt, now) : '응답 후 표시',
        }
      }),
      {
        key: 'context',
        label: '컨텍스트',
        percent: board.context.percent,
        sub: `${kTokens(board.context.tokens)} / ${kTokens(board.context.window)}`,
      },
    ]

    const card = (title: string, right: string | undefined, children: RenderChildren) => (
      <Box
        flexDirection="column"
        gap="sm"
        padding="md"
        borderStyle="round"
        borderColor={pal.border}
        backgroundColor={pal.card}
      >
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Text size="caption" weight="semibold" color={pal.sub}>
            {title}
          </Text>
          {right ? (
            <Text size="caption" color={pal.faint} tabular>
              {right}
            </Text>
          ) : null}
        </Box>
        {children}
      </Box>
    )

    const chart = (source: string, alt: string, isInteractive: boolean) =>
      Svg ? (
        <Svg source={source} alt={alt} isInteractive={isInteractive || undefined} />
      ) : (
        <Text size="caption" color={pal.sub}>
          {alt}
        </Text>
      )

    const segmented = (key: string, current: string, options: { value: string; label: string }[]) => (
      <Box flexDirection="row" flexWrap="wrap" gap="xs">
        {options.map(o => (
          <Button
            key={`${key}:${o.value}`}
            label={o.label}
            variant={current === o.value ? 'primary' : 'secondary'}
            onPress={() => {
              if (current !== o.value) void applySetting($, key, o.value, o.label)
            }}
          />
        ))}
      </Box>
    )

    const groups = GROUP_ORDER.map(g => ({ g, list: board.connectors.filter(c => c.group === g) })).filter(
      x => x.list.length > 0,
    )
    const totalTools = board.connectors.reduce((a, c) => a + c.tools, 0)
    const currentModel = modelKey(board.settings.model || board.context.model)

    return (
      <Box flexDirection="column" gap="md" paddingY="sm">
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Box flexDirection="column">
            <Text size="title" weight="bold" color={pal.text}>
              Claude 보드
            </Text>
            <Text size="caption" color={pal.faint}>
              {board.context.model || '모델 확인 중'} · 세션 비용 ${(board.costUsd ?? 0).toFixed(2)}
            </Text>
          </Box>
          <Box flexDirection="column" alignItems="flex-end">
            <Text size="caption" color="#34d399">
              ● 실시간
            </Text>
            <Text size="caption" color={pal.faint} tabular>
              {clockText(board.at)} 갱신
            </Text>
          </Box>
        </Box>

        {card(
          '사용량',
          undefined,
          chart(ringsSvg(ringRows, pal), ringRows.map(r => `${r.label} ${r.percent}%`).join(', '), true),
        )}

        {card(
          '컨텍스트 구성',
          `${kTokens(board.context.tokens)} / ${kTokens(board.context.window)} · ${board.context.percent}%`,
          chart(contextSvg(board.context, pal), `컨텍스트 ${kTokens(board.context.tokens)} / ${kTokens(board.context.window)}`, true),
        )}

        {card(
          '추이',
          undefined,
          chart(trendSvg(board.history, now, pal), '최근 6시간 사용량 추이', false),
        )}

        {card(
          '빠른 전환',
          working ?? undefined,
          <Box flexDirection="column" gap="sm">
            <Text size="caption" color={pal.faint}>
              모델
            </Text>
            {segmented('model', currentModel, MODEL_OPTIONS)}
            <Text size="caption" color={pal.faint}>
              답변 스타일
            </Text>
            {segmented('outputStyle', board.settings.outputStyle, STYLE_OPTIONS)}
            <Text size="caption" color={pal.faint}>
              권한 모드
            </Text>
            {segmented('permissionMode', board.settings.permissionMode, PERMISSION_OPTIONS)}
          </Box>,
        )}

        {card(
          '연결된 데이터',
          `${board.connectors.length}곳 · 도구 ${totalTools}개`,
          <Box flexDirection="column" gap="sm">
            {groups.map(({ g, list }) => (
              <Box flexDirection="column" gap="xs">
                <Text size="caption" color={pal.faint}>
                  {g}
                </Text>
                <Box flexDirection="row" flexWrap="wrap" gap="xs">
                  {list.map(c => (
                    <Box
                      key={`conn:${c.name}`}
                      flexDirection="row"
                      gap="xs"
                      paddingX="sm"
                      paddingY="xs"
                      borderStyle="round"
                      borderColor={pal.border}
                      backgroundColor={pal.chip}
                      hover={{ borderColor: '#34d399' }}
                    >
                      <Text size="footnote" color="#34d399">
                        ●
                      </Text>
                      <Text size="footnote" color={pal.text}>
                        {c.name}
                      </Text>
                      <Text size="footnote" color={pal.faint} tabular>
                        {c.tools}
                      </Text>
                    </Box>
                  ))}
                </Box>
              </Box>
            ))}
            <Text size="caption" color={pal.faint}>
              끊긴 커넥터는 앱 오른쪽 '커넥터' 칸에서 확인할 수 있어요
            </Text>
          </Box>,
        )}

        {board.errors.length > 0 ? (
          <Text size="caption" color="#fb7185">
            {board.errors.join(' / ')}
          </Text>
        ) : null}

        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Button key="refresh" label="새로 고침" variant="secondary" onPress={() => void refresh($, e.viewport?.columns)} />
          <Text size="caption" color={pal.faint}>
            /board 로도 열 수 있어요
          </Text>
        </Box>
      </Box>
    )
  })
}
