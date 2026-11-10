// 세컨드 브레인: the Claude Code conversations on this computer, tagged by
// topic once with a small model and drawn as a map of what connects them.
// Everything it learns stays in $.store on this computer.

import { atom, read, update } from 'claude-code'
import type { BoxProps, ButtonProps, ElementConstructor, EngineInterface, SvgProps, TextProps } from 'claude-code'

import { DARK, FONT, connectorOf, errText, esc, paletteFor } from './common'
import type { Palette } from './common'
import type { BrainNode, BrainView, Conv, Tagged } from '../types'

export const BRAIN_PANE = 'my-brain'
export const BRAIN_TITLE = '세컨드 브레인'
const TAGS_KEY = 'brain-tags-v1'
const BATCH = 8
const RETAG_AFTER = 6

export const brain = atom({ plugin: 'my-board', key: 'brain' } as const, null, { shape: 'brain-1' })

const TAG_COLORS = ['#38bdf8', '#a78bfa', '#f472b6', '#fbbf24', '#34d399', '#fb923c', '#2dd4bf', '#e879f9']

// ─── reading and tagging ───────────────────────────────────────────────────

async function readConversations($: EngineInterface): Promise<Conv[]> {
  const script = `${$.plugin.root}/scripts/conversations.py`
  const r = await $.process.run(['/usr/bin/python3', '-I', script], { timeoutMs: 120_000 })
  if (r.exitCode !== 0) throw new Error(`대화 읽기 실패: ${r.stderr.slice(0, 200)}`)

  return r.stdout
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as Conv)
}

