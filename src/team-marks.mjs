// Canonical department symbols. Existing licensed Lucide geometry, not generated
// illustrations; consistent scale and framing distinguish these small navigation marks.
export const TEAM_MARKS = Object.freeze({
  'app-dev': {name:'AppAgent',glyph:'Code2',tone:'cyanGlow'},
  accountpro: {name:'AccountAgent',glyph:'Scale',tone:'sunGlow'},
  'hs-school-ops': {name:'ClassAgent',glyph:'GraduationCap',tone:'mintGlow'},
  investment: {name:'InvestAgent',glyph:'ChartNoAxesCombined',tone:'magentaGlow'},
  'igataya-web': {name:'Igataya',glyph:'CarFront',tone:'coral'},
  movie: {name:'MovieAgent',glyph:'Clapperboard',tone:'hotGlow'},
  marketing: {name:'CreativePro Marketing',glyph:'Megaphone',tone:'skyGlow'},
  blog: {name:'CreativePro',glyph:'BookOpen',tone:'lavender'},
  securitypro: {name:'SecurityAgent',glyph:'ShieldCheck',tone:'limeGlow'},
});
export function markFor(id) {
  return TEAM_MARKS[id === 'movie-pro' ? 'movie' : id] || {name:id,glyph:'AppWindow',tone:'lavender'};
}
