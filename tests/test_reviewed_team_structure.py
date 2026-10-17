"""Pure display tests with synthetic teams, no service/profile/board reads."""
import ast
import copy
from pathlib import Path
import unittest


# Everything `reviewed_structure` and `team_short_name` read at module level. The helper below execs
# them on their own, so a name they need has to be listed here as well: the display strings are module
# constants, and a chain that lives inside a function body is a fact with no name outside it.
DISPLAY_CONSTANTS = {'REVIEWED_TEAM_IDS', 'ROUTER_WORKFLOW', 'MOVIE_WORKFLOW', 'TEAM_SHORT', 'PROJECT_LABELS'}
DISPLAY_FUNCTIONS = {'reviewed_structure', 'team_short_name'}


def display():
    source=Path(__file__).resolve().parents[1] / 'agent-feed.py'
    tree=ast.parse(source.read_text())
    nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in DISPLAY_FUNCTIONS
           or isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in DISPLAY_CONSTANTS for t in n.targets)]
    ns={}; exec(compile(ast.Module(nodes, type_ignores=[]),str(source),'exec'),ns)
    return ns


def helper():
    return display()['reviewed_structure']


def fixture(team_id='app-dev'):
    return {'id':team_id,'members':[{'name':n,'role':'old','live':False,'parent':None,'model':'configured'}
            for n in ('Bigkiji','Pi','MiMo','Space Bunny','Claude Code','Jev')],
            'direct':['MiMo','Claude Code','Bigkiji']}


class DisplayTests(unittest.TestCase):
    def test_each_reviewed_lane_places_selection_below_support(self):
        for team_id in ('app-dev','accountpro','hs-school-ops','igataya-web','marketing'):
            team=fixture(team_id); helper()(team)
            members={m['name']:m for m in team['members']}
            self.assertEqual(members['Router']['parent'],'Pi')
            self.assertEqual(members['MiMo']['parent'],'Router')
            self.assertEqual(members['QA / Debug']['parent'],'Router')
            self.assertNotIn('Claude Code',members)
            self.assertIn('qualification required',members['QA / Debug']['model'])
            self.assertFalse(members['Pi']['live'])
            self.assertIn('task cleanup',team['workflow'])

    def test_excluded_and_unknown_teams_are_unchanged(self):
        for team_id in ('investment','future-team','blog'):
            team=fixture(team_id); before=copy.deepcopy(team); helper()(team)
            self.assertEqual(before,team)

    def test_movie_script_branch_preserves_production_members(self):
        team=fixture('movie')
        prod=[{'name':'Steve','role':'production director','live':True},
              {'name':'Maru','role':'GPU operation','parent':'Steve','live':True}]
        team['members']=prod+team['members'][2:4]
        helper()(team)
        members={m['name']:m for m in team['members']}
        self.assertEqual(members['Steve'],prod[0]); self.assertEqual(members['Maru'],prod[1])
        self.assertEqual(members['Pi']['parent'],'Steve')

    def test_movie_card_heads_the_film_chain_with_the_script_lane_inside(self):
        # The chain band is the loudest sentence on the merged card, so it has to speak for the whole
        # team: the film departments AND the script lane that moved inside this card. It used to be the
        # Router lane's chain behind a "Script work only:" prefix, which described two of fifteen members
        # and contradicted the label above it. This asserts the facts a card cannot state wrongly rather
        # than the exact sentence, so honest rewording still passes and the two-department model cannot.
        ns=display(); team=fixture('movie'); ns['reviewed_structure'](team)
        chain=team['workflow']
        self.assertNotIn('Script work only',chain)
        self.assertNotEqual(chain,ns['ROUTER_WORKFLOW'],'the Router lane chain is another team\'s workflow')
        for stage in ('Steve','scenario','audio','MiMo','Space Bunny','GPU','Auto QA'):
            self.assertIn(stage,chain,f'the chain band no longer names {stage}: {chain}')
        self.assertEqual(chain,ns['MOVIE_WORKFLOW'])
        # The band is pinned above the crew inside a sheet that must not scroll, so its length is a
        # layout fact, not a writing preference: one line at 1440 is the budget (measured at 1440x700 and
        # on the phone by scripts/test-team-sheet-fit.mjs).
        self.assertLessEqual(len(chain),165,f'the chain wraps on the desktop sheet: {len(chain)} characters')

    def test_no_registered_movie_script_lane_is_not_invented(self):
        team={'id':'movie','members':[{'name':'Steve','role':'director','live':False}]}
        before=copy.deepcopy(team); helper()(team); self.assertEqual(before,team)



