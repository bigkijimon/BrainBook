"""Pure display tests with synthetic teams, no service/profile/board reads."""
import ast
import copy
from pathlib import Path
import unittest


def helper():
    source=Path(__file__).resolve().parents[1] / 'agent-feed.py'
    tree=ast.parse(source.read_text())
    nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='reviewed_structure'
           or isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='REVIEWED_TEAM_IDS' for t in n.targets)]
    ns={}; exec(compile(ast.Module(nodes, type_ignores=[]),str(source),'exec'),ns)
    return ns['reviewed_structure']


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
        self.assertIn('Script work only',team['workflow'])

    def test_no_registered_movie_script_lane_is_not_invented(self):
        team={'id':'movie','members':[{'name':'Steve','role':'director','live':False}]}
        before=copy.deepcopy(team); helper()(team); self.assertEqual(before,team)



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
            with patch.object(module,'movie_activity',return_value=[]), patch.object(module,'BLOG_QUEUE',str(root/'empty')):
                with contextlib.redirect_stdout(stream): module.teams(str(root/'home'),str(config),str(root/'jobs'))
            body=json.loads(stream.getvalue());by_id={t['id']:t for t in body['teams']}
            self.assertIn('workflow',by_id['app-dev'])
            self.assertIn('QA / Debug',[m['name'] for m in by_id['app-dev']['members']])
            self.assertNotIn('workflow',by_id['investment'])
            self.assertEqual([m['name'] for m in by_id['investment']['members']],[m for m,_ in module.TEAM_CREW])
            self.assertIn('not yet verified',by_id['blog']['workflow_note'])


if __name__=='__main__': unittest.main()
