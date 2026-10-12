import {build} from 'esbuild';
import fs from 'node:fs/promises';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {TEAM_MARKS} from '../src/team-marks.mjs';
import {launchTestBrowser} from './browser.mjs';
const dir='/Users/yuma/Documents/Hermes/work/brainbook-theme-20261010/evidence';
await build({entryPoints:['src/TeamMark.tsx'],outfile:'evidence/compiled/mark-preview.mjs',bundle:true,platform:'node',format:'esm',external:['react','react-dom','lucide-react']});
const {TeamMark}=await import('../evidence/compiled/mark-preview.mjs');
const css=(await fs.readFile('dist/index.html','utf8')).match(/href="([^"]+\.css)"/)[1];
const cards=Object.entries(TEAM_MARKS).map(([id,m])=>`<article>${renderToStaticMarkup(createElement(TeamMark,{id}))}<h2>${m.name}</h2><span>${m.glyph}</span></article>`).join('');
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="http://127.0.0.1:4199${css}"><style>body{padding:36px;background:#1d1420;color:#f8e4d9}.gallery{position:relative;z-index:2;max-width:860px;margin:auto}h1{font:700 26px Manrope,sans-serif;margin:0 0 6px}p{color:#ded0e5;margin:0 0 24px}section{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}article{display:flex;flex-direction:column;align-items:center;padding:22px;border:1px solid #bba8d240;border-radius:18px;background:#251928e8;box-shadow:inset 0 1px #ffffff0c}article .team-mark{width:64px;height:64px;border-radius:17px}article .team-mark svg{width:36px;height:36px}h2{font:600 16px Manrope,sans-serif;margin:12px 0 4px}article>span:last-child{color:#bba8c9;font:11px Manrope,sans-serif}.synthwave-backdrop{opacity:.30}</style></head><body><div class="synthwave-backdrop" style="background-image:linear-gradient(#1d142038,#1d1420),url('http://127.0.0.1:4199/brainbook-synthwave-bg.png')" aria-hidden="true"></div><main class="gallery"><h1>BrainBook · Department marks</h1><p>Approved warm colors + synthwave atmosphere. Design preview, not live status.</p><section>${cards}</section></main></body></html>`;
await fs.writeFile(dir+'/department-marks-preview.html',html);
const b=await launchTestBrowser();try{const p=await b.newPage({viewport:{width:960,height:720}});await p.setContent(html);await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:dir+'/department-marks-preview.png'});}finally{await b.close();}
console.log('Rendered nine real shared TeamMark components; no live progress or fabricated department execution.');
