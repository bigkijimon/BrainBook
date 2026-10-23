// Idea Card sections for an idea note (owner 2026-10-23). Same shape as the company-wide
// Idea Mining framework (Marketing/playbook/IDEA_MINING_FRAMEWORK.md, IDEA-LOG.md): niche -> demand
// evidence (a real number + a small chart, each with a source) -> a pain-point quote with its source
// -> idea + pitch -> decision (selected / rejected / pending) with a reason.
//
// The card is written as plain Markdown sections inside the existing idea note, so Obsidian keeps
// working and ideas.mjs / server.mjs's checklist progress math is untouched (the card has no
// checkboxes). Every field is optional: a missing number stays null and is shown as missing, never
// replaced by an adjective or a guess.
const clip = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const num = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(String(value).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : null;
};

export const DECISIONS = ['pending', 'selected', 'rejected'];
// Headings the card owns; saveCard replaces exactly these and leaves every other section alone.
export const CARD_HEADINGS = ['Niche', 'Demand evidence', 'Pain point', 'Pitch', 'Decision'];

export function normalizeCard(input = {}) {
  const series = (Array.isArray(input.series) ? input.series : [])
    .map((point) => ({ label: clip(point?.label, 24), value: num(point?.value) }))
    .filter((point) => point.label && point.value !== null).slice(0, 12);
  const decision = DECISIONS.includes(input.decision) ? input.decision : 'pending';
  return {
    niche: clip(input.niche, 120),
    volume: { value: num(input.volume?.value), unit: clip(input.volume?.unit, 24) || 'per month', source: clip(input.volume?.source, 200) },
    trend: { pct: num(input.trend?.pct), window: clip(input.trend?.window, 24) || '12 months', source: clip(input.trend?.source, 200) },
    series, seriesUnit: clip(input.seriesUnit, 24), seriesSource: clip(input.seriesSource, 200),
    quote: { text: clip(input.quote?.text, 400), source: clip(input.quote?.source, 200) },
    pitch: { name: clip(input.pitch?.name, 80), line: clip(input.pitch?.line, 240) },
    decision, decisionReason: clip(input.decisionReason, 400),
  };
}

// What is still missing for the framework's "real numbers, real source" bar.
export function cardGaps(card) {
  const gaps = [];
  if (!card.niche) gaps.push('niche');
  if (card.volume.value === null || !card.volume.source) gaps.push('search volume + source');
  if (card.trend.pct === null || !card.trend.source) gaps.push('trend % + source');
  if (card.series.length < 2) gaps.push('chart data (2+ points)');
  if (!card.quote.text || !card.quote.source) gaps.push('pain-point quote + source');
  if (!card.pitch.name) gaps.push('idea name + pitch');
  if (card.decision !== 'pending' && !card.decisionReason) gaps.push('decision reason');
  return gaps;
}

const signed = (n) => (n > 0 ? `+${n}` : String(n));

export function renderCardSections(input) {
  const card = normalizeCard(input);
  const lines = [
    '## Niche', '', card.niche || '_not set_', '',
    '## Demand evidence', '',
    `- Volume: ${card.volume.value ?? '?'} ${card.volume.unit} | ${card.volume.source || 'no source'}`,
    `- Trend: ${card.trend.pct === null ? '?' : signed(card.trend.pct)}% over ${card.trend.window} | ${card.trend.source || 'no source'}`,
    `- Chart: ${card.series.map((p) => `${p.label}=${p.value}`).join('; ') || 'none'}${card.seriesUnit ? ` (${card.seriesUnit})` : ''} | ${card.seriesSource || 'no source'}`,
    '',
    '## Pain point', '', card.quote.text ? `> ${card.quote.text}` : '> _no quote yet_', '', `Source: ${card.quote.source || 'no source'}`, '',
    '## Pitch', '', card.pitch.name ? `**${card.pitch.name}** — ${card.pitch.line}` : '_not set_', '',
    '## Decision', '', `${card.decision}${card.decisionReason ? ` — ${card.decisionReason}` : ''}`, '',
  ];
  return lines;
}

