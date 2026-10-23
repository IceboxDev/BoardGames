import json,re,collections,subprocess
R='/var/home/mantas/Downloads/quiz-cards/rebalance/'
C='/var/home/mantas/Documents/Projects/Personal/BoardGames/packages/core/src/quiz/content/'
place=json.load(open(R+'placed.json'))
doms={}
for k in ['r1','r2','r3','r4','r5','r6']: doms.update(json.load(open(R+f'{k}.json'))['domains'])
S=lambda slug,en,de,ru:{'slug':slug,'en':en,'de':de,'ru':ru}
EVERYDAY={
 'Food, cooking & ingredients':'food','Drinks: wine, spirits, coffee & tea':'food',
 'Brands, logos & advertising':'brands','Clothing, textiles & everyday style':'brands',
 'Famous companies & the products people use':'shops-companies',
 "German TV entertainment & comedy":'tv-entertainment',"Children's TV":'tv-entertainment','Sitcoms':'tv-entertainment',
 'Game shows, reality & casting TV':'tv-entertainment','Celebrity & pop culture':'tv-entertainment','Celebrity trivia & stunts':'tv-entertainment',
 'Press, radio & TV broadcasting':'media','Social media & online pop culture':'online-culture',
 'Puzzles, pastimes & gambling':'leisure','Toys, hobbies & pastimes':'leisure','Fitness & workouts':'leisure','Holidays, festivals & special days':'leisure',
 'Idioms, sayings & word games':'sayings'}
doms['everyday']={'en':'Everyday Life & Pop Culture','de':'Alltag & Popkultur','ru':'Повседневность и поп-культура','subs':[
 S('food','Food & Drink','Essen & Trinken','Еда и напитки'),
 S('brands','Brands, Fashion & Advertising','Marken, Mode & Werbung','Бренды, мода и реклама'),
 S('shops-companies','Shops & Consumer Companies','Läden & Konsumunternehmen','Магазины и потребительские компании'),
 S('tv-entertainment','TV Entertainment & Celebrities','TV-Unterhaltung & Prominente','Телеразвлечения и знаменитости'),
 S('media','Press & Broadcasting','Presse & Rundfunk','Пресса и вещание'),
 S('online-culture','Social Media & Online Culture','Soziale Medien & Netzkultur','Соцсети и интернет-культура'),
 S('leisure','Toys, Pastimes & Holidays','Spielzeug, Zeitvertreib & Feiertage','Игрушки, досуг и праздники'),
 S('sayings','Idioms & Sayings','Redewendungen & Sprichwörter','Идиомы и поговорки')]}
GEO={'German regions, islands & resorts':'cities','Greek & Latin inside modern languages':'loanwords','Loanwords between nations':'loanwords',
 'Words named after peoples & places':'loanwords','Languages & scripts of the world':'language','The German language: grammar, spelling & history':'language'}
g=doms['geography']; g.update(en='Countries, Peoples & Languages',de='Länder, Völker & Sprachen',ru='Страны, народы и языки')
g['subs']=[s for s in g['subs'] if s['slug']!='r6-lang-names']+[
 S('language','Languages & Scripts','Sprachen & Schriften','Языки и письменность'),
 S('loanwords','Loanwords & Word Origins','Lehnwörter & Wortherkunft','Заимствования и происхождение слов')]
for p in place.values():
    if p['domain']=='everyday' and 'suggestedSub' in p: p['sub']=EVERYDAY[p['suggestedSub']]
    if p['domain']=='geography' and 'suggestedSub' in p: p['sub']=GEO[p['suggestedSub']]
    if p['domain']=='geography' and p.get('sub')=='r6-lang-names': p['sub']='language'
    if p['domain']=='literature' and 'suggestedSub' in p: p['sub']='plays'
# strip rN- prefixes where unique
allslugs=[s['slug'] for d in doms.values() for s in d['subs']]
ren={}
for s in allslugs:
    m=re.match(r'r\d-(.*)',s)
    if m and m.group(1) not in allslugs: ren[s]=m.group(1)
for d in doms.values():
    for s in d['subs']: s['slug']=ren.get(s['slug'],s['slug'])
for p in place.values(): p['sub']=ren.get(p['sub'],p['sub'])
assert len(set(s['slug'] for d in doms.values() for s in d['subs']))==sum(len(d['subs']) for d in doms.values())
ORDER='music-stage literature art film-media sport-games history society belief science earth-space nature technology geography everyday'.split()
spec=[{'slug':d,**{k:doms[d][k] for k in ('en','de','ru')},'subs':doms[d]['subs']} for d in ORDER]
subset={(d['slug'],s['slug']) for d in spec for s in d['subs']}
used=collections.Counter((p['domain'],p['sub']) for p in place.values())
assert set(used)<=subset, set(used)-subset
assert subset<=set(used), subset-set(used)
json.dump(spec,open(R+'final-taxonomy.json','w'),ensure_ascii=False,indent=1)
# labels for reasons
lab={d['slug']:d['en'] for d in spec}
reasons={};ids=[]
for aid,p in sorted(place.items()):
    path=C+f'articles/{aid}.json'; t=open(path).read()
    od=re.search(r'^ "domain": "([^"]*)",$',t,re.M).group(1); os_=re.search(r'^ "sub": "([^"]*)",$',t,re.M).group(1)
    fields=[f for f,o,n in (('domain',od,p['domain']),('sub',os_,p['sub'])) if o!=n]
    if not fields: continue
    t=re.sub(r'^ "domain": "[^"]*",$',f' "domain": "{p["domain"]}",',t,count=1,flags=re.M)
    t=re.sub(r'^ "sub": "[^"]*",$',f' "sub": "{p["sub"]}",',t,count=1,flags=re.M)
    open(path,'w').write(t)
    r=(p.get('reason') or '').strip()
    if 'domain' not in fields and (not r or r.lower().startswith('stays')):
        r=f"Category regrouping (2026-10-22, 14 categories of 199–200 articles): re-filed under a finer sub-category of {lab[p['domain']]}."
    elif not r:
        r=f"Category regrouping (2026-10-22, 14 categories of 199–200 articles): moved to {lab[p['domain']]}."
    reasons[aid]={'kind':'recategorised','reason':r,'fields':fields}; ids.append(aid)
json.dump(reasons,open(R+'final.reasons.json','w'),ensure_ascii=False,indent=1)
open(R+'final.ids','w').write(' '.join(ids))
print(len(ids),'changed;',collections.Counter(tuple(v['fields']) for v in reasons.values()))
