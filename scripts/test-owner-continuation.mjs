// Focused source/SSR contracts; actual layout and keyboard checks live in test-owner-browser.mjs.
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {test} from 'node:test';
import {build} from 'esbuild';
import postcss from 'postcss';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const root=process.cwd(), source=path.resolve(process.env.BRAINBOOK_TEST_SOURCE || root);
await mkdir('evidence/compiled',{recursive:true});
const text=await readFile(path.join(source,'src/AgentFeed.tsx'),'utf8');
const outfile=path.join(root,'evidence/compiled/continuation-feed.mjs');
await build({stdin:{contents:text+'\nexport { AgentText };',resolveDir:path.join(root,'src'),sourcefile:'AgentFeed.tsx',loader:'tsx'},outfile,bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react-dom','lucide-react']});
const {AgentText}=await import(pathToFileURL(outfile));
const css=postcss.parse(await readFile(path.join(source,'src/styles.css'),'utf8'));
function declarations(selector) {
 const result={}; css.walkRules(rule=>{if(rule.parent.type==='root' && rule.selector.split(',').map(s=>s.trim()).includes(selector)) rule.walkDecls(d=>{result[d.prop]=d.value;});}); return result;
}
test('search does not allocate a horizontal width basis as column height',()=>{
 const search=declarations('.console-search');
 assert.equal(search.flex,'none','column labels must not grow or use a 160px main-axis basis');
 const input=declarations('.console-search input');
 assert.equal(input.height,'44px','single-line input needs a bounded height in either flex axis');
 assert.equal(input['box-sizing'],'border-box','padding must fit inside the 44px target');
});
test('default local/server notice prose uses the shared English summary and keeps raw URLs',()=>{
 const raw='🧹 Pi cleanup: no test server left running; kept /Users/yuma/test/root_lock.py\nDetails:\nstdout: t_123abc https://example.com/result https://example.com/log';
 const html=renderToStaticMarkup(createElement(AgentText,{text:raw}));
 const defaultHtml=html.replace(/<details\b[\s\S]*?<\/details>/g,'');
 assert.ok(!defaultHtml.includes('Pi cleanup')&&!defaultHtml.includes('stdout')&&!defaultHtml.includes('/Users/'));
 assert.ok(defaultHtml.includes('Report available. See Original.')||defaultHtml.includes('Report available. See Original.'));
 assert.ok(html.includes('Original')&&html.includes('Pi cleanup')&&html.includes('t_123abc'));
 assert.ok(defaultHtml.includes('href="https://example.com/result"')&&defaultHtml.includes('href="https://example.com/log"'));
 assert.equal((text.match(/<AgentText text=\{message\.raw \?\? message\.text\}/g)||[]).length,2,'both notice and toast must use the original through the same presenter');
 assert.ok(text.includes('messageSummary(head.raw ?? head.text)'),'collapsed bell summary must share the same rule');
});
test('known messages retain their precise meaning',()=>{
 const html=renderToStaticMarkup(createElement(AgentText,{text:'Task completed.'}));
 assert.ok(html.includes('Work was reported complete.')&&html.includes('Task completed.'));
});
test('secondary actions have a native keyboard disclosure and Escape focus return',async()=>{
 const app=await readFile(path.join(source,'src/App.tsx'),'utf8');
 assert.ok(app.includes('<details className="topbar-more"'));
 assert.ok(app.includes('<summary aria-label="More actions"'));
 assert.ok(app.includes("event.key === 'Escape'")&&app.includes("querySelector('summary')?.focus()"));
 const start=app.indexOf('<div className="topbar-secondary">'),end=app.indexOf('</details>',start);
 const actions=app.slice(start,end);
 for(const action of ['routine-menu','<AgentFeed','<RunShortcut','dump-toggle','brain-toggle','avatar-button']) assert.ok(actions.includes(action),`${action} must remain accessible inside More`);
 const header=declarations('.app-shell .topbar');
 assert.equal(header['flex-wrap'],'nowrap');
 assert.equal(header['min-height'],'60px');
});
