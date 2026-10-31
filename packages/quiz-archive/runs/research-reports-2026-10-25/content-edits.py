import json, re
BASE='/var/home/mantas/Documents/Projects/Personal/BoardGames/packages/core/src/quiz/content/articles/'
URL='https://media.githubusercontent.com/media/IceboxDev/BoardGames/master/packages/quiz-archive/research-reports/'

def rep(s, old, new):
    assert s.count(old)==1, (old[:60], s.count(old))
    return s.replace(old,new)

def segment(s, start, end, new):
    i=s.index(start); j=s.index(end,i)+len(end)
    assert s.count(start)==1
    return s[:i]+new+s[j:]

def respan(old_body, new_body, span, answer):
    s,l = span
    ctx = old_body[max(0,s-40):s]
    occ = [m for m in re.finditer(re.escape(answer), new_body, re.I|re.U)]
    assert occ, ('answer not in body', answer)
    def score(m):
        pre = new_body[max(0,m.start()-40):m.start()]
        k=0
        while k<len(pre) and k<len(ctx) and pre[-1-k]==ctx[-1-k]: k+=1
        return (k, -abs(m.start()-s))
    best = max(occ, key=score)
    return [best.start(), best.end()-best.start()]

def edit(aid, segs, reps, notes, facts, anchors):
    """segs: lang -> [(start, end, new)]; reps: lang -> [(old, new)];
    anchors: fid -> lang -> text right before the answer (the main fact's span)."""
    p=BASE+aid+'.json'; a=json.load(open(p))
    old={k:a[k] for k in ('bodyEn','bodyDe','bodyRu')}
    for lang,items in segs.items():
        for s,e,n in items: a['body'+lang]=segment(a['body'+lang],s,e,n)
    for lang,items in reps.items():
        for o,n in items: a['body'+lang]=rep(a['body'+lang],o,n)
    for k,(o,n) in notes.items(): a[k]=rep(a[k],o,n)
    for f in a['facts']:
        if f['id'] in facts: facts[f['id']](f)
    for f in a['facts']:
        for lang,key in (('en','En'),('de','De'),('ru','Ru')):
            if lang not in f['spans']: continue
            body=a['body'+key]; ans=f['answer'+key]
            if f['id'] in anchors:
                i=body.index(anchors[f['id']][lang])+len(anchors[f['id']][lang])
                assert body[i:i+len(ans)].lower()==ans.lower(), (f['id'],lang,body[i:i+len(ans)])
                f['spans'][lang]=[i,len(ans)]
            else:
                f['spans'][lang]=respan(old['body'+key], body, f['spans'][lang], ans)
    open(p,'w').write(json.dumps(a,ensure_ascii=False,indent=1)+'\n')

def src(b, title): return {'url':URL+b+'.pdf','title':title,'lang':'en'}
def untag(f,t):
    if t in f.get('tags',[]): f['tags']=[x for x in f['tags'] if x!=t]

# ── b00326 · a2655 · f14383 ──
def f14383(f):
    w=f['wordings'][0]; assert w['id']=='w14692' and 'cardText' in w
    w['en']="How many vehicles of the Trabant model series, from the first P50 pilot-series cars in November 1957 through the final Trabant 1.1 on 30 April 1991, were produced in total, excluding the earlier AWZ P70?"
    w['de']="Wie viele Fahrzeuge der Trabant-Baureihe wurden von den ersten P50 der Nullserie im November 1957 bis zum letzten Trabant 1.1 am 30. April 1991 insgesamt gebaut, ohne den früheren AWZ P70?"
    w['ru']="Сколько всего машин семейства «Трабант» было выпущено — от первых P50 опытной серии в ноябре 1957 года до последнего «Трабанта 1.1» 30 апреля 1991 года, не считая более раннего AWZ P70?"
    t=f['timeline']
    t['labelEn']="Trabant production in Zwickau, from the first P50 pilot-series cars to the last Trabant 1.1"
    t['labelDe']="Trabant-Produktion in Zwickau, von den ersten P50 der Nullserie bis zum letzten Trabant 1.1"
    t['labelRu']="Производство «Трабанта» в Цвиккау — от первых P50 опытной серии до последнего «Трабанта 1.1»"
    f['source']=src('b00326',"Trabant production total: research verdict for the Trivial Pursuit card (research report)")
