import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cardGaps, normalizeCard, parseCard, upsertCardSections } from '../idea-card.mjs';
import { createIdeaStore } from '../ideas.mjs';

const full = {
  niche: 'Wealth — freelancer irregular-income budgeting',
  volume: { value: '840,000', unit: 'per month', source: 'SearchSpy 2026' },
  trend: { pct: '212', window: '12 months', source: 'SearchSpy 2026' },
  series: [{ label: '2025', value: 0.26 }, { label: '2035', value: 2 }], seriesUnit: 'USD B', seriesSource: 'NextMSC',
  quote: { text: 'I cannot tell what is safe to spend today.', source: 'r/Freelancers' },
  pitch: { name: 'SafeSpend', line: 'One number: safe to spend today.' },
  decision: 'selected', decisionReason: 'broadest pain coverage',
};

test('a card round-trips through its Markdown sections with real numbers intact', () => {
  const text = upsertCardSections('---\nid: "x"\n---\n\n# T\n\n## Summary\n\nhello\n', full);
  const back = parseCard(text);
  assert.equal(back.volume.value, 840000);
  assert.equal(back.trend.pct, 212);
  assert.deepEqual(back.series, [{ label: '2025', value: 0.26 }, { label: '2035', value: 2 }]);
  assert.equal(back.seriesUnit, 'USD B');
  assert.equal(back.quote.source, 'r/Freelancers');
  assert.equal(back.pitch.name, 'SafeSpend');
  assert.equal(back.decision, 'selected');
  assert.equal(back.decisionReason, 'broadest pain coverage');
  assert.deepEqual(cardGaps(back), []);
});

test('missing evidence stays null and is reported as a gap, never filled in', () => {
  const card = normalizeCard({ niche: 'n', volume: { value: 'lots' }, decision: 'bogus' });
  assert.equal(card.volume.value, null);
  assert.equal(card.decision, 'pending');
  assert.ok(cardGaps(card).includes('search volume + source'));
  const back = parseCard(upsertCardSections('# T\n', card));
  assert.equal(back.volume.value, null);
  assert.equal(back.trend.pct, null);
});

test('saveCard keeps checklists, links and summary, and re-saving replaces instead of duplicating', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'brainbook-card-'));
  try {
    const ideasPath = path.join(dir, 'ideas');
    await fs.mkdir(ideasPath, { recursive: true });
    const store = createIdeaStore({ vaultPath: dir, ideasPath, projectsPath: path.join(dir, 'Projects') });
    const [created] = await store.create({ items: [{ text: 'Safe spend app\nTell freelancers one number' }] });
    const file = path.join(dir, created.path);
    await fs.appendFile(file, '\n## Roadmap\n\n### Validate\n\n- [x] Read threads\n- [ ] Interview 3\n');
    await store.saveCard({ path: created.path, card: full });
    await store.saveCard({ path: created.path, card: { ...full, decision: 'rejected', decisionReason: 'too narrow' } });
    const text = await fs.readFile(file, 'utf8');
    assert.equal((text.match(/^## Decision$/gm) || []).length, 1);
    assert.match(text, /^decision: "rejected"$/m);
    assert.match(text, /^niche: /m);
    assert.match(text, /- \[x\] Read threads/);
    assert.match(text, /- \[ \] Interview 3/);
    assert.match(text, /## Summary\n\nTell freelancers one number/);
    assert.ok(text.indexOf('## Decision') < text.indexOf('## Roadmap'), 'card lands before the roadmap');
    const read = await store.readCard(created.path);
    assert.equal(read.card.decision, 'rejected');
    assert.equal((await store.readCard(created.path)).gaps.length, 0);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('saveCard refuses paths outside idea notes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'brainbook-card-'));
  try {
    const store = createIdeaStore({ vaultPath: dir, ideasPath: path.join(dir, 'ideas'), projectsPath: path.join(dir, 'Projects') });
    await assert.rejects(store.saveCard({ path: '../etc/passwd.md', card: full }), /Only idea notes/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
