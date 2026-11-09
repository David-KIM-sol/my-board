// Shared by the board and the second-brain pane.

// claude.ai connectors arrive as ids; the names come from the app's connector list.
export const CONNECTORS: Record<string, { name: string; group: string }> = {
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
export const GROUP_ORDER = ['문서·노트', '파일', '소통·일정', '디자인', '데이터', '브라우저·자동화', '기타']
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export type Palette = {
  text: string
  sub: string
  faint: string
  track: string
  card: string
  border: string
  chip: string
}
export const DARK: Palette = {
  text: '#eef0f6',
  sub: '#9097a8',
  faint: '#5d6375',
  track: '#ffffff14',
  card: '#ffffff08',
  border: '#ffffff1a',
  chip: '#ffffff0d',
}
export const LIGHT: Palette = {
  text: '#141722',
  sub: '#5d6375',
  faint: '#9aa0b0',
  track: '#0f172a14',
  card: '#0f172a06',
  border: '#0f172a1a',
  chip: '#0f172a0a',
}
export const paletteFor = (theme: string) => (theme.startsWith('light') ? LIGHT : DARK)

export const FONT = `-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', 'Segoe UI', sans-serif`

export const errText = (err: unknown) => (err instanceof Error ? err.message : String(err))

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const clockText = (t: number) => {
  const d = new Date(t)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')

  return `${hh}:${mm}`
}

/** The connector a tool belongs to, by its `mcp__<server>__<tool>` name. */
export const connectorOf = (tool: string) => {
  if (!tool.startsWith('mcp__')) return undefined
  const server = tool.split('__')[1] ?? ''
  return CONNECTORS[server]?.name
}
