export type MarkGlyph = 'Code2'|'Scale'|'GraduationCap'|'ChartNoAxesCombined'|'CarFront'|'Clapperboard'|'Megaphone'|'BookOpen'|'ShieldCheck'|'AppWindow';
export type DepartmentMark = {name:string;glyph:MarkGlyph;tone:'pink'|'rose'|'coral'|'peach'|'lavender'|'lilac'|'mauve'|'cyanGlow'|'sunGlow'|'mintGlow'|'magentaGlow'|'skyGlow'|'hotGlow'|'limeGlow'};
export const TEAM_MARKS: Readonly<Record<string,DepartmentMark>>;
export function markFor(id:string): DepartmentMark;
