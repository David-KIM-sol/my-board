// "지금 하는 일": what Claude is doing in this conversation, from the engine's
// own turn and tool events. Nothing is stored across sessions.

import { atom, read, update } from 'claude-code'
import type { BoxProps, ElementConstructor, EngineInterface, TextProps } from 'claude-code'

import { CONNECTORS, clockText } from './common'
import type { Palette } from './common'
import type { Activity, PlanItem, ToolEvent } from '../types'

const EMPTY: Activity = { isWorking: false, plan: [], tools: [], tick: 0 }
export const activity = atom({ plugin: 'my-board', key: 'activity' } as const, EMPTY, { shape: 'activity-1' })

const HIDDEN = new Set(['ToolSearch', 'mcp__ccd_turn__update_plan', 'mcp__ccd_turn__wrap_up', 'mcp__ccd_session__mark_chapter'])

const BUILTIN: Record<string, string> = {
  Read: '파일 읽기',
  Write: '파일 쓰기',
  Edit: '파일 고치기',
  NotebookEdit: '노트북 고치기',
  Bash: '명령 실행',
  Grep: '내용 검색',
  Glob: '파일 찾기',
  WebFetch: '웹 페이지 읽기',
  WebSearch: '웹 검색',
  Agent: '보조 에이전트',
  Skill: '스킬',
  AskUserQuestion: '질문하기',
  Artifact: '아티팩트',
  SendUserFile: '파일 보내기',
  TaskStop: '작업 멈추기',
}
const SERVER_NAMES: Record<string, string> = {
  ccd_session: '세션',
  ccd_session_mgmt: '세션 관리',
  ccd_connectors: '커넥터',
  ccd_view: '화면',
  Claude_Browser: '내장 브라우저',
  'claude-in-chrome': 'Chrome',
  Control_Chrome: 'Chrome 제어',
  'plugin-authoring': '모드',
}

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const base = (p: string) => p.split('/').filter(Boolean).pop() ?? p

function describe(tool: string, args: Record<string, unknown>): { label: string; detail?: string } {
  const str = (k: string) => (typeof args[k] === 'string' ? (args[k] as string) : undefined)
  if (BUILTIN[tool]) {
    const detail =
      tool === 'Bash'
        ? (str('description') ?? str('command'))
        : tool === 'Read' || tool === 'Write' || tool === 'Edit'
          ? (str('file_path') && base(str('file_path') as string))
          : tool === 'Grep' || tool === 'Glob'
            ? str('pattern')
            : tool === 'WebSearch'
              ? str('query')
              : tool === 'WebFetch'
                ? str('url')
                : tool === 'Agent'
                  ? str('description')
                  : tool === 'Skill'
                    ? str('skill')
                    : undefined
    return { label: BUILTIN[tool] as string, detail: detail ? short(detail, 48) : undefined }
  }
  if (tool.startsWith('mcp__')) {
    const [, server = '', name = ''] = tool.split('__')
    const who = CONNECTORS[server]?.name ?? SERVER_NAMES[server] ?? short(server, 14)
    return { label: who, detail: name.replace(/[-_]/g, ' ') }
  }

  return { label: tool }
}

function applyPlan(plan: PlanItem[], args: Record<string, unknown>): PlanItem[] {
  if (Array.isArray(args.items)) {
    return (args.items as { content?: unknown; status?: unknown }[]).map(it => ({
      content: String(it.content ?? ''),
      status: it.status === 'completed' || it.status === 'in_progress' ? it.status : 'pending',
    }))
  }
  let next = plan.map(p => ({ ...p }))
  if (args.advance === true) {
    const i = next.findIndex(p => p.status === 'in_progress')
    if (i >= 0) (next[i] as PlanItem).status = 'completed'
    const j = next.findIndex((p, k) => k > i && p.status === 'pending')
    if (j >= 0) (next[j] as PlanItem).status = 'in_progress'
  }
  if (Array.isArray(args.done)) {
    for (const n of args.done as unknown[]) {
      const item = next[Number(n) - 1]
      if (item) item.status = 'completed'
    }
  }
  if (typeof args.start === 'number') {
    next = next.map(p => (p.status === 'in_progress' ? { ...p, status: 'pending' } : p))
    const item = next[args.start - 1]
    if (item) item.status = 'in_progress'
  }

  return next
}

export async function onTurnStart($: EngineInterface, text: string) {
  const now = await $.clock.now()
  await update($, activity, a => ({ ...a, isWorking: true, turnStartedAt: now, prompt: short(text.replace(/\s+/g, ' ').trim(), 70) }))
}

export async function onTurnEnd($: EngineInterface, durationMs: number) {
  const now = await $.clock.now()
  await update($, activity, a => ({
    ...a,
    isWorking: false,
    lastDurationMs: durationMs,
    tools: a.tools.map(t => (t.endedAt ? t : { ...t, endedAt: now })),
  }))
}