const sectionBody = (lines, heading) => {
  const at = lines.findIndex((line) => line.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (at === -1) return null;
  let end = at + 1;
  while (end < lines.length && !/^#{1,6}\s/.test(lines[end])) end += 1;
  return lines.slice(at + 1, end).filter((line) => line.trim());
};

// Inverse of renderCardSections. Returns null when the note carries no card at all.
export function parseCard(text) {
  const lines = String(text || '').split(/\r?\n/);
  if (!CARD_HEADINGS.some((heading) => sectionBody(lines, heading))) return null;
  const evidence = sectionBody(lines, 'Demand evidence') || [];
  const field = (name) => evidence.find((line) => line.startsWith(`- ${name}:`))?.slice(name.length + 3).trim() || '';
  const [volumeText = '', volumeSource = ''] = field('Volume').split(' | ');
  const volumeMatch = volumeText.match(/^(\S+)\s*(.*)$/) || [];
  const [trendText = '', trendSource = ''] = field('Trend').split(' | ');
  const trendMatch = trendText.match(/^([+-]?[\d.,]+)%\s*over\s*(.*)$/) || [];
  const [chartText = '', chartSource = ''] = field('Chart').split(' | ');
  const unitMatch = chartText.match(/\(([^)]*)\)\s*$/);
  const series = chartText.replace(/\([^)]*\)\s*$/, '').split(';').map((part) => part.trim().split('=')).filter((p) => p.length === 2).map(([label, value]) => ({ label, value }));
  const pain = sectionBody(lines, 'Pain point') || [];
  const pitch = (sectionBody(lines, 'Pitch') || [])[0] || '';
  const pitchMatch = pitch.match(/^\*\*(.*?)\*\*\s*—\s*(.*)$/);
  const decision = (sectionBody(lines, 'Decision') || [])[0] || '';
  const decisionMatch = decision.match(/^(pending|selected|rejected)(?:\s*—\s*(.*))?$/);
  const none = (value) => (/^(_.*_|no source|\?|none)$/.test(value) ? '' : value);
  return normalizeCard({
    niche: none((sectionBody(lines, 'Niche') || [])[0] || ''),
    volume: { value: volumeMatch[1] === '?' ? null : volumeMatch[1], unit: volumeMatch[2], source: none(volumeSource) },
    trend: { pct: trendMatch[1]?.replace(/,/g, ''), window: trendMatch[2], source: none(trendSource) },
    series, seriesUnit: unitMatch?.[1] || '', seriesSource: none(chartSource),
    quote: { text: none((pain.find((line) => line.startsWith('>')) || '').replace(/^>\s*/, '')), source: none((pain.find((line) => line.startsWith('Source:')) || '').replace(/^Source:\s*/, '')) },
    pitch: { name: pitchMatch?.[1] || '', line: pitchMatch?.[2] || '' },
    decision: decisionMatch?.[1] || 'pending', decisionReason: decisionMatch?.[2] || '',
  });
}

// Replace the card's sections inside a note body (front matter included), leaving everything else
// (Summary, Roadmap checklists, Links, Progress) byte-for-byte. Returns the new text.
export function upsertCardSections(text, input) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const kept = [];
  for (let i = 0; i < lines.length; i += 1) {
    const heading = /^##\s+(.*?)\s*$/.exec(lines[i]);
    if (heading && CARD_HEADINGS.some((h) => h.toLowerCase() === heading[1].toLowerCase())) {
      i += 1;
      while (i < lines.length && !/^#{1,6}\s/.test(lines[i])) i += 1;
      i -= 1;
      continue;
    }
    kept.push(lines[i]);
  }
  // Land before the roadmap when there is one, otherwise at the end.
  let at = kept.findIndex((line) => /^##\s+roadmap\s*$/i.test(line.trim()));
  if (at === -1) { at = kept.length; while (at > 0 && !kept[at - 1].trim()) at -= 1; }
  const block = ['', ...renderCardSections(input)];
  if (at < kept.length) block.push('');
  kept.splice(at, 0, ...block);
  return kept.join(eol).replace(/\s*$/, eol);
}
