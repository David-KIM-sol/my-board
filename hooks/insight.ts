// 일잘러 점검: how the person's conversations connect, carry context forward,
// and spend effort on what matters. Pure functions over the second brain's
// nodes; the model's part (importance and kind) happens when tagging.

import { FONT, esc } from './common'
import type { Palette } from './common'
import type { BrainNode, Priorities } from '../types'

export const KINDS = ['핵심 업무', '운영·행정', '일정·할 일', '도구·자동화', '배움·탐색', '개인'] as const
export const KIND_COLORS: Record<string, string> = {
  '핵심 업무': '#f472b6',
  '운영·행정': '#fbbf24',
  '일정·할 일': '#38bdf8',
  '도구·자동화': '#a78bfa',
  '배움·탐색': '#34d399',
  개인: '#fb923c',
  기타: '#94a3b8',
}

export type Insight = {
  total: number
  continuity: { rate: number; continued: number; fresh: number }
  flows: { count: number; isolated: number; names: string[] }
  focus: { importantShare: number; importantCount: number }
  byKind: [string, number][]
  neglected: string[]
  sinks: string[]
  notes: string[]
}

const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2
}

export function computeInsight(nodes: BrainNode[], pri?: Priorities, now: number = Date.now()): Insight | null {
  const rated = nodes.filter(n => n.tags.length > 0)
  if (rated.length < 3) return null

  // 맥락 이어가기: a conversation continues context when an earlier one shares a topic.
  const byStart = [...rated].sort((a, b) => a.firstAt - b.firstAt)
  let continued = 0
  byStart.forEach((n, i) => {
    if (i === 0) return
    if (byStart.slice(0, i).some(p => p.tags.some(t => n.tags.includes(t)))) continued += 1
  })
  const comparable = Math.max(1, byStart.length - 1)

  // 일의 연결: groups of conversations joined by a shared topic.
  const parent = rated.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i] as number)))
  for (let i = 0; i < rated.length; i++)
    for (let j = i + 1; j < rated.length; j++)
      if ((rated[i] as BrainNode).tags.some(t => (rated[j] as BrainNode).tags.includes(t))) parent[find(i)] = find(j)
  const groups = new Map<number, BrainNode[]>()
  rated.forEach((n, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), n]))
  const flows = [...groups.values()].filter(g => g.length > 1).sort((a, b) => b.length - a.length)
  const isolated = [...groups.values()].filter(g => g.length === 1).length
  const flowName = (g: BrainNode[]) => {
    const count = new Map<string, number>()
    for (const n of g) for (const t of n.tags) count.set(t, (count.get(t) ?? 0) + 1)
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  }

  // 중요도 vs 시간
  const msgs = rated.reduce((a, n) => a + n.userMsgs, 0) || 1
  const important = rated.filter(n => (n.importance ?? 0) >= 4)
  const importantShare = Math.round((100 * important.reduce((a, n) => a + n.userMsgs, 0)) / msgs)
  const mid = median(rated.map(n => n.userMsgs))
  const neglected = important.filter(n => n.userMsgs <= mid).sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0)).map(n => n.title)
  const sinks = rated.filter(n => (n.importance ?? 3) <= 2 && n.userMsgs > mid).sort((a, b) => b.userMsgs - a.userMsgs).map(n => n.title)
  const kindMsgs = new Map<string, number>()
  for (const n of rated) kindMsgs.set(n.kind ?? '기타', (kindMsgs.get(n.kind ?? '기타') ?? 0) + n.userMsgs)
  const byKind = [...kindMsgs.entries()].map(([k, v]) => [k, Math.round((100 * v) / msgs)] as [string, number]).sort((a, b) => b[1] - a[1])

  const rate = Math.round((100 * continued) / comparable)
  const notes: string[] = []

  // 마감과 미뤄지는 일: the priorities file names them, the conversations show whether they got attention.
  const about = (n: BrainNode, ws: string[]) => {
    const hay = `${n.title} ${n.tags.join(' ')} ${n.summary}`
    return ws.some(w => w && hay.includes(w))
  }
  for (const d of pri?.deadlines ?? []) {
    const due = Date.parse(`${d.date}T23:59:59`)
    const left = Math.ceil((due - now) / 86_400_000)
    if (!Number.isFinite(left) || left < 0 || left > 45) continue
    const recent = nodes.filter(n => about(n, d.words) && now - n.lastAt < 14 * 86_400_000).length
    const when = `${Number(d.date.slice(5, 7))}/${Number(d.date.slice(8, 10))}`
    notes.push(
      recent <= 1
        ? `⏰ ${d.name}: ${when} 마감(${left}일 남음)인데 최근 2주 관련 대화가 ${recent}개예요. 오늘 시작할 일 하나를 정해 보세요.`
        : `⏰ ${d.name}: ${when} 마감까지 ${left}일 · 최근 2주 관련 대화 ${recent}개`,
    )
  }
  for (const w of pri?.watch ?? []) {
    const lastSeen = Math.max(0, ...nodes.filter(n => about(n, w.words)).map(n => n.lastAt))
    const days = lastSeen ? Math.floor((now - lastSeen) / 86_400_000) : -1
    if (days < 0) notes.push(`🐢 ${w.name}: 아직 관련 대화가 없어요.`)
    else if (days > 30) notes.push(`🐢 ${w.name}: ${days}일째 관련 대화가 없어요.`)
  }

  if (rate < 40) notes.push(`새 대화의 ${100 - rate}%가 앞선 대화와 이어지지 않아요. 비슷한 일은 이전 대화를 이어서 하거나 인수인계 문서로 맥락을 넘겨 보세요.`)
  else if (rate >= 70) notes.push(`새 대화의 ${rate}%가 앞선 일과 이어져요. 맥락을 잘 쌓고 있어요.`)
  else notes.push(`새 대화의 ${rate}%가 앞선 일과 이어져요. 따로 떨어진 대화 ${isolated}개가 다른 흐름과 이어지는지 살펴보세요.`)
  if (importantShare < 40) notes.push(`중요도 높은 일에 쓴 대화가 전체의 ${importantShare}%예요. 핵심 일의 비중을 늘릴 여지가 있어요.`)
  else notes.push(`대화량의 ${importantShare}%가 중요도 높은 일에 쓰였어요.`)
  if (neglected.length) notes.push(`중요한데 손이 덜 간 일: ${neglected.slice(0, 3).join(', ')}`)
  if (sinks.length) notes.push(`가벼운데 시간이 많이 든 일: ${sinks.slice(0, 2).join(', ')} — 스킬이나 자동화로 줄일 수 있는지 보세요.`)

  return {
    total: rated.length,
    continuity: { rate, continued, fresh: comparable - continued },
    flows: { count: flows.length, isolated, names: flows.slice(0, 4).map(flowName).filter(Boolean) },
    focus: { importantShare, importantCount: important.length },
    byKind,
    neglected,
    sinks,
    notes,
  }
}

