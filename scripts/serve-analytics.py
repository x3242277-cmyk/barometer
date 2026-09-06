"""Serve Barometer plus first-party aggregate analytics (standard library only)."""
import argparse, json, os, secrets, sqlite3, time
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[1]
PAGES={'home','polls','2022','haredi','regions','demography','method','live','results'}
STORE=Path(os.environ.get('BAROMETER_ANALYTICS_DIR', ROOT/'.analytics'))
STORE.mkdir(parents=True,exist_ok=True)
TOKEN_FILE=STORE/'admin-token'
if not TOKEN_FILE.exists():TOKEN_FILE.write_text(secrets.token_urlsafe(32),encoding='utf8')
TOKEN=os.environ.get('BAROMETER_ANALYTICS_TOKEN') or TOKEN_FILE.read_text(encoding='utf8').strip()
DB=STORE/'usage.sqlite3'
def connect():
 c=sqlite3.connect(DB,timeout=15);c.execute('PRAGMA journal_mode=WAL');return c
with connect() as c:
 c.execute('CREATE TABLE IF NOT EXISTS visits (view TEXT PRIMARY KEY, session TEXT NOT NULL, page TEXT NOT NULL, day TEXT NOT NULL, seconds INTEGER NOT NULL, seq INTEGER NOT NULL, started REAL NOT NULL)')
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kw):super().__init__(*args,directory=str(ROOT),**kw)
 def log_message(self,*args):pass # Never record client addresses or paths.
 def reply(self,status,data):
  body=json.dumps(data,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def do_GET(self):
  path=urlparse(self.path).path
  if path=='/api/analytics/status':return self.reply(200,{'enabled':True})
  if path=='/api/analytics/summary':
   if not secrets.compare_digest(self.headers.get('Authorization',''),'Bearer '+TOKEN):return self.reply(401,{'error':'נדרש מפתח ניהול'})
   with connect() as c:
    rows=c.execute('SELECT page,COUNT(*),COUNT(DISTINCT session),SUM(seconds),ROUND(AVG(seconds),1) FROM visits GROUP BY page ORDER BY COUNT(*) DESC').fetchall()
    total=c.execute('SELECT COUNT(DISTINCT session),COUNT(*),COALESCE(SUM(seconds),0) FROM visits').fetchone()
    days=c.execute('SELECT day,COUNT(DISTINCT session),COUNT(*),SUM(seconds) FROM visits GROUP BY day ORDER BY day DESC LIMIT 90').fetchall()
   return self.reply(200,{'sessions':total[0],'views':total[1],'seconds':total[2],'pages':[dict(zip(['page','views','sessions','seconds','average'],r)) for r in rows],'days':[dict(zip(['day','sessions','views','seconds'],r)) for r in days]})
  # Static server allowlist excludes secrets, database, git and arbitrary files.
  decoded=Path(self.translate_path(path)).resolve()
  try:relative=decoded.relative_to(ROOT)
  except ValueError:return self.reply(404,{})
  if not relative.parts or path=='/':
   self.path='/index.html';decoded=ROOT/'index.html'
  elif relative.parts[0] not in {'assets','data','index.html','analytics.html','privacy.html'}:return self.reply(404,{})
  if decoded.is_dir():return self.reply(404,{})
  return super().do_GET()
 def do_HEAD(self):
  return self.reply(405,{})
 def do_POST(self):
  if self.path!='/api/analytics/event':return self.reply(404,{})
  origin=self.headers.get('Origin','')
  if not origin or urlparse(origin).netloc != self.headers.get('Host',''):return self.reply(403,{})
  try:
   length=int(self.headers.get('Content-Length','0'))
   if not 0<length<=1024:raise ValueError()
   d=json.loads(self.rfile.read(length));session=d['session'];view=d['view'];page=d['page'];seq=d['seq'];seconds=d['seconds']
   if page not in PAGES or any(not isinstance(s,str) or len(s)!=36 or any(x not in '0123456789abcdef-' for x in s) for s in [view,session]):raise ValueError()
   if type(seq)!=int or type(seconds)!=int or not 1<=seq<=100000 or not 0<=seconds<=86400:raise ValueError()
  except (ValueError,KeyError,TypeError):return self.reply(400,{'error':'invalid event'})
  with connect() as c:
   now=time.time();old=c.execute('SELECT session,page,seq,seconds,started FROM visits WHERE view=?',(view,)).fetchone()
   if old:
    if old[0]!=session or old[1]!=page:return self.reply(400,{})
    if seq>old[2]:c.execute('UPDATE visits SET seq=?,seconds=? WHERE view=?',(seq,max(old[3],min(seconds,int(now-old[4])+5)),view))
   else:
    c.execute('INSERT INTO visits VALUES (?,?,?,?,?,?,?)',(view,session,page,time.strftime('%Y-%m-%d',time.gmtime()),min(seconds,5),seq,now))
   c.execute('DELETE FROM visits WHERE started < ?',(now-90*86400,))
  return self.reply(200,{'ok':True})
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8001);parser.add_argument('--bind',default='127.0.0.1');args=parser.parse_args()
 print(f'Barometer: http://{args.bind}:{args.port}/ | Analytics dashboard: /analytics.html',flush=True)
 ThreadingHTTPServer((args.bind,args.port),Handler).serve_forever()