class TeamNamingTests(unittest.TestCase):
    # Owner 2026-10-02 ("まとめて"): MoviePro is ONE team, so the lane's id is never the word on screen.
    # `team_short_name` is the one function both feeds read (the live strip and the hand-off log), and
    # MoviePro's own work used to be announced as `movie` while its script lane was announced as
    # `movie-pro` — two raw ids for one team, where every other team read "AppPro". Putting the lane in
    # the short-name table is what makes it resolvable; the table cannot make a second card, because
    # `teams()` skips the lane before it reads TEAM_SHORT (MOVIE_SCRIPT_TEAM, tests/teams-moviepro).
    def test_both_ids_of_moviepro_are_named_moviepro(self):
        ns=display();short=ns['team_short_name']
        self.assertEqual(ns['TEAM_SHORT']['movie-pro'],'MoviePro')
        self.assertEqual(short('movie'),'MoviePro')
        self.assertEqual(short('movie-pro'),'MoviePro')
        self.assertEqual({short(k) for k in ('movie','movie-pro')},{'MoviePro'},
                         'MoviePro is one team, so one word names both halves of it')

    def test_a_team_the_table_has_not_seen_keeps_its_own_text(self):
        short=display()['team_short_name']
        self.assertEqual(short('app-dev'),'AppPro')
        self.assertEqual(short('future-team'),'future-team','a Router team added tomorrow is shown, not blanked')
        # A card with no `team:` hint adds no team name at all, which is what `None` is for.
        self.assertIsNone(short(None))

    def test_no_visible_label_names_the_script_lane_as_a_team_of_its_own(self):
        labels=[label for _marker,label in display()['PROJECT_LABELS']]
        self.assertTrue(labels)
        stale=[label for label in labels if 'movie-pro' in label]
        self.assertEqual(stale,[],f'the lane is named as a team again: {stale}')


class EndpointTests(unittest.TestCase):
    def test_endpoint_emits_workflow_without_changing_excluded_team(self):
        import contextlib, importlib.util, io, json, tempfile
        from unittest.mock import patch
        source=Path(__file__).resolve().parents[1] / 'agent-feed.py'
        spec=importlib.util.spec_from_file_location('candidate_feed',source)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory(prefix='team-feed-fixture-') as directory:
            root=Path(directory);config=root/'config';config.mkdir()
            teams={key:{'root':str(root/key),'roles':[]} for key in ('app-dev','investment')}
            (config/'teams.yaml').write_text(json.dumps({'teams':teams}))
            (config/'workers.yaml').write_text(json.dumps({'mimo':{'model':'fixture-model'}}))
            stream=io.StringIO()
            with patch.object(module,'movie_activity',return_value=[]), patch.object(module,'CREATIVE_QUEUE',str(root/'empty')):
                with contextlib.redirect_stdout(stream): module.teams(str(root/'home'),str(config),str(root/'jobs'))
            body=json.loads(stream.getvalue());by_id={t['id']:t for t in body['teams']}
            self.assertIn('workflow',by_id['app-dev'])
            self.assertIn('QA / Debug',[m['name'] for m in by_id['app-dev']['members']])
            self.assertNotIn('workflow',by_id['investment'])
            self.assertEqual([m['name'] for m in by_id['investment']['members']],[m for m,_ in module.TEAM_CREW])
            self.assertIn('not yet verified',by_id['blog']['workflow_note'])


if __name__=='__main__': unittest.main()
