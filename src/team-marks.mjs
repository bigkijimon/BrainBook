// Canonical department symbols. Existing licensed Lucide geometry, not generated
// illustrations; consistent scale and framing distinguish these small navigation marks.
export const TEAM_MARKS = Object.freeze({
  'app-dev': {name:'AppPro',glyph:'Code2',tone:'cyanGlow'},
  accountpro: {name:'AccountPro',glyph:'Scale',tone:'sunGlow'},
  'hs-school-ops': {name:'ClassPro',glyph:'GraduationCap',tone:'mintGlow'},
  investment: {name:'InvestPro',glyph:'ChartNoAxesCombined',tone:'magentaGlow'},
  'igataya-web': {name:'RentPro',glyph:'CarFront',tone:'coral'},
  movie: {name:'MoviePro',glyph:'Clapperboard',tone:'hotGlow'},
  marketing: {name:'CreativePro Marketing',glyph:'Megaphone',tone:'skyGlow'},
  blog: {name:'CreativePro',glyph:'BookOpen',tone:'lavender'},
  securitypro: {name:'SecurityPro',glyph:'ShieldCheck',tone:'limeGlow'},
});
export function markFor(id) {
  return TEAM_MARKS[id === 'movie-pro' ? 'movie' : id] || {name:id,glyph:'AppWindow',tone:'lavender'};
}