export async function onToolStart($: EngineInterface, id: string, tool: string, args: Record<string, unknown>) {
  if (tool === 'mcp__ccd_turn__update_plan') {
    await update($, activity, a => ({ ...a, plan: applyPlan(a.plan, args) }))
    return
  }
  if (tool === 'mcp__ccd_turn__wrap_up') {
    await update($, activity, a => ({ ...a, plan: a.plan.map(p => ({ ...p, status: 'completed' as const })) }))
    return
  }
  if (HIDDEN.has(tool)) return
  const now = await $.clock.now()
  const { label, detail } = describe(tool, args)
  const ev: ToolEvent = { id, label, detail, at: now, isAgent: tool === 'Agent' }
  await update($, activity, a => ({ ...a, tools: [...a.tools, ev].slice(-30) }))
}

export async function onToolEnd($: EngineInterface, id: string) {
  const now = await $.clock.now()
  await update($, activity, a => ({ ...a, tools: a.tools.map(t => (t.id === id ? { ...t, endedAt: now } : t)) }))
}

export async function readActivity($: EngineInterface) {
  return read($, activity)
}

/** Bumps `tick` every few seconds while a turn runs, so the elapsed time moves. */
export async function tick($: EngineInterface) {
  const a = await read($, activity)
  if (a.isWorking) await update($, activity, x => ({ ...x, tick: x.tick + 1 }))
}

const elapsed = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)

  return m > 0 ? `${m}분 ${s % 60}초` : `${s}초`
}

export type Els = { Box: ElementConstructor<BoxProps>; Text: ElementConstructor<TextProps> }

/** The card's body; the board wraps it in its own card frame. */
export function activityBody(a: Activity, now: number, pal: Palette, els: Els) {
  const { Box, Text } = els
  const running = a.tools.filter(t => !t.endedAt)
  const agents = running.filter(t => t.isAgent).length
  const recent = a.tools.slice(-6).reverse()
  const statusText = a.isWorking
    ? `작업 중 · ${elapsed(now - (a.turnStartedAt ?? now))}`
    : a.lastDurationMs !== undefined
      ? `대기 · 마지막 작업 ${elapsed(a.lastDurationMs)}`
      : '대기'
  const icon = (s: PlanItem['status']) => (s === 'completed' ? '✔' : s === 'in_progress' ? '▶' : '○')
  const iconColor = (s: PlanItem['status']) => (s === 'completed' ? '#34d399' : s === 'in_progress' ? '#fbbf24' : pal.faint)
  const done = a.plan.filter(p => p.status === 'completed').length

  return (
    <Box flexDirection="column" gap="sm">
      <Box flexDirection="row" justifyContent="space-between" alignItems="center">
        <Text size="body" weight="semibold" color={a.isWorking ? '#fbbf24' : '#34d399'}>
          {a.isWorking ? '◉ ' : '● '}
          {statusText}
        </Text>
        {agents > 0 ? (
          <Text size="caption" color="#a78bfa">
            보조 에이전트 {agents}개 실행 중
          </Text>
        ) : null}
      </Box>
      {a.prompt ? (
        <Text size="caption" color={pal.sub} wrap="truncate-end">
          요청: {a.prompt}
        </Text>
      ) : null}
      {a.plan.length > 0 ? (
        <Box flexDirection="column" gap="xs">
          <Text size="caption" color={pal.faint}>
            단계 {done}/{a.plan.length}
          </Text>
          {a.plan.map(p => (
            <Box flexDirection="row" gap="sm">
              <Text size="footnote" color={iconColor(p.status)}>
                {icon(p.status)}
              </Text>
              <Text
                size="footnote"
                color={p.status === 'completed' ? pal.faint : pal.text}
                weight={p.status === 'in_progress' ? 'semibold' : 'regular'}
              >
                {p.content}
              </Text>
            </Box>
          ))}
        </Box>
      ) : null}
      {recent.length > 0 ? (
        <Box flexDirection="column" gap="xs">
          <Text size="caption" color={pal.faint}>
            최근 동작
          </Text>
          {recent.map(t => (
            <Box flexDirection="row" gap="sm">
              <Text size="footnote" color={pal.faint} tabular>
                {clockText(t.at)}
              </Text>
              <Text size="footnote" color={t.endedAt ? pal.sub : '#fbbf24'}>
                {t.endedAt ? '·' : '…'} {t.label}
              </Text>
              {t.detail ? (
                <Text size="footnote" color={pal.faint} wrap="truncate-end">
                  {t.detail}
                </Text>
              ) : null}
            </Box>
          ))}
        </Box>
      ) : (
        <Text size="caption" color={pal.faint}>
          아직 이 대화에서 기록된 동작이 없어요
        </Text>
      )}
    </Box>
  )
}
