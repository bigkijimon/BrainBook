import importlib.util,json,sqlite3,unittest,tempfile,contextlib,io
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('brainbook_feed',ROOT/'agent-feed.py');feed=importlib.util.module_from_spec(spec);spec.loader.exec_module(feed)
class Metadata(unittest.TestCase):
 def test_readonly_issuer_is_recorded_creator_not_parent_and_gpu_is_not_card(self):
  with tempfile.TemporaryDirectory(dir=ROOT/'evidence',prefix='flow-fixture-') as stage:
   home=Path(stage);board=home/'kanban/boards/owner';board.mkdir(parents=True);db=board/'kanban.db';conn=sqlite3.connect(db)
   conn.executescript('CREATE TABLE tasks(id TEXT,title TEXT,assignee TEXT,status TEXT,created_by TEXT,body TEXT,created_at INT,started_at INT,completed_at INT);CREATE TABLE task_links(parent_id TEXT,child_id TEXT);CREATE TABLE task_runs(task_id TEXT,outcome TEXT,summary TEXT,started_at INT);CREATE TABLE task_events(task_id TEXT,kind TEXT,payload TEXT,created_at INT,id INT);')
   conn.executemany('INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?,?)',[('parent','Parent','Maru','done','Steve','',1,1,1),('child','Child','ComfyUI','running','Router','',1,1,None),('unknown','Unknown','Bigkiji','running',None,'',1,1,None)])
   conn.execute('INSERT INTO task_links VALUES (?,?)',('parent','child'));conn.commit();conn.close();before=db.read_bytes()
   feed.movie_activity=lambda:[{'id':'gpu-30332','member':'ComfyUI','title':'GPU render','startedAt':1,'gpu':True}];feed.comfy_queue=lambda:None;feed.session_activity=lambda _home:[]
   output=io.StringIO()
   with contextlib.redirect_stdout(output):feed.flow(str(home),0,str(home/'jobs'))
   result=json.loads(output.getvalue());child=next(h for h in result['handoffs'] if h['id']=='owner:child');gpu=next(h for h in result['handoffs'] if h['id']=='gpu-30332');unknown=next(h for h in result['handoffs'] if h['id']=='owner:unknown')
   self.assertEqual(child['from'],'Router');self.assertEqual(child['senderBasis'],'card.created_by');self.assertEqual(child['activityKind'],'card');self.assertEqual(gpu['activityKind'],'gpu');self.assertEqual(gpu['from'],'指示元未記録');self.assertEqual(unknown['from'],'指示元未記録');self.assertNotIn('eta',gpu);self.assertNotIn('progress',gpu);self.assertEqual(db.read_bytes(),before)
 def test_router_exposes_only_existing_measured_metadata_with_its_original_basis(self):
  with tempfile.TemporaryDirectory(dir=ROOT/'evidence',prefix='router-metadata-fixture-') as stage:
   home=Path(stage);running=home/'jobs/running';running.mkdir(parents=True)
   (running/'job.json').write_text(json.dumps({'task_id':'fixture','route':'mimo','source':'Bigkiji','status':'running','objective':'Recorded fixture work','team':'app-dev','stage':'Rendering','progress':{'completed':2,'total':8,'at':100,'basis':'Recorded counter','unit':'frames','private_extra':'omit'},'eta':{'finishAt':200,'at':100,'basis':'Recorded job estimate','extra':'omit'}}))
   feed.movie_activity=lambda:[];feed.session_activity=lambda _home:[]
   output=io.StringIO()
   with contextlib.redirect_stdout(output):feed.flow(str(home),0,str(home/'jobs'))
   row=json.loads(output.getvalue())['handoffs'][0]
   self.assertEqual(row['progress'],{'completed':2,'total':8,'at':100,'basis':'Recorded counter','unit':'frames'});self.assertEqual(row['eta'],{'finishAt':200,'at':100,'basis':'Recorded job estimate'});self.assertEqual(row['toDepartment'],'app-dev');self.assertEqual(row['stage'],'Rendering');self.assertNotIn('private_extra',row['progress'])
if __name__=='__main__':unittest.main()
