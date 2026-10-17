// Test-only page for scripts/test-team-sheet-fit.mjs: the real left-rail TeamRail fed the teams
// agent-feed.py can actually emit, so "fits one screen" is measured instead of eyeballed.
//
// The previous fixture was lighter than anything the server sends, which is why a whole round of
// `ok`s meant nothing: no member was ever `live`, MoviePro is the only card the server caps at six
// "Now" rows, and no Router team outside AppPro was present at all — so the shape with sixteen role
// chips and ten "Now" rows (`roles[:16]`, `jobs[:5] + cards[:5]`, agent-feed.py) was measured for one
// team only, and four of the eight cards the rail can open were never measured at any viewport. Every
// card the server can emit is built here now, each one rebuilt the way the server builds it:
//
//   AppPro   (`app-dev`)      the Router card: reviewed lane + four configured profiles. Eleven
//                              members, `roles[:16]` chips, ten work rows — the card the owner saw.
//   AccountPro(`accountpro`)  same Router shape, three profiles: ten members.
//   ClassPro (`hs-school-ops`) same, three profiles: ten members.
//   RentPro  (`igataya-web`)   same, three profiles: ten members.
//   CreativePro Marketing(`marketing`) same, three profiles: ten members.
//   MoviePro (`movie`)        the film unit: MOVIE_CREW + the script lane, nested three levels deep.
//                              Fifteen members, MOVIE_SKILLS plus the script lane's role file (seven
//                              chips), six work rows. MOVIE_PARENT puts Ame under Shimajiro and
//                              ComfyUI under Maru; the fixture used to flatten both onto Steve, which
//                              hid the deepest indent in the grid.
//   CreativePro(`blog`)      CREATIVE_CREW: four members, CREATIVE_SKILLS (five), no chain.
//   InvestPro(`investment`)   not in REVIEWED_TEAM_IDS, so TEAM_CREW as configured plus the EVOLUTION
//                              tab — the one view of this dialog that is allowed to scroll.
//   StressPro(`stress-router`) not a team: the bound. MoviePro's fifteen members with AppPro's
//                              sixteen chips and ten work rows in one card, so the popup is measured
//                              against the union of the two heaviest shapes the server can build.
//
// `live` is a fifth column rather than a `withLive` pass because agent-feed.py sets it per member
// from running jobs (`member["live"] = member in busy`), so a card that is live carries the LIVE
// badge, which reserves its own width and can push the name onto a second line. A fixture where
// nothing is live never measures that card.
//
// No server, model, scheduler or network is used: the data is literal here and the page is served
// from disk by the test's own vite instance.
import { createRoot } from 'react-dom/client';
import { TeamRail } from '../../src/TeamRail';
// The app's own faces, imported as the same seven files src/main.tsx imports and in the same order.
// This is not decoration and it is not optional: "fits one screen" is measured in pixels, and every
// display box in the sheet is set in one of these faces — `.team-sheet h3` 22px Bungee
// (styles.css:1239), `.team-pane-label` and `.direct-label` (`:1273`, `:1575`), the LIVE badge in
// VT323 (`:1219`), the member count in DM Mono, every name and role line in Manrope. A substituted face
// has different metrics, so on a page without these imports `hasHeadroom`'s bar, `rowPitch` and every
// bounding box in scripts/test-team-sheet-fit.mjs were arithmetic on a layout BrainBook does not ship
// and every `ok` it printed described that layout instead. scripts/test-team-sheet-fit.mjs reads the
// faces back out of document.fonts rather than trusting this list to still be the app's list.
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/800.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/bungee/400.css';
import '@fontsource/yellowtail/400.css';
import '@fontsource/vt323/400.css';
import '../../src/styles.css';

// The shapes are read off the component rather than restated here, so a change to what `TeamRail`
// accepts is a type error in this file instead of a fixture that quietly stops describing a real card.
type Team = Parameters<typeof TeamRail>[0]['teams'][number];
type Member = Team['members'][number];

