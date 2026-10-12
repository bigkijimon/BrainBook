import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

test('icon-only team buttons retain exact accessible names and real filter identity',async()=>{
  await mkdir(new URL('../evidence/compiled/',import.meta.url),{recursive:true});
  const file=new URL('../evidence/compiled/icon-nav-test.mjs',import.meta.url);
  await build({entryPoints:[fileURLToPath(new URL('../src/TeamRail.tsx',import.meta.url))],outfile:fileURLToPath(file),bundle:true,platform:'node',format:'esm',external:['react','react-dom','lucide-react'],loader:{'.css':'empty'}});
  const {TeamRail}=await import(file.href);
  const teams=[{id:'app-dev',name:'AppPro',label:'App Development',live:false,members:[],specialists:[],work:[]}];
  const html=renderToStaticMarkup(createElement(TeamRail,{teams,allCount:0,onAll:()=>{},allActive:true,onSelect:()=>{}}));
  assert.match(html,/aria-label="All teams"/);
  assert.match(html,/aria-label="AppPro"/);
  assert.match(html,/data-team="app-dev"/);
  assert.match(html,/data-glyph="Code2"/);
  assert.match(html,/data-nav-label="AppPro/);
});
