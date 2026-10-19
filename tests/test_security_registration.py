import contextlib,importlib.util,io,json,os,sqlite3,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
source=Path(os.environ.get('BRAINBOOK_TEST_SOURCE',ROOT))/'agent-feed.py'
spec=importlib.util.spec_from_file_location('security_feed',source)
assert spec is not None and spec.loader is not None
feed=importlib.util.module_from_spec(spec);spec.loader.exec_module(feed)
class SecurityRegistrationTests(unittest.TestCase):
 def test_native_registration_does_not_invent_execution(self):
  with tempfile.TemporaryDirectory() as home:
   self.assertTrue(hasattr(feed,'security_team'),'native department projection missing')
   absent=feed.security_team(home);self.assertFalse(absent['registration']['profilePresent']);self.assertEqual(absent['direct'],[]);self.assertFalse(absent['live'])
   p=Path(home,'profiles/securitypro');p.mkdir(parents=True);(p/'config.yaml').write_text('model:\n  default: null\n')
   board=Path(home,'kanban/boards/securitypro');board.mkdir(parents=True)
   db=sqlite3.connect(board/'kanban.db');db.executescript('create table task_events(id text); create table tasks(id text,title text,status text,assignee text,created_at real);');db.commit();db.close()
   present=feed.security_team(home);self.assertTrue(present['registration']['profilePresent']);self.assertTrue(present['registration']['boardPresent']);self.assertEqual(present['board'],'securitypro');self.assertEqual(present['registration']['inference'],'unbound');self.assertEqual(present['direct'],[]);self.assertEqual(present['work'],[]);self.assertIsNone(present['members'][0]['parent']);self.assertFalse(present['live'])
 def test_actual_teams_response_has_one_security_department(self):
  with tempfile.TemporaryDirectory() as home:
   stream=io.StringIO()
   with patch.object(feed,'movie_activity',return_value=[]),patch.object(feed,'member_models',return_value={}),contextlib.redirect_stdout(stream):feed.teams(home,home,home)
   groups=json.loads(stream.getvalue())['teams'];self.assertEqual(sum(t['id']=='securitypro' for t in groups),1);self.assertEqual(sum(t['id']=='movie' for t in groups),1)
 def test_the_renamed_profile_directory_is_recognised(self):
  with tempfile.TemporaryDirectory() as home:
   p=Path(home,'profiles/securityagent');p.mkdir(parents=True);(p/'config.yaml').write_text('model:\n  default: null\n')
   self.assertTrue(feed.security_team(home)['registration']['profilePresent'])

if __name__=='__main__':unittest.main()