// One row per member, in the field order the fixtures below are written in:
// [name, parent, role, model, live]. `parent` is the only nullable string column, `model` the other
// nullable one, and `live` the only boolean, which is exactly the shape agent-feed.py writes:
// TEAM_PARENT / MOVIE_PARENT map a team's lead to None, every crew tuple carries a role sentence,
// and `model` rides along as null when the member has no model of its own. Written the other way
// round the fixture type fails `tsc` while the data it describes is correct, so it is spelled out
// here with named elements rather than left to inference.
type CrewRow = [name: string, parent: string | null, role: string, model: string | null, live?: boolean];

const crew = (rows: CrewRow[]): Member[] =>
  rows.map(([name, parent, role, model, live]) => ({ name, role, live: !!live, parent, model }));

// ── One Router card, built once ───────────────────────────────────────────────────────────────────
// Five of the eight teams the server emits are Router cards — every id in REVIEWED_TEAM_IDS except
// `movie` — and agent-feed.py builds every one of them the same way (`teams()` → TEAM_CREW + one member
// per configured profile, then `reviewed_structure()`): a seven-member reviewed lane, every configured
// profile re-parented under the lead, and `Claude Code` off both the member list and `direct`. One
// builder for all five, because five literals is five chances to drift from the server's shape — and the
// shape is the thing the popup's fit is measured on, not the names in it.
//
// What no fixture here can carry is the profile list itself: it lives in the Router registry's
// teams.yaml, which is not in this repository. The profile names below are stand-ins for each team's
// own subject matter, and the bound card exists precisely because the count is not knowable from here.
const REVIEWED_LANE: CrewRow[] = [
  ['Bigkiji', null, 'Owns the request, scope and delivery', null, true],
  ['Pi', 'Bigkiji', 'Prepares context, runs checks and cleans up task processes', 'Local scripts; no model selection'],
  ['Router', 'Pi', 'Selects workers by task, tools, current free eligibility and capability', 'Router / Themis'],
  ['MiMo', 'Router', 'Implementation through Router; configured model is not proof of availability', 'MiMo v2.6 Flash (backup Qwen3.8 27B · local)', true],
  ['Space Bunny', 'Router', 'UI through Router; configured model is not proof of availability', 'Space Bunny (OpenCode)'],
  ['QA / Debug', 'Router', 'Review requires defect evidence and a qualified free model', 'Selected per task; qualification required'],
  ['Jev', 'Bigkiji', 'Optional bounded advice; never worker selection or approval', 'Only when opted in and within the task budget'],
];
// [name, role, model]. `model` is omitted for a profile with no model of its own, which is what
// agent-feed.py's `member_models()` lookup returns for a name outside PROFILE_OF.
type Profile = [name: string, role: string, model?: string | null];
type Card = Omit<Team, 'members'>;

const WORKFLOW = 'Bigkiji → Pi preparation → Router selection → implementation → Pi checks → qualified review → bounded repair or delivery → task cleanup';
const WORKFLOW_NOTE = 'Structure describes the workflow. Each task still needs successful preparation, skill-load, check and review receipts. Role files are instructions, not additional running employees.';

const routerCard = (card: Card, profiles: Profile[]): Team => ({
  ...card,
  members: [
    ...crew(REVIEWED_LANE),
    // agent-feed.py:634 gives each configured profile the lead as its parent and appends the routing
    // caveat to the role sentence the registry carried, so the card still says which words are the
    // team's and which are the routing notice.
    ...profiles.map(([name, role, model]): Member => ({ name, role, live: false, parent: 'Bigkiji', model: model ?? null })),
  ],
  // `direct` is every profile plus the lane entries that survive (`Claude Code` is dropped, agent-feed.py:635).
  direct: [...(card.direct || []), ...profiles.map(([name]) => name)],
  workflow: card.workflow || WORKFLOW,
  workflow_note: card.workflow_note || WORKFLOW_NOTE,
});

// `roles[:16]` is the server's own cap (agent-feed.py:676), so sixteen is the real ceiling and not a
// round number chosen for the fixture.
const SIXTEEN_ROLES = ['code review', 'refactor', 'architecture', 'security review', 'performance', 'accessibility',
  'typescript', 'react patterns', 'css architecture', 'testing strategy', 'release notes', 'api design',
  'data model', 'migration', 'observability', 'incident review'];