edit('a2655',
 {'En':[("Its pre-series","worldwide.",
   "Its pilot series of P50s appeared in November 1957, and the last car, a Trabant 1.1, left the line on 30 April 1991; in between, about 3.1 million cars of the Trabant series were built – 3,096,099 according to the City of Zwickau, made up of 131,450 P50s, 106,628 P60s, 2,818,547 of the 601 and 39,474 of the VW-engined 1.1. Higher totals of 3.6 or 3.7 million also circulate, but they are no sound count of the series: the broadcaster MDR says its 3.6 million include the \"predecessor models\", yet even all 36,151 of the earlier AWZ P70 would only raise the total to 3,132,250, and the 3.7 million found in English-language references comes with no breakdown at all. That sounds a lot, but Volkswagen built about 15.8 million Beetles in Germany – about five times as many – out of 21,529,464 worldwide.")],
  'De':[("Seine Nullserie","21,5 Millionen.",
   "Seine Nullserie von P50 erschien im November 1957, der letzte Wagen, ein Trabant 1.1, lief am 30. April 1991 vom Band; dazwischen entstanden rund 3,1 Millionen Fahrzeuge der Trabant-Baureihe – laut der Stadt Zwickau 3.096.099, nämlich 131.450 P50, 106.628 P60, 2.818.547 Trabant 601 und 39.474 Trabant 1.1 mit VW-Motor. Auch höhere Summen von 3,6 oder 3,7 Millionen kursieren, doch sie zählen die Baureihe nicht stichhaltig: Der MDR gibt an, seine 3,6 Millionen schlössen die „Vorgängermodelle“ ein, aber selbst alle 36.151 Wagen des früheren AWZ P70 würden die Summe nur auf 3.132.250 heben, und die 3,7 Millionen englischsprachiger Nachschlagewerke kommen ganz ohne Aufschlüsselung. Das klingt nach viel, doch Volkswagen baute in Deutschland rund 15,8 Millionen Käfer – etwa fünfmal so viele –, weltweit 21.529.464.")],
  'Ru':[("Его опытная серия","21,5 миллиона.",
   "Его опытная серия P50 появилась в ноябре 1957 года, а последняя машина, «Трабант 1.1», сошла с конвейера 30 апреля 1991 года; за это время построили около 3,1 миллиона машин семейства «Трабант» — по данным города Цвиккау 3 096 099: 131 450 P50, 106 628 P60, 2 818 547 «601-х» и 39 474 «Трабанта 1.1» с двигателем Volkswagen. В ходу и более высокие цифры — 3,6 или 3,7 миллиона, но это не обоснованный подсчёт семейства: телерадиокомпания MDR указывает, что её 3,6 миллиона включают «модели-предшественники», однако даже все 36 151 машина предшествовавшего AWZ P70 подняли бы итог лишь до 3 132 250, а 3,7 миллиона из англоязычных справочников вообще приводятся без разбивки. Звучит внушительно, но в Германии Volkswagen построил около 15,8 миллиона «Жуков» — примерно впятеро больше, — а по всему миру 21 529 464.")]},
 {},
 {'notesEn':("Trabant total: the model-by-model production figures add up to 3,096,099; some sources round to about 3 million, and figures of 3.6–3.7 million also circulate.",
             "Trabant total: 3,096,099, 3.1 million and, rounded, about 3 million are accepted; 3.6 or 3.7 million is not."),
  'notesDe':("Trabant-Gesamtzahl: Die Produktionszahlen der einzelnen Modelle ergeben zusammen 3.096.099; manche Quellen runden auf etwa 3 Millionen, im Umlauf sind auch Angaben von 3,6–3,7 Millionen.",
             "Trabant-Gesamtzahl: Akzeptiert werden 3.096.099, 3,1 Millionen und gerundet etwa 3 Millionen, nicht aber 3,6 oder 3,7 Millionen."),
  'notesRu':("Общий выпуск «Трабанта»: по данным о производстве отдельных моделей — 3 096 099; некоторые источники округляют до примерно 3 миллионов, встречаются и цифры 3,6–3,7 миллиона.",
             "Общий выпуск «Трабанта»: засчитываются 3 096 099, 3,1 миллиона и, с округлением, около 3 миллионов; 3,6 или 3,7 миллиона — нет.")},
 {'f14383':f14383},
 {'f14383':{'en':"in between, ",'de':"dazwischen entstanden ",'ru':"за это время построили "}})