function promptFor(convs: Conv[], vocabulary: string[]) {
  const items = convs.map(c => {
    const connectors = [...new Set(c.tools.map(connectorOf).filter(Boolean))].join(', ')
    return [
      `### ${c.id}`,
      `제목: ${c.title}`,
      `첫 요청: ${c.first.slice(0, 400)}`,
      c.samples.length ? `다른 요청들: ${c.samples.join(' / ').slice(0, 700)}` : '',
      connectors ? `쓴 커넥터: ${connectors}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  })

  return `아래는 한 사람이 Claude와 나눈 대화들입니다. 대화마다 주제 태그 3~5개와 한 줄 요약을 붙여 주세요.

규칙:
- 태그는 짧은 한국어 명사구(2~8자). 예: 심방, 플라우드 녹음, 노션 정리, 설교 준비, 여름 캠프, 앱 개발
- 대화들 사이의 연결이 드러나도록, 같은 주제는 반드시 같은 태그 글자를 쓰세요.
- 이미 쓰고 있는 태그가 맞으면 그것을 다시 쓰세요: ${vocabulary.length ? vocabulary.join(', ') : '(아직 없음)'}
- 요약은 40자 이내 한국어 한 문장.
- 사람 이름은 태그에 넣지 마세요.

반드시 JSON 하나로만 답하세요. 형식:
{"<대화 id>": {"tags": ["태그1", "태그2"], "summary": "요약"}}

${items.join('\n\n')}`
}

function parseTags(text: string): Record<string, { tags: string[]; summary: string }> {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return {}
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, { tags?: unknown; summary?: unknown }>
    const out: Record<string, { tags: string[]; summary: string }> = {}
    for (const [id, v] of Object.entries(raw)) {
      const tags = Array.isArray(v?.tags) ? v.tags.map(t => String(t).trim()).filter(Boolean).slice(0, 5) : []
      if (tags.length) out[id] = { tags, summary: String(v?.summary ?? '').slice(0, 80) }
    }
    return out
  } catch {
    return {}
  }
}

async function setStatus($: EngineInterface, status: string, isBusy: boolean, error?: string) {
  await update($, brain, v =>
    v ? { ...v, status, isBusy, error } : { at: 0, status, isBusy, error, currentId: '', nodes: [], theme: 'dark' },
  )
}

let running = false

/** Reads the conversations, tags the new or grown ones, and redraws the pane. */
export async function refreshBrain($: EngineInterface) {
  if (running) return
  running = true
  try {
    await setStatus($, '대화를 읽는 중…', true)
    const convs = await readConversations($)
    const stored = await $.store.get(TAGS_KEY)
    const tags: Record<string, Tagged> = stored && typeof stored === 'object' ? { ...(stored as Record<string, Tagged>) } : {}

    const todo = convs.filter(c => !tags[c.id] || c.userMsgs - (tags[c.id] as Tagged).atMsgs >= RETAG_AFTER)
    let failed = 0
    for (let i = 0; i < todo.length; i += BATCH) {
      const batch = todo.slice(i, i + BATCH)
      await setStatus($, `AI가 주제를 정리하는 중… (${Math.min(i + BATCH, todo.length)}/${todo.length})`, true)
      const vocabulary = topTags(tags, 40)
      const r = await $.model.complete({
        model: 'haiku',
        prompt: promptFor(batch, vocabulary),
        maxTokens: 2500,
        timeoutMs: 90_000,
      })
      if (!r.isAnswered) {
        failed += batch.length
        continue
      }
      const parsed = parseTags(r.text)
      for (const c of batch) {
        const got = parsed[c.id]
        if (got) tags[c.id] = { ...got, atMsgs: c.userMsgs }
        else failed += 1
      }
      await $.store.set(TAGS_KEY, tags)
    }

    const currentId = await $.session.id()
    const theme = await themeOf($)
    const now = await $.clock.now()
    const view: BrainView = {
      at: now,
      status: failed ? `정리 완료 · ${failed}개는 다음에 다시 시도` : `정리 완료 · 대화 ${convs.length}개`,
      isBusy: false,
      currentId,
      nodes: foldNodes(convs, tags),
      theme,
    }
    await update($, brain, () => view)
  } catch (err) {
    await setStatus($, '정리하지 못했어요', false, errText(err))
  } finally {
    running = false
  }
}

async function themeOf($: EngineInterface) {
  try {
    const v = (await $.config.list()).find(r => r.key === 'theme')?.value
    return typeof v === 'string' ? v : 'dark'
  } catch {
    return 'dark'
  }
}

function topTags(tags: Record<string, Tagged>, n: number) {
  const count = new Map<string, number>()
  for (const t of Object.values(tags)) for (const tag of t.tags) count.set(tag, (count.get(tag) ?? 0) + 1)

  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([tag]) => tag)
}

function foldNodes(convs: Conv[], tags: Record<string, Tagged>): BrainNode[] {
  const byTitle = new Map<string, BrainNode>()
  for (const c of convs) {
    const t = tags[c.id]
    const last = Date.parse(c.lastAt ?? '') || c.mtimeMs
    const connectors = [...new Set(c.tools.map(connectorOf).filter((x): x is string => Boolean(x)))]
    const key = c.title.trim()
    const prev = byTitle.get(key)
    if (prev) {
      prev.ids.push(c.id)
      prev.count += 1
      prev.userMsgs += c.userMsgs
      prev.lastAt = Math.max(prev.lastAt, last)
      prev.tags = [...new Set([...prev.tags, ...(t?.tags ?? [])])].slice(0, 6)
      prev.connectors = [...new Set([...prev.connectors, ...connectors])]
      if (!prev.summary && t?.summary) prev.summary = t.summary
    } else {
      byTitle.set(key, {
        key,
        title: c.title,
        ids: [c.id],
        count: 1,
        userMsgs: c.userMsgs,
        lastAt: last,
        tags: t?.tags ?? [],
        summary: t?.summary ?? '',
        connectors,
      })
    }
  }

  return [...byTitle.values()].sort((a, b) => b.lastAt - a.lastAt)
}

// ─── connections and layout ────────────────────────────────────────────────

type Edge = { a: number; b: number; w: number; shared: string[] }

function edgesOf(nodes: BrainNode[]): Edge[] {
  const edges: Edge[] = []
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const A = nodes[i] as BrainNode
      const B = nodes[j] as BrainNode
      const shared = A.tags.filter(t => B.tags.includes(t))
      const sharedConn = A.connectors.filter(c => B.connectors.includes(c))
      const w = shared.length + 0.35 * sharedConn.length
      if (shared.length > 0 || sharedConn.length >= 2) edges.push({ a: i, b: j, w, shared })
    }
  }

  return edges
}

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967295
}

function layout(nodes: BrainNode[], edges: Edge[], W: number, H: number) {
  const n = nodes.length
  const pos = nodes.map((nd, i) => {
    const a = (i / Math.max(1, n)) * Math.PI * 2 + hash(nd.key) * 0.6
    return { x: W / 2 + Math.cos(a) * W * 0.32, y: H / 2 + Math.sin(a) * H * 0.32 }
  })
  const k = Math.sqrt((W * H) / Math.max(1, n)) * 0.5
  for (let it = 0; it < 320; it++) {
    const t = 1 - it / 320
    const disp = pos.map(() => ({ x: 0, y: 0 }))
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const pi = pos[i] as { x: number; y: number }
        const pj = pos[j] as { x: number; y: number }
        const dx = pi.x - pj.x
        const dy = pi.y - pj.y
        const d = Math.max(0.01, Math.hypot(dx, dy))
        const f = (k * k) / d
        const di = disp[i] as { x: number; y: number }
        const dj = disp[j] as { x: number; y: number }
        di.x += (dx / d) * f
        di.y += (dy / d) * f
        dj.x -= (dx / d) * f
        dj.y -= (dy / d) * f
      }
    }
    for (const e of edges) {
      const pa = pos[e.a] as { x: number; y: number }
      const pb = pos[e.b] as { x: number; y: number }
      const dx = pa.x - pb.x
      const dy = pa.y - pb.y
      const d = Math.max(0.01, Math.hypot(dx, dy))
      const f = ((d * d) / k) * Math.min(2, 0.5 + e.w * 0.5)
      const da = disp[e.a] as { x: number; y: number }
      const db = disp[e.b] as { x: number; y: number }
      da.x -= (dx / d) * f
      da.y -= (dy / d) * f
      db.x += (dx / d) * f
      db.y += (dy / d) * f
    }
    for (let i = 0; i < n; i++) {
      const p = pos[i] as { x: number; y: number }
      const d = disp[i] as { x: number; y: number }
      d.x += (W / 2 - p.x) * 0.9
      d.y += (H / 2 - p.y) * 0.9
      const len = Math.max(0.01, Math.hypot(d.x, d.y))
      const step = Math.min(len, 14 * t + 0.5)
      p.x = Math.min(W - 30, Math.max(30, p.x + (d.x / len) * step))
      p.y = Math.min(H - 22, Math.max(18, p.y + (d.y / len) * step))
    }
  }

  // Stretch whatever shape the forces settled into across the whole canvas.
  const xs = pos.map(p => p.x)
  const ys = pos.map(p => p.y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const fit = (v: number, a: number, b: number, lo: number, hi: number) => (b - a < 1 ? (lo + hi) / 2 : lo + ((v - a) / (b - a)) * (hi - lo))

  return pos.map(p => ({ x: fit(p.x, x0, x1, 44, W - 44), y: fit(p.y, y0, y1, 24, H - 30) }))
}

function tagColors(nodes: BrainNode[]) {
  const count = new Map<string, number>()
  for (const nd of nodes) for (const t of nd.tags) count.set(t, (count.get(t) ?? 0) + nd.count)
  const ranked = [...count.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1])
  const colors = new Map<string, string>()
  ranked.slice(0, TAG_COLORS.length).forEach(([t], i) => colors.set(t, TAG_COLORS[i] as string))
  const primary = (nd: BrainNode) => {
    const best = nd.tags.filter(t => colors.has(t)).sort((a, b) => (count.get(b) ?? 0) - (count.get(a) ?? 0))[0]
    return best
  }

  return { colors, primary, ranked }
}

function mapSvg(nodes: BrainNode[], currentId: string, pal: Palette) {
  const W = 340
  const H = 280
  const edges = edgesOf(nodes)
  const pos = layout(nodes, edges, W, H)
  const { colors, primary } = tagColors(nodes)
  const maxW = Math.max(1, ...edges.map(e => e.w))

  const lines = edges
    .map(e => {
      const a = pos[e.a] as { x: number; y: number }
      const b = pos[e.b] as { x: number; y: number }
      const op = (0.18 + 0.55 * (e.w / maxW)).toFixed(2)
      const tip = e.shared.length ? `공통 주제: ${e.shared.join(', ')}` : '같은 커넥터를 씀'
      return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${pal.sub}" stroke-opacity="${op}" stroke-width="${(0.8 + e.w * 0.6).toFixed(1)}"><title>${esc(tip)}</title></line>`
    })
    .join('')

  const dots = nodes
    .map((nd, i) => {
      const p = pos[i] as { x: number; y: number }
      const r = Math.min(15, 4.5 + Math.sqrt(nd.userMsgs) * 1.7)
      const tag = primary(nd)
      const c = (tag && colors.get(tag)) || pal.faint
      const isCurrent = nd.ids.includes(currentId)
      const label = nd.title.length > 10 ? `${nd.title.slice(0, 9)}…` : nd.title
      const tip = `${nd.title}${nd.count > 1 ? ` (×${nd.count})` : ''}\n${nd.summary}\n${nd.tags.map(t => `#${t}`).join(' ')}`
      return `<g><title>${esc(tip)}</title>${
        isCurrent ? `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(r + 5).toFixed(1)}" fill="none" stroke="${c}" stroke-width="1.5" stroke-dasharray="2 3"><animateTransform attributeName="transform" type="rotate" from="0 ${p.x.toFixed(1)} ${p.y.toFixed(1)}" to="360 ${p.x.toFixed(1)} ${p.y.toFixed(1)}" dur="12s" repeatCount="indefinite"/></circle>` : ''
      }<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}" fill="${c}" fill-opacity="0.9" filter="url(#glow)"/>${
        nd.count > 1 ? `<text x="${p.x.toFixed(1)}" y="${(p.y + 3).toFixed(1)}" font-size="8.5" font-weight="700" fill="#0b0d12" text-anchor="middle">${nd.count}</text>` : ''
      }<text x="${p.x.toFixed(1)}" y="${(p.y + r + 11).toFixed(1)}" font-size="11" fill="${isCurrent ? pal.text : pal.sub}" text-anchor="middle" font-weight="${isCurrent ? 700 : 400}">${esc(label)}</text></g>`
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}">
<defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
${lines}${dots}
</svg>`
}