/** 중요도(세로) × 들인 대화량(가로), four quadrants. */
export function focusSvg(nodes: BrainNode[], pal: Palette) {
  const rated = nodes.filter(n => n.tags.length > 0 && n.importance)
  const W = 340
  const H = 236
  const L = 42
  const R = 322
  const T = 30
  const B = 200
  const maxMsgs = Math.max(2, ...rated.map(n => n.userMsgs))
  const X = (m: number) => L + ((R - L) * Math.log(1 + m)) / Math.log(1 + maxMsgs)
  const Y = (imp: number) => B - ((B - T) * (imp - 1)) / 4
  const mid = median(rated.map(n => n.userMsgs))
  const mx = X(mid)
  const my = Y(3.5)
  const seen = new Map<string, number>()
  const dots = rated
    .map(n => {
      const key = `${Math.round(X(n.userMsgs) / 8)}:${n.importance}`
      const k = seen.get(key) ?? 0
      seen.set(key, k + 1)
      const x = X(n.userMsgs) + (k % 3) * 7 - 7 * Math.min(1, k)
      const y = Y(n.importance as number) - Math.floor(k / 3) * 7 + (k ? 3 : 0)
      const c = KIND_COLORS[n.kind ?? '기타'] ?? KIND_COLORS['기타']
      const r = Math.min(9, 4 + Math.sqrt(n.count))
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${c}" fill-opacity="0.85" stroke="#0b0d13" stroke-width="1"><title>${esc(`${n.title}\n중요도 ${n.importance} · ${n.kind ?? '기타'} · 요청 ${n.userMsgs}개`)}</title></circle>`
    })
    .join('')
  const label = (x: number, y: number, text: string, anchor: string, color: string) =>
    `<text x="${x}" y="${y}" font-size="10" fill="${color}" text-anchor="${anchor}">${text}</text>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}">
<rect x="${mx.toFixed(1)}" y="${T}" width="${(R - mx).toFixed(1)}" height="${(my - T).toFixed(1)}" fill="#34d399" fill-opacity="0.06"/>
<rect x="${L}" y="${T}" width="${(mx - L).toFixed(1)}" height="${(my - T).toFixed(1)}" fill="#fbbf24" fill-opacity="0.06"/>
<line x1="${L}" x2="${R}" y1="${my.toFixed(1)}" y2="${my.toFixed(1)}" stroke="${pal.faint}" stroke-opacity="0.5" stroke-dasharray="3 4"/>
<line x1="${mx.toFixed(1)}" x2="${mx.toFixed(1)}" y1="${T}" y2="${B}" stroke="${pal.faint}" stroke-opacity="0.5" stroke-dasharray="3 4"/>
<line x1="${L}" x2="${R}" y1="${B}" y2="${B}" stroke="${pal.track}"/>
${label(R - 2, T - 8, '핵심에 집중', 'end', '#34d399')}
${label(L + 4, T - 8, '챙겨야 할 중요한 일', 'start', '#fbbf24')}
${label(R - 2, B - 6, '시간 많이 든 가벼운 일', 'end', '#fb7185')}
${label(L + 4, B - 6, '가벼운 일', 'start', pal.faint)}
<text x="${L - 6}" y="${T + 4}" font-size="9" fill="${pal.faint}" text-anchor="end">5</text>
<text x="${L - 6}" y="${B + 3}" font-size="9" fill="${pal.faint}" text-anchor="end">1</text>
<text x="${L - 6}" y="${(T + B) / 2 + 3}" font-size="9" fill="${pal.sub}" text-anchor="end">중요도</text>
<text x="${(L + R) / 2}" y="${B + 16}" font-size="9.5" fill="${pal.sub}" text-anchor="middle">들인 대화량 →</text>
${dots}
</svg>`
}

