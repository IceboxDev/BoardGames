import json,sys,glob
sys.path.insert(0,'.'); from items import *
C='/var/home/mantas/Documents/Projects/Personal/BoardGames/packages/core/src/quiz/content/'
W={}
for f in glob.glob(C+'articles/*.json'):
  a=json.load(open(f))
  for fa in a['facts']+[x for x in a.get('retired',[]) if 'wordings' in x]:
    for w in fa['wordings']: W[w['id']]=(a['id'],fa['id'])
PH={'tp':'/var/home/mantas/Downloads/Photos-1-001/','pp':'/var/home/mantas/Downloads/Photos-1-001(1)/','ppm':'/var/home/mantas/Downloads/Photos-1-001(2)/'}
src={'tp':'trivial-pursuit','pp':'publish-or-perish','ppm':'publish-or-perish-mge'}
cards={}
for p,s in src.items():
  for c in json.load(open(C+f'sources/{s}.json'))['cards']: cards[c['id']]=c
out=[]
for kind,pre,dct in [('R','tp',R_TP_UNSURE),('R','pp',R_PP),('R','ppm',R_PPM),('Q','tp',Q_TP),('Q','pp',Q_PP),('Q','ppm',Q_PPM)]:
  for k,v in sorted(dct.items()):
    cn,sl=k.split('/'); cid=f'{pre}-{cn}'; c=cards[cid]; slot=c['slots'][int(sl)-1]
    aid,fid=W.get(slot['wordingId'],('?','?'))
    out.append(dict(kind=kind,ref=f'{cid}/{sl}',wording=slot['wordingId'],article=aid,fact=fid,photo=PH[pre]+c['image'],note=v))
json.dump(out,open('items.json','w'),indent=1,ensure_ascii=False)
import collections
print(collections.Counter(o['kind'] for o in out)); print(sum(1 for o in out if o['article']=='?'))
r=[o for o in out if o['kind']=='R']; print(len(set(o['article'] for o in r)),'articles in R')