// AppPro after reviewed_structure(app-dev) (agent-feed.py:580): the reviewed lane plus one member per
// configured profile, capitalised. Eleven members — the count the owner saw on screen — with the
// server's sixteen role chips and ten work rows, which is the tallest card BrainBook ships today.
const APP_CARD = routerCard({
  id: 'app-dev', name: 'AppPro', label: 'Engineering, UI and QA', live: true, specialists: SIXTEEN_ROLES,
  direct: ['MiMo', 'Bigkiji'],
  work: [{ member: 'MiMo', title: 'Repair the team popup layout on the phone breakpoint' },
    { member: 'Pi', title: 'Run the team checks after the popup change' },
    { member: 'Space Bunny', title: 'Polish the crew grid spacing at 1440' },
    { member: 'Claude Code', title: 'Reproduce the composer overlap and prove one cause' },
    { member: 'Tora', title: 'Narrow the sideways overflow on the crew grid' },
    { title: 'Review round on the Kanban board changes' },
    { member: 'Jev', title: 'Decide whether the repair round is retried free' },
    { title: 'Add the missing tsc scope for the harness page' },
    { title: 'Trim the release notes for build 204' },
    { member: 'Hana', title: 'Check the new worksheet PDFs page by page' }],
}, [['Tora', 'reproduce and narrow a failure to one proven cause', 'Qwen3.8 27B · local'],
  ['Hana', 'check worksheets, textbooks and PDFs as images', 'Qwen3.8 27B · local'],
  ['Frontend', 'build and review the front end against the design'],
  ['Backend', 'build and review the API and the data layer']]);

// The four other Router cards the server emits. Same builder, same seven-plus-profiles shape, and each
// one exists because "check every team, not just AppPro" is only true when the rail can open a card that
// was never measured — these four were the gap, and a fifth grew to three profiles each.
const ACCOUNT_CARD = routerCard({
  id: 'accountpro', name: 'AccountPro', label: 'Bookkeeping, tax and monthly close', live: true,
  specialists: ['bookkeeping', 'tax filing', 'reconciliation', 'payroll', 'monthly close', 'audit prep',
    'invoicing', 'expense policy', 'ledger review', 'deadline calendar', 'receipt capture', 'cash flow',
    'vat records', 'paye filings', 'year end', 'client reports'],
  direct: ['MiMo', 'Bigkiji'],
  work: [{ member: 'MiMo', title: 'Rebuild the monthly close sheet from the ledger export' },
    { member: 'Pi', title: 'Run the reconciliation checks for last month' },
    { member: 'Bookkeeping', title: 'Chase the two missing receipts from March', state: 'needs you' },
    { title: 'Review round on the tax filing checklist' },
    { member: 'Jev', title: 'Decide whether the close can be filed early' },
    { title: '5 post(s) in the invoice queue waiting for your approval' },
    { member: 'Reconciliation', title: 'Match the bank statement against the ledger', state: 'working' },
    { title: 'Update the expense policy note for the team' },
    { member: 'Tax Filing', title: 'Prepare the quarterly return draft' },
    { title: 'Archive last year\'s client reports' }],
}, [['Bookkeeping', 'keeps the ledger and the reconciliations straight'],
  ['Tax Filing', 'files the returns and tracks every deadline'],
  ['Reconciliation', 'matches each statement against the ledger']]);

const CLASS_CARD = routerCard({
  id: 'hs-school-ops', name: 'ClassPro', label: 'School operations and lesson prep', live: true,
  specialists: ['lesson prep', 'attendance', 'materials', 'parent notes', 'term plan', 'grading',
    'schedule', 'safeguarding', 'lesson review', 'homework', 'attendance report', 'class cover',
    'reading log', 'assessment', 'handouts', 'school calendar'],
  direct: ['MiMo', 'Bigkiji'],
  work: [{ member: 'Curriculum', title: 'Map the term plan onto the new textbook order' },
    { member: 'Hana', title: 'Check the worksheet PDFs page by page', state: 'working' },
    { title: '4 post(s) waiting for your approval' },
    { member: 'Attendance', title: 'Close last week\'s register' },
    { member: 'MiMo', title: 'Fix the class cover finder for the swapped lesson' },
    { title: 'Review round on the reading log export' },
    { member: 'Pi', title: 'Run the school checks after the cover change' },
    { title: 'Print the parent notes for the open evening' },
    { member: 'Materials', title: 'Order the missing worksheets for term two', state: 'needs you' },
    { title: 'Trim the safeguarding note to one page' }],
}, [['Curriculum', 'plans the term and the order of the lessons'],
  ['Attendance', 'keeps the register and the guardian notes'],
  ['Materials', 'orders and checks the worksheets and textbooks']]);

