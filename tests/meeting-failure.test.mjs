import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMeetings } from '../meeting.mjs';

test('missing host/member/closing responses never become completed meetings', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'meeting-evidence-'));
  try {
    for (const mode of ['opening', 'member', 'closing', 'success']) {
      const home = path.join(tmp, mode);
      await fs.mkdir(home);
      const counter = path.join(home, 'calls');
      const host = path.join(home, 'hermes');
      await fs.writeFile(host, `#!${process.execPath}\nconst fs=require('fs');const p=${JSON.stringify(counter)};const n=Number(fs.existsSync(p)?fs.readFileSync(p,'utf8'):0)+1;fs.writeFileSync(p,String(n));if(${JSON.stringify(mode)}==='opening'||(${JSON.stringify(mode)}==='closing'&&n===2))process.exit(1);console.log('Host test answer.');\n`);
      await fs.chmod(host, 0o700);
      const worker = path.join(home, 'submit');
      await fs.writeFile(worker, `#!${process.execPath}\nlet input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{const p=JSON.parse(input);if(${JSON.stringify(mode)}==='member')process.exit(1);console.log(JSON.stringify({status:'completed',summary:'A test discussion answer.',task_id:p.task_id,worker:'free-worker',model:'free-model',worker_cost_policy:{mode:'free_only',paid_worker_execution:false}}));});\n`);
      await fs.chmod(worker, 0o700);
      const meetings = createMeetings({ appHome: home, hermesBin: host, env: { PATH: process.env.PATH }, cwd: home,
        routerSubmitPath: worker, workerHoldPath: path.join(home, 'no-hold') });
      const started = await meetings.start({ topic: 'Isolated fixture', members: ['MiMo'] });
      let result;
      for (let i = 0; i < 150; i++) {
        result = await meetings.get(started.id);
        if (result && result.status !== 'running') break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.equal(result?.status, mode === 'success' ? 'done' : 'failed', mode);
      assert.equal(result.summary.isError, mode !== 'success', mode);
      if (mode === 'opening') assert.equal(result.lines.length, 1, 'No worker round after failed opening');
      if (mode === 'member') assert.equal(await fs.readFile(counter, 'utf8'), '1', 'No closing call without a discussion');
      if (mode === 'success') {
        const member = result.lines.find((line) => line.who === 'MiMo' && line.kind === 'say');
        assert.equal(member.worker, 'free-worker');
        assert.equal(member.model, 'free-model');
        assert.match(member.routerTaskId, /^brainbook-/);
      }
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('meeting preflight refuses missing Router submit and shared hold before calling paid host', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'meeting-preflight-'));
  try {
    const hostCalls = path.join(tmp, 'host-calls');
    const host = path.join(tmp, 'hermes');
    await fs.writeFile(host, `#!${process.execPath}\nrequire('fs').appendFileSync(${JSON.stringify(hostCalls)}, '1');console.log('Host answer');\n`);
    await fs.chmod(host, 0o700);
    const submit = path.join(tmp, 'submit');
    await fs.writeFile(submit, `#!${process.execPath}\nprocess.exit(0);\n`);
    await fs.chmod(submit, 0o700);
    const hold = path.join(tmp, 'repair-hold.json');
    const options = { appHome: tmp, hermesBin: host, env: { PATH: process.env.PATH }, cwd: tmp,
      workerHoldPath: hold };
    const missing = createMeetings({ ...options, routerSubmitPath: null });
    await assert.rejects(missing.start({ topic: 'test', members: ['MiMo'] }), /not configured/);
    await fs.writeFile(hold, '{}');
    const held = createMeetings({ ...options, routerSubmitPath: submit });
    await assert.rejects(held.start({ topic: 'test', members: ['MiMo'] }), /repair hold is active/);
    await fs.unlink(hold);
    await fs.symlink(path.join(tmp, 'missing-target'), hold);
    await assert.rejects(held.start({ topic: 'test', members: ['MiMo'] }), /repair hold is active/);
    await assert.rejects(fs.stat(hostCalls), { code: 'ENOENT' });
    await assert.rejects(fs.stat(path.join(tmp, 'meetings')), { code: 'ENOENT' });
  } finally { await fs.rm(tmp, { recursive: true, force: true }); }
});
