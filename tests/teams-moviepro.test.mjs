// One MoviePro card (owner 2026-10-02, "まとめて"): the Router team `movie-pro` is MoviePro's
// script-fix lane, not a separate department, so the team list must not show it twice. This is the
// only test that drives agent-feed.py `teams` at all, so it is also the loop that catches a
// duplicate card, a "Film Group" label or a hard-coded model if they come back.
//
// Everything the command reads is a fixture written under os.tmpdir(): HERMES_HOME, the Router
// config dir (teams.yaml, workers.yaml, adapters/mimo) and the Router jobs dir. No real config,
// Kanban board or profile is touched, so the test is deterministic and read-only.
//
// The other half of "one team" is the word on the surfaces that print a team without the card — the
// live strip and the hand-off log — where the lane used to be announced as the raw id `movie-pro`
// and MoviePro's own work as `movie`. `team_short_name` (agent-feed.py) is the one function both
// feeds read, and it is pinned in tests/test_reviewed_team_structure.py, next to the other display
// units. It cannot be pinned here: a hand-off that carries a team name comes out of a Kanban board
// database, and building one needs a sqlite driver this suite does not have.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

const run = promisify(execFile);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Router team registry as the owner described it: `movie-pro` now carries the label "MoviePro",
// which is what made the rail show two identically named cards.
const FIXTURE_TEAMS = (roots) => ({
  teams: {
    'movie-pro': { label: 'MoviePro', root: roots.script, roles: ['AGENTS.md'] },
    'app-dev': { label: 'App Development', root: roots.app, roles: ['AGENTS.md'] },
  },
});

// One job per lane: the script-fix lane is live under the movie-pro root, the app lane is not.
// The model id is what `agent-feed.py` maps "space-bunny" from for the UI lane of the card.
const fixture = ({ workers, running = true }) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'brainbook-teams-'));
  const home = path.join(dir, 'hermes');
  const config = path.join(dir, 'router', 'config');
  const jobs = path.join(dir, 'router', 'jobs');
  const roots = { script: path.join(dir, 'router', 'movie-pro'), app: path.join(dir, 'router', 'app-dev') };
  mkdirSync(home, { recursive: true });
  mkdirSync(config, { recursive: true });
  mkdirSync(path.join(dir, 'router', 'adapters'), { recursive: true });
  mkdirSync(path.join(jobs, 'running'), { recursive: true });
  writeFileSync(path.join(config, 'teams.yaml'), JSON.stringify(FIXTURE_TEAMS(roots)));
  writeFileSync(path.join(config, 'workers.yaml'), JSON.stringify(workers));
  writeFileSync(path.join(dir, 'router', 'adapters', 'mimo'), '#!/bin/sh\n  "ui": ("space-bunny-free", "opencode"),\n');
  if (running) {
    writeFileSync(path.join(jobs, 'running', 'j1.json'), JSON.stringify({
      route: 'mimo', model: 'mimo-v2.6-flash',
      objective: 'Fix the pacing in cut 04 of lesson 28', working_directory: roots.script,
    }));
    writeFileSync(path.join(jobs, 'running', 'j2.json'), JSON.stringify({
      route: 'mimo', team_role: 'ui', model: 'space-bunny-free',
      objective: 'Check lesson 28 against the script', working_directory: roots.script,
    }));
  }
  return { dir, home, config, jobs };
};

