import type {CSSProperties} from 'react';
import {Code2,Scale,GraduationCap,ChartNoAxesCombined,CarFront,Clapperboard,Megaphone,BookOpen,ShieldCheck,AppWindow} from 'lucide-react';
import {markFor} from './team-marks.mjs';
import {themePalette} from './theme-palette.mjs';
const GLYPHS={Code2,Scale,GraduationCap,ChartNoAxesCombined,CarFront,Clapperboard,Megaphone,BookOpen,ShieldCheck,AppWindow};
export function TeamMark({id}:{id:string}) {
  const mark=markFor(id),Icon=GLYPHS[mark.glyph];
  return <span className="team-mark" data-mark={id} data-glyph={mark.glyph} style={{'--mark-color':themePalette[mark.tone]} as CSSProperties} aria-hidden="true"><Icon size={26} strokeWidth={1.9}/></span>;
}