/** 일의 종류별 대화량 비중, one stacked bar. */
export function kindSvg(byKind: [string, number][], pal: Palette) {
  const W = 340
  let x = 4
  const bar = byKind
    .map(([k, p]) => {
      const w = (332 * p) / 100
      const s = `<rect x="${x.toFixed(1)}" y="4" width="${Math.max(0, w).toFixed(1)}" height="12" fill="${KIND_COLORS[k] ?? KIND_COLORS['기타']}"><title>${esc(k)} ${p}%</title></rect>`
      x += w
      return s
    })
    .join('')
  const legend = byKind
    .map(([k, p], i) => {
      const lx = 4 + (i % 3) * 112
      const ly = 36 + Math.floor(i / 3) * 17
      return `<rect x="${lx}" y="${ly - 8}" width="8" height="8" rx="2" fill="${KIND_COLORS[k] ?? KIND_COLORS['기타']}"/><text x="${lx + 13}" y="${ly}" font-size="10.5" fill="${pal.sub}">${esc(k)} <tspan fill="${pal.text}" font-weight="600">${p}%</tspan></text>`
    })
    .join('')
  const H = 36 + Math.ceil(byKind.length / 3) * 17

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}">
<defs><clipPath id="kb"><rect x="4" y="4" width="332" height="12" rx="6"/></clipPath></defs>
<g clip-path="url(#kb)"><rect x="4" y="4" width="332" height="12" fill="${pal.track}"/>${bar}</g>
${legend}
</svg>`
}