const readTeams = async (f) => {
  const { stdout } = await run(process.env.ASTER_PYTHON || 'python3',
    [path.join(root, 'agent-feed.py'), f.home, 'teams', f.config, f.jobs], { cwd: root, maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(stdout);
};

const WORKERS = {
  workers: {
    mimo: { model: 'mimo-v2.6-flash' },
    claude: { model: 'claude-opus-4-1' },
    vision: { model: 'Qwen2.5-VL-7B' },
  },
};

test('the team list shows MoviePro once, with the script lane inside it', async () => {
  const body = await readTeams(fixture({ workers: WORKERS }));
  const named = body.teams.filter((team) => (team.name + team.label + team.id).includes('MoviePro'));

  assert.equal(named.length, 1, `expected one MoviePro card, got ${JSON.stringify(body.teams.map((t) => [t.id, t.name, t.label]))}`);
  assert.equal(named[0].id, 'movie');
  // The one card is *named* MoviePro, and this is load-bearing now that TEAM_SHORT carries the lane
  // as well as the team (agent-feed.py): a lane card that stopped being skipped would be named the
  // same word, so the count and the id above are the only things standing between the owner and two
  // identically named cards. The card must answer to the team, never to the Router lane's own label.
  assert.equal(named[0].name, 'MoviePro', `the MoviePro card is named ${named[0].name}, not the team`);
  assert.doesNotMatch(JSON.stringify(body.teams), /Film Group/, 'the Film Group card is the duplicate this replaces');
  assert.ok(!body.teams.some((team) => team.id === 'movie-pro'), 'the script lane is not its own card');

  const movie = named[0];
  const byName = new Map(movie.members.map((member) => [member.name, member]));
  // Film Group members stay, and the script lane is added under the same card.
  for (const member of ['Steve', 'HideoKojima', 'RyūichiSakamoto', 'Kuro', 'Shimajiro', 'Ame', 'Maru', 'Auto QA', 'ComfyUI']) {
    assert.ok(byName.has(member), `${member} must stay on the MoviePro card`);
  }
  assert.equal(byName.get('MiMo').role, 'Builds scripts through Router');
  assert.equal(byName.get('Space Bunny').role, 'Script review through Router; qualification required');
  // Claude Code never ran on this lane; showing it with "Claude Sonnet" was the confusion.
  assert.ok(!byName.has('Claude Code'), 'the paid escalation is not a MoviePro member');

  // Model text is read from the Router config, never written here: workers.yaml mimo and the
  // adapters/mimo UI lane. A literal like "Claude Sonnet" would mean the config is bypassed.
  assert.equal(byName.get('MiMo').model, 'MiMo v2.6 Flash');
  assert.equal(byName.get('Space Bunny').model, 'Space Bunny (OpenCode)');
  assert.equal(body.models.MiMo, 'MiMo v2.6 Flash');

  // The lane is live when its Router job is, and it reports under the MoviePro director.
  assert.equal(byName.get('MiMo').live, true, 'the running script job marks MiMo live');
  assert.equal(byName.get('Space Bunny').live, true, 'a ui-lane job belongs to Space Bunny');
  assert.equal(byName.get('MiMo').parent, 'Router');
  assert.equal(byName.get('Router').parent, 'Pi');
  assert.equal(byName.get('Pi').parent, 'Steve');
  assert.equal(movie.live, true);
  assert.ok(movie.work.some((item) => item.member === 'MiMo' && /cut 04/.test(item.title)), 'the script job is listed under Now');

  // One card means one chain. The band above the crew is the loudest sentence on the sheet, and it used
  // to be the `movie-pro` lane's own chain behind a "Script work only:" prefix: it described two of the
  // card's fifteen members and contradicted the label directly above it. The merged card has to speak for
  // both halves it now holds - the film departments and the script lane inside them - so the router lane's
  // chain must not survive anywhere in it.
  assert.doesNotMatch(movie.workflow, /Script work only/, 'the two-department headline came back');
  assert.doesNotMatch(movie.workflow, /Router selection/, `the router lane's chain is another team's workflow: ${movie.workflow}`);
  assert.match(movie.workflow, /Steve.*scenario.*audio.*MiMo.*Space Bunny.*GPU.*Auto QA/,
    `the chain must name the production departments and the script lane it carries: ${movie.workflow}`);

  // The instruct row must only offer members server.mjs directTarget can really file a card for,
  // otherwise the button answers "This member cannot take direct instructions."
  assert.deepEqual(movie.direct, ['Steve', 'Kuro', 'Ame', 'Shimajiro', 'Maru', 'MiMo']);
  assert.ok(movie.direct.every((name) => byName.has(name)), 'never offer a target the card does not show');

  // The merged card must not be less informative than the two cards it replaces. The film unit's six
  // department skills used to be hard-coded here and the lane's `roles` were emitted nowhere at all,
  // because the lane's card is this card now — so reading only MOVIE_SKILLS quietly dropped something
  // the owner could see before.
  assert.deepEqual(movie.specialists.slice(0, 6), ['film scenario', 'film preproduction', 'film identity',
    'movie character reference', 'movie video generation', 'film review']);
  assert.ok(movie.specialists.includes('AGENTS'),
    `the script lane's role file is missing from the merged card: ${JSON.stringify(movie.specialists)}`);
});

test('an idle script lane shows no live member', async () => {
  const movie = (await readTeams(fixture({ workers: WORKERS, running: false }))).teams.find((team) => team.id === 'movie');
  const script = movie.members.filter((member) => member.role === 'Builds scripts through Router' || member.role === 'Script review through Router; qualification required');
  assert.equal(script.length, 2);
  assert.deepEqual(script.map((member) => member.live), [false, false], 'no Router job means no LIVE badge on the lane');
  assert.ok(!movie.work.some((item) => /cut 04/.test(item.title || '')), 'a finished lane leaves nothing under Now');
});

test('without the movie-pro team in the registry there is no script lane to show', async () => {
  const f = fixture({ workers: WORKERS });
  writeFileSync(path.join(f.config, 'teams.yaml'), JSON.stringify({ teams: { 'app-dev': FIXTURE_TEAMS({ script: '/x', app: '/y' }).teams['app-dev'] } }));
  const movie = (await readTeams(f)).teams.find((team) => team.id === 'movie');
  assert.ok(!movie.members.some((member) => member.name === 'MiMo'), 'the lane is only shown when the Router config has it');
});

test('reviewed teams require qualified free QA instead of fixed paid Claude', async () => {
  for (const workers of [WORKERS, { workers: { mimo: { model: 'mimo-v2.6-flash' } } }]) {
    const app = (await readTeams(fixture({ workers }))).teams.find((team) => team.id === 'app-dev');
    assert.ok(!app.members.some((member) => member.name === 'Claude Code'));
    assert.match(app.members.find((member) => member.name === 'QA / Debug').model, /qualification required/);
    assert.equal(app.members.find((member) => member.name === 'Router').parent, 'Pi');
    assert.ok(!app.direct.includes('Claude Code'));
  }
});
