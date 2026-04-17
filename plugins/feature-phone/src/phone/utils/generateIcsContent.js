/**
 * generateIcsContent - 生成 ICS 日历文件内容
 * @param {Object} event - { date, time, title, description, contactName }
 * @returns {string} ICS 文件内容
 */
export function generateIcsContent(event) {
  const { date, time, title, description = '', contactName = '' } = event

  // 生成唯一的 UID
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}@avgllm`

  // DTSTAMP: 当前 UTC 时间
  const now = new Date()
  const dtstamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') + 'Z'

  // DTSTART
  let dtstart
  if (time) {
    dtstart = `${date.replace(/-/g, '')}T${time.replace(/:/g, '')}00`
  } else {
    // 全天事件
    dtstart = date.replace(/-/g, '')
  }

  // ICS 文本转义：换行符用 \n，逗号用 \,，分号用 \;，反斜杠用 \\
  const escapeIcs = (text) => {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n')
  }

  const summary = escapeIcs(title)
  let desc = escapeIcs(description)
  if (contactName) {
    desc += (desc ? '\\n' : '') + escapeIcs(`来自 CHAR: ${contactName}`)
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AVG LLM//CN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART${dtstart.includes('T') ? `;VALUE=DATE-TIME:${dtstart}` : `;VALUE=DATE:${dtstart}`}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${desc}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return lines.join('\r\n') + '\r\n'
}