// ─── the pane ──────────────────────────────────────────────────────────────

export type BrainEls = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
  Svg?: ElementConstructor<SvgProps>
}

const dateText = (t: number, now: number) => {
  const days = Math.floor((now - t) / 86_400_000)
  if (days <= 0) return '오늘'
  if (days === 1) return '어제'
  if (days < 7) return `${days}일 전`
  const d = new Date(t)

  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function brainTree(view: BrainView | null, now: number, els: BrainEls, onRefresh: () => void) {
  const { Box, Text, Button, Svg } = els
  const pal = paletteFor(view?.theme ?? 'dark')
  const card = (title: string, right: string | undefined, body: unknown) => (
    <Box flexDirection="column" gap="sm" padding="md" borderStyle="round" borderColor={pal.border} backgroundColor={pal.card}>
      <Box flexDirection="row" justifyContent="space-between" alignItems="center">
        <Text size="caption" weight="semibold" color={pal.sub}>
          {title}
        </Text>
        {right ? (
          <Text size="caption" color={pal.faint}>
            {right}
          </Text>
        ) : null}
      </Box>
      {body as never}
    </Box>
  )

  const header = (
    <Box flexDirection="row" justifyContent="space-between" alignItems="center">
      <Box flexDirection="column">
        <Text size="title" weight="bold" color={pal.text}>
          세컨드 브레인
        </Text>
        <Text size="caption" color={pal.faint}>
          이 맥북의 Claude Code 대화를 주제로 이어 봅니다
        </Text>
      </Box>
      <Button key="brain-refresh" label={view?.isBusy ? '정리 중…' : '다시 정리'} variant="secondary" onPress={onRefresh} />
    </Box>
  )

  if (!view || view.nodes.length === 0) {
    return (
      <Box flexDirection="column" gap="md" paddingY="sm">
        {header}
        <Text size="body" color={view?.error ? '#fb7185' : pal.sub}>
          {view ? view.status : '아직 정리하지 않았어요. "다시 정리"를 누르면 시작합니다.'}
        </Text>
        {view?.error ? (
          <Text size="caption" color="#fb7185">
            {view.error}
          </Text>
        ) : null}
      </Box>
    )
  }

  const { colors, ranked } = tagColors(view.nodes)
  const current = view.nodes.find(nd => nd.ids.includes(view.currentId))
  const related = current
    ? view.nodes
        .filter(nd => nd !== current)
        .map(nd => ({
          nd,
          shared: nd.tags.filter(t => current.tags.includes(t)),
          conn: nd.connectors.filter(c => current.connectors.includes(c)),
        }))
        .filter(x => x.shared.length > 0 || x.conn.length > 0)
        .sort((a, b) => b.shared.length + 0.35 * b.conn.length - (a.shared.length + 0.35 * a.conn.length))
        .slice(0, 4)
    : []
  const tagChip = (t: string, n?: number) => (
    <Box
      key={`tag:${t}:${n ?? ''}`}
      flexDirection="row"
      gap="xs"
      paddingX="sm"
      borderStyle="round"
      borderColor={colors.get(t) ?? pal.border}
      backgroundColor={pal.chip}
    >
      <Text size="footnote" color={colors.get(t) ?? pal.sub}>
        #{t}
      </Text>
      {n ? (
        <Text size="footnote" color={pal.faint} tabular>
          {n}
        </Text>
      ) : null}
    </Box>
  )

  return (
    <Box flexDirection="column" gap="md" paddingY="sm">
      {header}

      {card(
        '연결 지도',
        `대화 ${view.nodes.reduce((a, nd) => a + nd.count, 0)}개 · 점 ${view.nodes.length}개`,
        <Box flexDirection="column" gap="sm">
          {Svg ? (
            <Svg
              source={mapSvg(view.nodes, view.currentId, pal)}
              alt={`대화 ${view.nodes.length}개의 주제 연결 지도`}
              isInteractive
            />
          ) : null}
          <Box flexDirection="row" flexWrap="wrap" gap="sm">
            {[...colors.entries()].map(([t, c]) => (
              <Text size="caption" color={c}>
                ● {t}
              </Text>
            ))}
          </Box>
          <Text size="caption" color={pal.faint}>
            점 크기 = 대화 길이 · 선 = 같은 주제나 같은 커넥터 · 점선 원 = 지금 대화 · 점에 마우스를 올리면 요약이 보여요
          </Text>
        </Box>,
      )}

      {current
        ? card(
            '지금 대화와 이어진 대화',
            undefined,
            related.length ? (
              <Box flexDirection="column" gap="sm">
                {related.map(({ nd, shared, conn }) => (
                  <Box flexDirection="column">
                    <Text size="footnote" weight="semibold" color={pal.text}>
                      {nd.title}
                      {nd.count > 1 ? ` ×${nd.count}` : ''}
                    </Text>
                    <Text size="caption" color={pal.faint}>
                      {[shared.length ? `공통 주제 ${shared.map(t => `#${t}`).join(' ')}` : '', conn.length ? `같이 쓴 커넥터 ${conn.join(', ')}` : '']
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </Box>
                ))}
              </Box>
            ) : (
              <Text size="caption" color={pal.faint}>
                아직 이어진 대화가 없어요
              </Text>
            ),
          )
        : null}

      {card(
        '자주 다룬 주제',
        undefined,
        <Box flexDirection="row" flexWrap="wrap" gap="xs">
          {ranked.length ? ranked.slice(0, 18).map(([t, n]) => tagChip(t, n)) : <Text size="caption" color={pal.faint}>두 번 이상 나온 주제가 아직 없어요</Text>}
        </Box>,
      )}

      {card(
        '대화 목록',
        '최근 순',
        <Box flexDirection="column" gap="sm">
          {view.nodes.slice(0, 10).map(nd => (
            <Box flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between">
                <Text size="footnote" weight="semibold" color={nd.ids.includes(view.currentId) ? '#34d399' : pal.text} wrap="truncate-end">
                  {nd.title}
                  {nd.count > 1 ? ` ×${nd.count}` : ''}
                </Text>
                <Text size="caption" color={pal.faint} tabular>
                  {dateText(nd.lastAt, now)}
                </Text>
              </Box>
              {nd.summary ? (
                <Text size="caption" color={pal.sub}>
                  {nd.summary}
                </Text>
              ) : null}
              {nd.tags.length ? (
                <Text size="caption" color={pal.faint}>
                  {nd.tags.map(t => `#${t}`).join(' ')}
                </Text>
              ) : null}
            </Box>
          ))}
        </Box>,
      )}

      <Text size="caption" color={view.error ? '#fb7185' : pal.faint}>
        {view.status}
        {view.error ? ` · ${view.error}` : ''} · claude.ai 웹·앱 대화는 이 컴퓨터에 없어 포함되지 않아요
      </Text>
    </Box>
  )
}

export async function readBrain($: EngineInterface) {
  return read($, brain)
}

// ─── the desktop window ────────────────────────────────────────────────────

export type BrainExport = {
  status: string
  isBusy: boolean
  total: number
  mapSvg: string
  legend: [string, string][]
  related: { title: string; reason: string }[]
  topics: [string, number][]
  list: { title: string; when: string; summary: string; tags: string[]; isCurrent: boolean }[]
}

/** What the desktop window shows of the second brain, drawn for its dark page. */
export function brainExport(view: BrainView | null, now: number): BrainExport | null {
  if (!view || view.nodes.length === 0) return null
  const { colors, ranked } = tagColors(view.nodes)
  const current = view.nodes.find(nd => nd.ids.includes(view.currentId))
  const related = current
    ? view.nodes
        .filter(nd => nd !== current)
        .map(nd => ({
          nd,
          shared: nd.tags.filter(t => current.tags.includes(t)),
          conn: nd.connectors.filter(c => current.connectors.includes(c)),
        }))
        .filter(x => x.shared.length > 0 || x.conn.length > 0)
        .sort((a, b) => b.shared.length + 0.35 * b.conn.length - (a.shared.length + 0.35 * a.conn.length))
        .slice(0, 4)
        .map(({ nd, shared, conn }) => ({
          title: nd.title + (nd.count > 1 ? ` ×${nd.count}` : ''),
          reason: [shared.length ? `공통 주제 ${shared.map(t => `#${t}`).join(' ')}` : '', conn.length ? `같이 쓴 커넥터 ${conn.join(', ')}` : '']
            .filter(Boolean)
            .join(' · '),
        }))
    : []

  return {
    status: view.status,
    isBusy: view.isBusy,
    total: view.nodes.reduce((a, nd) => a + nd.count, 0),
    mapSvg: mapSvg(view.nodes, view.currentId, DARK),
    legend: [...colors.entries()],
    related,
    topics: ranked.slice(0, 18),
    list: view.nodes.slice(0, 10).map(nd => ({
      title: nd.title + (nd.count > 1 ? ` ×${nd.count}` : ''),
      when: dateText(nd.lastAt, now),
      summary: nd.summary,
      tags: nd.tags,
      isCurrent: nd.ids.includes(view.currentId),
    })),
  }
}
