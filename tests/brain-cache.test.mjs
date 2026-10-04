import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildBrain } from '../brain.mjs';

test('graph cache follows note identity and vault, not only note count and mtime', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'brain-cache-'));
  const previous = process.env.BRAINBOOK_GRAPHIFY_PATH;
  delete process.env.BRAINBOOK_GRAPHIFY_PATH;
  try {
    const notes = id => [{ path: `${id}.md`, title: id, kind: 'idea' }];
    for (const name of ['A', 'B']) {
      const vault = path.join(root, name);
      await fs.mkdir(path.join(vault, 'graphify-out'), { recursive: true });
      const graph = path.join(vault, 'graphify-out/graph.json');
      await fs.writeFile(graph, JSON.stringify({ nodes: [{ id: 1, source_file: `${name}.md`, label: `${name} concept` }], links: [] }));
      await fs.utimes(graph, 100, 100);
    }
    const a = await buildBrain({ vaultPath: path.join(root, 'A'), notes: notes('A'), readText: async () => '' });
    assert.equal(a.nodes[0].concepts, 1);
    const differentNotes = await buildBrain({ vaultPath: path.join(root, 'A'), notes: notes('B'), readText: async () => '' });
    assert.equal(differentNotes.sources.graphify.notesCovered, 0);
    const b = await buildBrain({ vaultPath: path.join(root, 'B'), notes: notes('B'), readText: async () => '' });
    assert.equal(b.nodes[0].concepts, 1);
    const explicit = path.join(root, 'external.json');
    await fs.writeFile(explicit, JSON.stringify({ nodes: 'invalid', links: [] }));
    process.env.BRAINBOOK_GRAPHIFY_PATH = explicit;
    const bad = await buildBrain({ vaultPath: root, notes: notes('A'), readText: async () => '' });
    assert.equal(bad.sources.graphify.available, false);
  } finally {
    if (previous === undefined) delete process.env.BRAINBOOK_GRAPHIFY_PATH;
    else process.env.BRAINBOOK_GRAPHIFY_PATH = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
});