const RENT_CARD = routerCard({
  id: 'igataya-web', name: 'RentPro', label: 'Rental site, listings and viewings', live: true,
  specialists: ['listings', 'contracts', 'viewings', 'photos', 'search copy', 'pricing', 'deposit rules',
    'handover', 'maintenance', 'tenant replies', 'availability', 'area guides', 'photoshoot brief',
    'listing review', 'renewals', 'occupancy'],
  direct: ['MiMo', 'Bigkiji'],
  work: [{ member: 'Listings', title: 'Republish the three vacant units with new photos' },
    { member: 'Contracts', title: 'Prepare the renewal for the 2DK on the third floor' },
    { title: '4 post(s) waiting for your approval' },
    { member: 'MiMo', title: 'Fix the search filter that drops the parking option' },
    { member: 'Viewings', title: 'Book Saturday\'s three viewings', state: 'working' },
    { title: 'Review round on the deposit rule wording' },
    { member: 'Pi', title: 'Run the listing checks after the copy change' },
    { title: 'Answer the tenant reply about the water bill' },
    { member: 'Listings', title: 'Write the area guide for the station district', state: 'needs you' },
    { title: 'Archive last month\'s occupancy sheet' }],
}, [['Listings', 'writes and republishes the property listings'],
  ['Contracts', 'prepares the lease and the renewal paperwork'],
  ['Viewings', 'books the viewings and the handover']]);

const MARKET_CARD = routerCard({
  id: 'marketing', name: 'CreativePro Marketing', label: 'Campaigns, copy and growth', live: true,
  specialists: ['ad copy', 'landing pages', 'campaign setup', 'seo', 'newsletter', 'social calendar',
    'brand voice', 'keyword research', 'lifecycle email', 'attribution', 'budget review', 'competitor scan',
    'creative brief', 'landing test', 'onboarding copy', 'churn review'],
  direct: ['MiMo', 'Bigkiji'],
  work: [{ member: 'Campaigns', title: 'Read the numbers on last week\'s ad set' },
    { member: 'Copywriting', title: 'Write the three subject lines for the launch mail', state: 'working' },
    { title: '5 post(s) in the social queue waiting for your approval' },
    { member: 'SEO', title: 'Fix the two pages that lost their canonical tag' },
    { member: 'MiMo', title: 'Rebuild the attribution sheet from the export' },
    { title: 'Review round on the landing test copy' },
    { member: 'Pi', title: 'Run the campaign checks after the copy change' },
    { title: 'Trim the launch brief to one page' },
    { member: 'Campaigns', title: 'Move the budget from the paused ad set', state: 'needs you' },
    { title: 'Close out last month\'s newsletter numbers' }],
}, [['Copywriting', 'writes the ad copy and the landing pages'],
  ['Campaigns', 'sets the campaign up and reads the numbers'],
  ['SEO', 'keeps the site findable']]);

// The bound, not a team. A Router card's member count is seven plus one per configured profile and
// nothing in the server caps the profile list, so this card takes the largest chain the roster has
// (MoviePro's fifteen members) and hangs AppPro's ceiling on it — sixteen role chips, ten work rows,
// ten recipient chips — which is the union of the two heaviest shapes there are. A fit that holds here
// is a claim about the layout; a fit that only holds on today's roster is a claim about the roster.
const BOUND_CARD = routerCard({
  id: 'stress-router', name: 'StressPro', label: 'The heaviest card the layout is measured against', live: true,
  specialists: SIXTEEN_ROLES, direct: ['MiMo', 'Bigkiji'],
  work: [{ member: 'MiMo', title: 'Rebuild the batch import through Router', state: 'working' },
    { member: 'Backend', title: 'Move the render queue onto the second worker', state: 'working' },
    { member: 'Frontend', title: 'Cut the gate report to the two lines that matter', state: 'working' },
    { member: 'Pi', title: 'Run the team checks after the popup change' },
    { title: '5 post(s) in the approval queue' },
    { member: 'Claude Code', title: 'Reproduce the composer overlap and prove one cause' },
    { title: 'Review round on the Kanban board changes' },
    { member: 'Jev', title: 'Decide whether the repair round is retried free' },
    { title: 'Trim the release notes for the next build', state: 'needs you' },
    { member: 'Tora', title: 'Narrow the sideways overflow on the crew grid' }],
}, [['Tora', 'reproduce and narrow a failure to one proven cause', 'Qwen3.8 27B · local'],
  ['Hana', 'check worksheets, textbooks and PDFs as images', 'Qwen3.8 27B · local'],
  ['Frontend', 'build and review the front end against the design'],
  ['Backend', 'build and review the API and the data layer'],
  ['Reconciliation', 'match each statement against the ledger'],
  ['Listings', 'write and republish the property listings'],
  ['Curriculum', 'plan the term and the order of the lessons'],
  ['Copywriting', 'write the ad copy and the landing pages']]);

