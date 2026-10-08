// Native chat renders plain Text. Convert the common Markdown the model may
// return into readable paragraphs, lists and labelled table rows.
function inline(text: string): string {
  return text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*|__([^_\n]+)__/g, (_match, a, b) => a ?? b)
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*([^*\n]+)\*|_([^_\n]+)_/g, (_match, a, b) => a ?? b);
}
function cells(line: string) { return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => inline(cell.trim())); }
export function formatCoachText(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const result: string[] = [];
  let code = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) { code = !code; continue; }
    if (code) { result.push(line); continue; }
    if (line.includes('|') && /^\s*\|?\s*:?-{3,}:?\s*\|/.test(lines[i + 1] ?? '')) {
      const headers = cells(line); i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        const values = cells(lines[i]);
        result.push(values.map((value, index) => headers[index] ? `${headers[index]}: ${value}` : value).join('\n'));
        result.push(''); i++;
      }
      i--; continue;
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { result.push(''); continue; }
    result.push(inline(line.replace(/^\s{0,3}#{1,6}\s+/, '').replace(/^\s*>\s?/, '').replace(/^\s*[-*+]\s+/, '• ')));
  }
  return result.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
