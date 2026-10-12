import contextlib, importlib.util, io, json, os, sqlite3, tempfile, time, unittest
from pathlib import Path
from unittest.mock import patch
source=Path(os.environ.get('BRAINBOOK_TEST_SOURCE',Path(__file__).resolve().parents[1]))/'agent-feed.py'
spec=importlib.util.spec_from_file_location('feed',source); feed=importlib.util.module_from_spec(spec);spec.loader.exec_module(feed)
class OwnerFeedTests(unittest.TestCase):
 def capture(self,fn,*args):
  stream=io.StringIO()
  with contextlib.redirect_stdout(stream):fn(*args)
  return json.loads(stream.getvalue())
 def test_process_and_session_are_not_invented_instructions(self):
  with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1]/'private-data') as home:
   movie={'id':'process','member':'ComfyUI','gpu':False,'title':'render','startedAt':time.time()}
   session={'id':'session','assignee':'Bigkiji','title':'work','startedAt':time.time(),'boardName':'Hermes terminal'}
   with patch.object(feed,'movie_activity',return_value=[movie]),patch.object(feed,'session_activity',return_value=[session]):
    data=self.capture(feed.flow,home,0,home)
   self.assertEqual([h['from'] for h in data['handoffs']],['指示元未記録','指示元未記録'])
   self.assertNotIn('指示元未記録',[a['name'] for a in data['agents']])
 def test_logged_owner_is_preserved(self):
  self.assertTrue(hasattr(feed,'instruction_sender'))
  self.assertEqual(feed.instruction_sender('yuma'),'Yuma')
  self.assertEqual(feed.instruction_sender(None),'指示元未記録')
  self.assertEqual(feed.instruction_sender('moviepro'),'Steve')
 def test_configuration_is_not_execution_model(self):
  with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1]/'private-data') as home:
   Path(home,'config.yaml').write_text('model:\n  default: actual-config-model\n')
   db=sqlite3.connect(Path(home,'state.db'));db.execute('create table sessions(model text,last_activity_at real,started_at real,ended_at real)');db.execute('insert into sessions values(?,?,?,null)',('actual-session-model',time.time(),time.time()));db.commit();db.close()
   self.assertTrue(hasattr(feed,'profile_model_evidence'))
   model=feed.profile_model_evidence(home,['default','idle'])
   self.assertEqual(model['default']['configured'],'actual-config-model')
   self.assertEqual(model['default']['observed'],'actual-session-model')
   self.assertEqual(model['default']['observedSource'],'state.db:sessions.model')
   self.assertIsNone(model['idle']['configured']);self.assertIsNone(model['idle']['observed'])
 def test_card_results_retain_the_link_after_the_first_line(self):
  with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1]/'private-data') as home:
   folder=Path(home,'kanban','boards','owner');folder.mkdir(parents=True)
   db=sqlite3.connect(folder/'kanban.db');db.executescript('create table task_events(id text,task_id text,kind text,payload text,created_at real); create table tasks(id text,title text,status text,assignee text,body text,result text,created_at real,started_at real,completed_at real);');db.execute('insert into tasks values(?,?,?,?,?,?,?,?,?)',('x','Title','done','worker','', 'Finished\nhttps://example.test/result',time.time(),time.time(),time.time()));db.commit();db.close()
   data=self.capture(feed.cards,home,7)
   self.assertIn('https://example.test/result',data['cards'][0]['result'])
if __name__=='__main__': unittest.main()