// MoviePro after reviewed_structure(movie) (agent-feed.py:584): the nine MOVIE_CREW members minus
// MiMo and Space Bunny, then the six-lane script crew re-added under Steve. MOVIE_PARENT is the
// reporting line and it nests: Ame sits under Shimajiro and ComfyUI under Maru, and the script lane
// hangs three levels down off Router — the deepest indent the grid has to carry.
const MOVIE_MEMBERS = crew([
  ['Steve', null, 'production director', 'Claude Opus 4.1'],
  ['HideoKojima', 'Steve', 'scenario and world', null],
  ['RyūichiSakamoto', 'Steve', 'audio', null],
  ['Kuro', 'Steve', 'independent review', 'Claude Opus 4.1', true],
  ['Shimajiro', 'Steve', 'education brief', 'Claude Sonnet 4.5'],
  ['Ame', 'Shimajiro', 'education research', 'Claude Sonnet 4.5'],
  ['Maru', 'Steve', 'GPU operation', 'Claude Opus 4.1', true],
  ['Auto QA', 'Steve', 'automatic QA: cut, keyframe, unit gate', null, true],
  ['ComfyUI', 'Maru', 'image and video generation (GPU)', 'Qwen-Image-Edit 2511 + LTX-2.5 22B'],
  ['Pi', 'Steve', 'Prepares context, runs checks and cleans up task processes', 'Local scripts; no model selection'],
  ['Router', 'Pi', 'Selects workers by task, tools, current free eligibility and capability', 'Router / Themis'],
  ['MiMo', 'Router', 'Builds scripts through Router', 'MiMo v2.6 Flash (backup Qwen3.8 27B · local)'],
  ['Space Bunny', 'Router', 'Script review through Router; qualification required', 'Space Bunny (OpenCode)'],
  ['QA / Debug', 'Router', 'Review requires defect evidence and a qualified free model', 'Selected per task; qualification required'],
  ['Jev', 'Steve', 'Optional bounded advice; never worker selection or approval', 'Only when opted in and within the task budget'],
]);

// `blog` is not in REVIEWED_TEAM_IDS, so it keeps CREATIVE_CREW (agent-feed.py) and gets only the
// note agent-feed.py:757 writes for it. The shortest chain in the roster: four members.
const BLOG_MEMBERS = crew([
  ['CreativeProTop-Momo', null, 'lead: content and SNS', 'Claude Sonnet 4.5', true],
  ['Coco', 'CreativeProTop-Momo', 'AI influencer', null],
  ['Blog QA', 'CreativeProTop-Momo', 'H&S blog 95-point gate', 'Qwen3.8 27B · local'],
  ['Tech Blog QA', 'CreativeProTop-Momo', 'tech blog 95-point gate', 'Qwen3.8 27B · local'],
]);

// `investment` is excluded from REVIEWED_TEAM_IDS (agent-feed.py:577), so its card carries the raw
// Router lane: no `workflow` chain and no `workflow_note` at all, which is why the EVOLUTION tab is
// the only thing this fixture is here for.
const INVEST_MEMBERS = crew([
  ['Bigkiji', null, 'routes and reports', null],
  ['Pi', 'Bigkiji', 'support: brief + checks', null],
  ['MiMo', 'Pi', 'builder', 'MiMo v2.6 Flash (backup Qwen3.8 27B · local)'],
  ['Space Bunny', 'Pi', 'UI', 'Space Bunny (OpenCode)'],
  ['Claude Code', 'Bigkiji', 'debug first (reproduce + root cause), then QA; difficult', 'Claude Code'],
  ['Jev', 'Bigkiji', 'decision support', null],
]);