# ── b00327 · a2696 · f14701 ──
def f14701(f):
    f['answerEn']='20 copies'; f['answerDe']='20 Exemplare'; f['answerRu']='20 экземпляров'
    w=f['wordings'][0]; assert w['id']=='w15018' and 'cardText' in w
    w['en']="According to Eric M. White’s modern census of the 42-line Gutenberg Bible, how many surviving copies are classed as complete?"
    w['de']="Wie viele erhaltene Exemplare der 42-zeiligen Gutenbergbibel gelten nach der modernen Zählung von Eric M. White als vollständig?"
    w['ru']="Сколько сохранившихся экземпляров 42-строчной Библии Гутенберга считаются полными согласно современной переписи Эрика М. Уайта?"
    f['source']=src('b00327',"Settling the Gutenberg Bible “Complete Copies” Count (research report)")
    untag(f,'risk:contested')
edit('a2696',
 {'En':[("According to his letter, 158 or 180","costly vellum.",
   "His letter speaks of 158 or 180 copies – the only contemporary reports, so the exact print run is not known; modern bibliographers estimate some 120 to 135 copies on paper and 40 to 45 on costly vellum, roughly 160 to 180 in all."),
        ("Of the 180 copies printed, 49 survive","other counts reach 25.",
   "Of the copies printed, 48 survive reasonably intact – 36 on paper and 12 on vellum, as complete Bibles or single bound volumes – and a 49th, an incomplete paper copy dismantled in 1920, survives scattered as single books and leaves, the so-called Noble Fragments. According to Eric Marshall White's census of 2017, the standard modern count, only 20 copies are complete: four on vellum – in the Library of Congress, in Göttingen, in the Bibliothèque nationale de France and in the British Library – and sixteen on paper. The Harry Ransom Center in Austin, which owns one of them, gives the same 20. The often-quoted 21 comes from an older census tradition and is still repeated in some references; the 25 found in some lists comes from an outdated table that also counts copies missing a few leaves, such as the Huntington Library's vellum copy, which lacks two.")],
  'De':[("Nach seinem Brief wurden 158 oder 180","kostbarem Pergament.",
   "Sein Brief spricht von 158 oder 180 Exemplaren – es sind die einzigen zeitgenössischen Angaben, die genaue Auflage ist also unbekannt; heutige Bibliografen schätzen etwa 120 bis 135 Exemplare auf Papier und 40 bis 45 auf kostbarem Pergament, zusammen rund 160 bis 180."),
        ("Von den 180 gedruckten Exemplaren","kommen auf 25.",
   "Von den gedruckten Exemplaren sind heute 48 einigermaßen intakt erhalten – 36 auf Papier und 12 auf Pergament, als vollständige Bibeln oder einzelne gebundene Bände –, und ein 49., ein 1920 zerlegtes unvollständiges Papierexemplar, ist als einzelne Bücher und Blätter verstreut, die sogenannten Noble Fragments. Nach dem Zensus von Eric Marshall White aus dem Jahr 2017, der maßgeblichen modernen Zählung, sind nur 20 Exemplare vollständig: vier auf Pergament – in der Library of Congress, in Göttingen, in der Bibliothèque nationale de France und in der British Library – und sechzehn auf Papier. Das Harry Ransom Center in Austin, das eines davon besitzt, nennt ebenfalls 20. Die oft genannte Zahl 21 stammt aus einer älteren Zählweise und wird in manchen Nachschlagewerken noch wiederholt; die 25 mancher Listen beruhen auf einer veralteten Tabelle, die auch Exemplare mit wenigen fehlenden Blättern mitzählt, etwa das Pergamentexemplar der Huntington Library, dem zwei Blätter fehlen.")],
  'Ru':[("Согласно его письму, было изготовлено","дорогом пергаменте.",
   "В его письме говорится о 158 или 180 экземплярах — это единственные современные событиям сведения, так что точный тираж неизвестен; нынешние библиографы оценивают его примерно в 120–135 экземпляров на бумаге и 40–45 на дорогом пергаменте, всего около 160–180."),
        ("Из 180 напечатанных экземпляров","доходят до 25.",
   "Из напечатанных экземпляров 48 сохранились в более или менее целом виде — 36 бумажных и 12 пергаментных, полными Библиями или отдельными переплетёнными томами, — а 49-й, неполный бумажный экземпляр, разобранный в 1920 году, дошёл до нас рассеянным по отдельным книгам и листам: это так называемые «Благородные фрагменты» (Noble Fragments). Полными, согласно переписи Эрика Маршалла Уайта 2017 года — основному современному подсчёту, — остаются лишь 20 экземпляров: четыре пергаментных — в Библиотеке Конгресса, в Гёттингене, в Национальной библиотеке Франции и в Британской библиотеке — и шестнадцать бумажных. Те же 20 называет и Центр Гарри Рэнсома в Остине, которому принадлежит один из них. Часто называемое число 21 восходит к более старой традиции подсчёта и всё ещё повторяется в некоторых справочниках; 25 в некоторых списках взято из устаревшей таблицы, где полными считаются и экземпляры без нескольких листов, например пергаментный экземпляр Библиотеки Хантингтона, в котором недостаёт двух листов.")]},
 {'En':[("| Surviving copies | 49, of which 21 complete |","| Surviving copies | 48 reasonably intact, plus the Noble Fragments |\n| Complete copies | 20 (4 vellum, 16 paper) |")],
  'De':[("| Erhaltene Exemplare | 49, davon 21 vollständig |","| Erhaltene Exemplare | 48 einigermaßen intakt, dazu die Noble Fragments |\n| Vollständige Exemplare | 20 (4 Pergament, 16 Papier) |")],
  'Ru':[("| Сохранилось экземпляров | 49, из них 21 полный |","| Сохранилось экземпляров | 48 более или менее целых и «Благородные фрагменты» |\n| Полных экземпляров | 20 (4 пергаментных, 16 бумажных) |")]},
 {'notesEn':("Census figures vary between sources: the Harry Ransom Center counts 20 complete copies, others 21 or 25. The printed card offered 11, 21 or 31 as choices.",
             "The printed card offered 11, 21 or 31; its intended answer, 21, the traditional figure, is also accepted."),
  'notesDe':("Die Zählungen schwanken je nach Quelle: Das Harry Ransom Center zählt 20 vollständige Exemplare, andere 21 oder 25. Die gedruckte Karte bot 11, 21 oder 31 zur Auswahl.",
             "Die gedruckte Karte bot 11, 21 oder 31 zur Auswahl; ihre beabsichtigte Antwort, die überlieferte Zahl 21, gilt ebenfalls."),
  'notesRu':("Данные переписи расходятся: Центр Гарри Рэнсома насчитывает 20 полных экземпляров, другие источники — 21 или 25. На печатной карточке предлагались варианты 11, 21 или 31.",
             "На печатной карточке предлагались варианты 11, 21 или 31; её подразумеваемый ответ — традиционное число 21 — тоже засчитывается.")},
 {'f14701':f14701},
 {'f14701':{'en':"the standard modern count, only ",'de':"sind nur ",'ru':"остаются лишь "}})
print('ok')