const teams: Team[] = [APP_CARD, ACCOUNT_CARD, CLASS_CARD, RENT_CARD, MARKET_CARD, BOUND_CARD,
  { id: 'movie', name: 'MoviePro', label: 'Lesson videos, scripts and GPU', live: true, members: MOVIE_MEMBERS,
    // MOVIE_SKILLS plus the script lane's own role file, read from the Router registry like every
    // other team (agent-feed.py role_labels). Six chips used to be a literal here, which is how the
    // merged card came out with less on it than the two cards it replaced.
    specialists: ['film scenario', 'film preproduction', 'film identity', 'movie character reference', 'movie video generation', 'film review', 'AGENTS'],
    direct: ['Steve', 'Kuro', 'Ame', 'Shimajiro', 'Maru', 'MiMo'],
    // "Now" in the order agent-feed.py emits it for the merged card: the script lane's Router jobs and
    // `team: movie-pro` cards first, then the movie board's own cards (agent-feed.py:756). The fixture
    // used to lead with the film crew, which is an order the server never produces - a capture that shows
    // the owner a different "Now" than the one he will get is not a measurement.
    work: [{ member: 'MiMo', title: 'Rebuild the lesson 05 script through Router', state: 'working' },
      { title: '5 post(s) in the lesson script lane' },
      { member: 'Maru', title: 'Render lesson 04 keyframes on the GPU', state: 'working' },
      { member: 'Auto QA', title: 'Whisper + Vision gate on lesson 03 cut 2', state: 'working' },
      { member: 'Steve', title: 'Sign off lesson 03 final cut', state: 'ready' },
      { title: 'Repair round on the team popup layout' }],
    // agent-feed.py MOVIE_WORKFLOW, verbatim. It used to be the `movie-pro` lane's chain behind a
    // "Script work only:" prefix, so the capture the owner judges showed the sub-lane's process as the
    // workflow of a card whose label and fifteen members are the whole film team. This string is the one
    // the captures are measured against, so it must not be a paraphrase.
    workflow: 'Steve directs → brief and research → scenario and audio → MiMo builds the script, Space Bunny checks it → keyframes and video on the GPU → Auto QA gate → final unit',
    workflow_note: WORKFLOW_NOTE },
  { id: 'blog', name: 'CreativePro', label: 'Blogs, SNS, AI influencer (publication needs Yuma)', live: true, members: BLOG_MEMBERS,
    specialists: ['blog pipeline', 'sns studio', 'influencer studio', 'blog qa', 'tech blog qa'],
    direct: ['CreativeProTop-Momo'],
    work: [{ member: 'CreativeProTop-Momo', title: 'Draft: three ways to test an agent', state: 'working' },
      { member: 'Coco', title: 'Plan the next AI influencer still', state: 'working' },
      { title: '4 post(s) in the SNS queue waiting for your approval' },
      { member: 'Blog QA', title: 'Score the H&S draft against the 95-point gate', state: 'ready' },
      { member: 'Tech Blog QA', title: 'Check the code claims in the React draft', state: 'ready' },
      { title: 'Update the blog pipeline runbook' }],
    workflow_note: 'CreativeProTop-Momo owns drafts and publication approval. Universal Pi support and Router dispatch are not yet verified for this native profile path.' },
  { id: 'investment', name: 'InvestPro', label: 'Trading research and the evolution arena', live: false, members: INVEST_MEMBERS,
    specialists: ['market structure', 'risk model', 'backtest review', 'position sizing'],
    direct: ['MiMo', 'Bigkiji'],
    work: [{ member: 'MiMo', title: 'Add the new gate to the backtest report', state: 'working' },
      { title: '4 post(s) waiting for your approval' }],
  }];

createRoot(document.getElementById('root')!).render(<TeamRail teams={teams} allCount={0} onAll={() => {}} allActive={false} />);