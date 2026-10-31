import json, re, sys
BASE='/var/home/mantas/Documents/Projects/Personal/BoardGames/packages/core/src/quiz/content/articles/'
URL='https://media.githubusercontent.com/media/IceboxDev/BoardGames/master/packages/quiz-archive/research-reports/'

def rep(s, old, new):
    assert s.count(old)==1, (old[:60], s.count(old))
    return s.replace(old,new)

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
    exact = new_body.find(answer, best.start(), best.end())
    return [best.start(), best.end()-best.start()]

def edit(aid, bodies, notes, facts):
    p=BASE+aid+'.json'; a=json.load(open(p))
    old={k:a[k] for k in ('bodyEn','bodyDe','bodyRu')}
    for lang,pairs in bodies.items():
        for o,n in pairs: a['body'+lang]=rep(a['body'+lang],o,n)
    for k,(o,n) in notes.items(): a[k]=rep(a[k],o,n)
    for f in a['facts']:
        if f['id'] in facts: facts[f['id']](f)
    for f in a['facts']:
        for lang,key in (('en','En'),('de','De'),('ru','Ru')):
            if lang in f['spans']:
                f['spans'][lang]=respan(old['body'+key], a['body'+key], f['spans'][lang], f['answer'+key])
    open(p,'w').write(json.dumps(a,ensure_ascii=False,indent=1)+'\n')

def src(b, title): return {'url':URL+b+'.pdf','title':title,'lang':'en'}
def untag(f,t):
    if t in f.get('tags',[]): f['tags']=[x for x in f['tags'] if x!=t]

# ── b00316 · a2393 · f12504 ──
def f12504(f):
    f['answerEn']='40 people'; f['answerDe']='40 Personen'; f['answerRu']='40 человек'
    w=f['wordings'][0]; assert w['id']=='w12651'
    w['en']="According to the official printed record, how many people gave sworn depositions at the Privy Council meeting at Whitehall on 22 October 1688 about the birth of James II's son?"
    w['de']="Wie viele Personen machten laut dem amtlichen gedruckten Bericht bei der Sitzung des Kronrats in Whitehall am 22. Oktober 1688 eidliche Aussagen über die Geburt des Sohnes von Jakob II.?"
    w['ru']="Сколько человек, согласно официальному печатному отчёту, дали показания под присягой о рождении сына Якова II на заседании Тайного совета в Уайтхолле 22 октября 1688 года?"
    t=f['timeline']
    t['labelEn']="At a Privy Council meeting in Whitehall, 40 people give sworn depositions on the birth of James II's son"
    t['labelDe']="Bei einer Kronratssitzung in Whitehall machen 40 Personen eidliche Aussagen zur Geburt des Sohnes von Jakob II."
    t['labelRu']="На заседании Тайного совета в Уайтхолле 40 человек дают показания под присягой о рождении сына Якова II"
    f['source']=src('b00316',"James II’s Whitehall inquiry into the birth of the Prince of Wales (research report)")
edit('a2393', {
 'En':[("James responded by calling a meeting at Whitehall on 22 October 1688, where 42 witnesses testified that they had seen the prince born. Other accounts speak of more than seventy witnesses whose testimonies James had published; 42 is the number heard at the meeting itself.",
        "James responded by calling an extraordinary meeting of the Privy Council at Whitehall on 22 October 1688, where 40 people gave sworn depositions about the birth. Not all of them had seen it: some had only heard the queen in labour, seen the baby just afterwards or arrived after the delivery. The often-quoted figure of 42 also counts two written depositions by the earls of Huntingdon and Peterborough, which were sworn in the Court of Chancery five days later; the “over seventy” witnesses named in the Oxford Dictionary of National Biography are not borne out by the printed record."),
       ("| 1688 | Warming-pan rumour; 42 witnesses testify |","| 1688 | Warming-pan rumour; 40 sworn depositions at Whitehall |")],
 'De':[("Jakob reagierte, indem er am 22. Oktober 1688 eine Versammlung in Whitehall einberief, bei der 42 Zeugen aussagten, sie hätten die Geburt des Prinzen gesehen. Andere Darstellungen sprechen von über siebzig Zeugen, deren Aussagen Jakob veröffentlichen ließ; 42 ist die Zahl derer, die bei der Versammlung selbst gehört wurden.",
        "Jakob reagierte, indem er am 22. Oktober 1688 eine außerordentliche Sitzung des Kronrats in Whitehall einberief, bei der 40 Personen eidliche Aussagen über die Geburt machten. Nicht alle hatten sie gesehen: Manche hatten die Königin nur in den Wehen gehört, das Kind gleich danach gesehen oder waren erst nach der Entbindung eingetroffen. Die oft genannte Zahl 42 zählt zwei schriftliche Aussagen der Earls von Huntingdon und Peterborough mit, die erst fünf Tage später vor dem Kanzleigericht beeidet wurden; die „über siebzig“ Zeugen, von denen das Oxford Dictionary of National Biography spricht, werden vom gedruckten Bericht nicht gestützt."),
       ("| 1688 | Wärmepfannen-Gerücht; 42 Zeugen sagen aus |","| 1688 | Wärmepfannen-Gerücht; 40 eidliche Aussagen in Whitehall |")],
 'Ru':[("В ответ Яков созвал 22 октября 1688 года собрание в Уайтхолле, где 42 свидетеля показали, что видели рождение принца. Другие источники говорят о более чем семидесяти свидетелях, чьи показания Яков опубликовал; 42 – это число выслушанных на самом собрании.",
        "В ответ Яков созвал 22 октября 1688 года чрезвычайное заседание Тайного совета в Уайтхолле, где 40 человек дали показания под присягой о рождении принца. Не все из них его видели: одни лишь слышали, как королева рожала, другие увидели младенца сразу после родов или приехали уже после них. Часто приводимое число 42 включает ещё два письменных показания графов Хантингдона и Питерборо, принесённые под присягой в Канцлерском суде пятью днями позже; «более семидесяти» свидетелей, о которых пишет Оксфордский национальный биографический словарь, печатным отчётом не подтверждаются."),
       ("| 1688 | Слух о грелке; 42 свидетеля дают показания |","| 1688 | Слух о грелке; 40 показаний под присягой в Уайтхолле |")]},
 {'notesEn':("Counts of the 1688 witnesses differ: the 42 people heard at the council of 22 October 1688 is the figure given after the historian Rachel Weil; other accounts speak of over seventy witnesses whose testimonies were published.",
             "The official print of 1688 records 40 sworn depositions at the council of 22 October 1688; 42, the total of the printed record including two depositions sworn in Chancery on 27 October, is also accepted. The ODNB's “over seventy” is not supported by the record."),
  'notesDe':("Die Zahl der Zeugen von 1688 wird unterschiedlich angegeben: 42 vor dem Rat am 22. Oktober 1688 gehörte Personen nennt die Historikerin Rachel Weil; andere Darstellungen sprechen von über siebzig Zeugen, deren Aussagen veröffentlicht wurden.",
             "Der amtliche Druck von 1688 verzeichnet 40 eidliche Aussagen vor dem Rat am 22. Oktober 1688; 42, die Gesamtzahl des gedruckten Berichts einschließlich zweier am 27. Oktober vor dem Kanzleigericht beeideter Aussagen, gilt ebenfalls. Die „über siebzig“ des ODNB werden vom Bericht nicht gestützt."),
  'notesRu':("Число свидетелей 1688 года указывается по-разному: 42 человека, выслушанных на заседании совета 22 октября 1688 года, называет историк Рэйчел Вейл; в других источниках говорится о более чем семидесяти свидетелях, чьи показания были опубликованы.",
             "Официальное издание 1688 года содержит 40 показаний под присягой, данных на заседании совета 22 октября 1688 года; засчитывается и ответ 42 – общее число показаний в печатном отчёте вместе с двумя, принесёнными под присягой в Канцлерском суде 27 октября. «Более семидесяти» из ODNB отчётом не подтверждаются.")},
 {'f12504':f12504})

# ── b00318 · a1273 · f13122 ──
def f13122(f):
    w=f['wordings'][0]; assert w['id']=='w13302' and 'cardText' not in w
    w['cardText']=w['de']
    w['en']="According to producer George Martin, which Beatle jokingly suggested adding a high-pitched tone after A Day in the Life, the last song on Sgt. Pepper, with his dog Martha in mind?"
    w['de']="Welcher Beatle schlug laut Produzent George Martin scherzhaft vor, nach A Day in the Life, dem letzten Lied von Sgt. Pepper, einen hohen Pfeifton einzufügen – mit Blick auf seine Hündin Martha?"
    w['ru']="Какой участник «Битлз», по словам продюсера Джорджа Мартина, в шутку предложил поставить после песни «A Day in the Life», завершающей «Sgt. Pepper», высокий сигнал – думая о своей собаке Марте?"
    t=f['timeline']
    t['labelEn']="The Beatles record the run-out-groove chatter that ends Sgt. Pepper; the dog tone is added later, when the disc is cut"
    t['labelDe']="Die Beatles nehmen das Geplapper für die Auslaufrille am Ende von Sgt. Pepper auf; der Hundeton kommt später beim Schneiden der Platte hinzu"
    t['labelRu']="«Битлз» записывают болтовню для выходной канавки в конце «Sgt. Pepper»; «собачий» сигнал добавят позже, при нарезке пластинки"
    f['source']=src('b00318',"The Beatles’ “Dog Whistle” at the End of Sgt. Pepper: Attribution Research (research report)")
    untag(f,'risk:contested')
edit('a1273', {
 'En':[("The album closed with „A Day in the Life“, and after its last piano chord the Beatles slipped in a high-pitched tone of about 15 kilohertz, barely audible to people – according to producer George Martin it was Paul McCartney who suggested putting on „something which only a dog can hear“, although other accounts credit John Lennon with the idea.",
        "The album closed with „A Day in the Life“, and after its last piano chord came a high-pitched tone of about 15 kilohertz, barely audible to people, added when the master disc was cut. Producer George Martin remembered Paul McCartney proposing the gag with his dog Martha in mind, while the session historian Mark Lewisohn and the engineer Geoff Emerick credit John Lennon with the idea, so who suggested it remains disputed.")],
 'De':[("Das Album endete mit „A Day in the Life“, und nach dessen letztem Klavierakkord fügten die Beatles still und heimlich einen hohen Pfeifton von etwa 15 Kilohertz hinzu, für Menschen kaum hörbar – nach der Darstellung des Produzenten George Martin schlug Paul McCartney vor, etwas aufzunehmen, „das nur ein Hund hören kann“; andere Darstellungen schreiben den Einfall John Lennon zu.",
        "Das Album endete mit „A Day in the Life“, und nach dessen letztem Klavierakkord folgte ein hoher Pfeifton von etwa 15 Kilohertz, für Menschen kaum hörbar, der erst beim Schneiden der Masterplatte hinzukam. Produzent George Martin erinnerte sich, dass Paul McCartney den Gag mit Blick auf seine Hündin Martha vorschlug, während der Studiohistoriker Mark Lewisohn und der Toningenieur Geoff Emerick die Idee John Lennon zuschreiben – wer sie hatte, bleibt umstritten.")],
 'Ru':[("Альбом завершала «A Day in the Life», и после её последнего фортепианного аккорда «Битлз» вставили высокий сигнал частотой около 15 килогерц, едва слышный людям, — по словам продюсера Джорджа Мартина, записать «то, что услышит только собака», предложил Пол Маккартни, хотя по другим версиям идея принадлежала Джону Леннону.",
        "Альбом завершала «A Day in the Life», а после её последнего фортепианного аккорда звучал высокий сигнал частотой около 15 килогерц, едва слышный людям, — его добавили при нарезке мастер-диска. Продюсер Джордж Мартин вспоминал, что эту шутку предложил Пол Маккартни, думая о своей собаке Марте, тогда как историк студийных сессий Марк Льюисон и звукоинженер Джефф Эмерик приписывают идею Джону Леннону, так что её автор по-прежнему спорен.")]},
 {'notesEn':("producer George Martin credited Paul McCartney with the idea, while other accounts (e.g. Ian MacDonald) credit John Lennon; John Lennon is also accepted.",
             "producer George Martin remembered Paul McCartney suggesting it with his dog Martha in mind, while Mark Lewisohn's session history and the engineer Geoff Emerick credit John Lennon; John Lennon is also accepted."),
  'notesDe':("Produzent George Martin schrieb die Idee Paul McCartney zu, andere Darstellungen (etwa Ian MacDonald) John Lennon; John Lennon wird ebenfalls als richtig gewertet.",
             "Produzent George Martin erinnerte sich, dass Paul McCartney ihn mit Blick auf seine Hündin Martha vorschlug, während Mark Lewisohns Studiochronik und der Toningenieur Geoff Emerick die Idee John Lennon zuschreiben; John Lennon wird ebenfalls als richtig gewertet."),
  'notesRu':("продюсер Джордж Мартин приписывал идею Полу Маккартни, другие источники (например, Иэн Макдональд) — Джону Леннону; ответ «Джон Леннон» тоже засчитывается.",
             "продюсер Джордж Мартин вспоминал, что его предложил Пол Маккартни, думая о своей собаке Марте, а хроника сессий Марка Льюисона и звукоинженер Джефф Эмерик приписывают идею Джону Леннону; ответ «Джон Леннон» тоже засчитывается.")},
 {'f13122':f13122})

# ── b00320 · a0947 · f13224 ──
def f13224(f):
    f['answerEn']='About 3,000 cocoons'; f['answerDe']='Etwa 3.000 Kokons'; f['answerRu']='около 3000 коконов'
    w=f['wordings'][0]; assert w['id']=='w13414' and 'cardText' in w
    w['en']="According to Japan's Ministry of Agriculture, roughly how many silkworm cocoons are needed to make one kimono?"
    w['de']="Wie viele Seidenraupenkokons braucht man laut dem japanischen Landwirtschaftsministerium ungefähr für einen Kimono?"
    w['ru']="Сколько примерно коконов шелкопряда нужно, по данным министерства сельского хозяйства Японии, чтобы сделать одно кимоно?"
    f['source']=src('b00320',"How Many Silkworms Are Needed for One Kimono? (research report)")
    untag(f,'risk:contested')
edit('a0947', {
 'En':[("spins a single continuous thread up to 900 metres long from its salivary glands to form its cocoon. So many cocoons go into a garment that a single Japanese kimono takes the cocoons of about 2,000 silkworms, and some estimates run several times higher.",
        "spins a single continuous thread from its salivary glands to form its cocoon – in today's Japanese breeds some 1,300 metres long. So many cocoons go into a garment that, according to Japan's Ministry of Agriculture, a single kimono takes about 3,000 cocoons; the silk weavers of Tango reckon 2,600 cocoons from 2,700 silkworms for one standard bolt of kimono cloth, and lower estimates of about 2,000 are in the right range. Figures of 9,000 to 10,000 count a complete outfit, from the under-kimono to the obi.")],
 'De':[("spinnt aus seinen Speicheldrüsen einen einzigen durchgehenden Faden von bis zu 900 Metern Länge, um seinen Kokon zu bilden. Für ein Kleidungsstück braucht es so viele Kokons, dass ein einziger japanischer Kimono die Kokons von etwa 2.000 Seidenraupen verbraucht, und manche Schätzungen liegen um ein Mehrfaches höher.",
        "spinnt aus seinen Speicheldrüsen einen einzigen durchgehenden Faden, um seinen Kokon zu bilden – bei heutigen japanischen Zuchtrassen rund 1.300 Meter lang. Für ein Kleidungsstück braucht es so viele Kokons, dass ein einziger Kimono laut dem japanischen Landwirtschaftsministerium etwa 3.000 Kokons verbraucht; die Seidenweber von Tango rechnen mit 2.600 Kokons von 2.700 Seidenraupen für eine Standardbahn Kimonostoff, und niedrigere Schätzungen um 2.000 liegen in der richtigen Größenordnung. Zahlen von 9.000 bis 10.000 beziehen sich auf eine komplette Garnitur vom Unterkimono bis zum Obi.")],
 'Ru':[("выпускает из слюнных желёз одну непрерывную нить длиной до 900 метров, чтобы свить кокон. На одежду уходит столько коконов, что одно японское кимоно требует коконов около 2000 шелкопрядов, а по некоторым оценкам — в несколько раз больше.",
        "выпускает из слюнных желёз одну непрерывную нить, чтобы свить кокон, — у современных японских пород длиной около 1300 метров. На одежду уходит столько коконов, что одно кимоно, по данным министерства сельского хозяйства Японии, требует около 3000 коконов; ткачи шёлка из Танго считают, что на один стандартный отрез кимонной ткани нужно 2600 коконов от 2700 шелкопрядов, а более низкие оценки около 2000 тоже верны по порядку величины. Цифры в 9000–10 000 относятся к полному комплекту — от нижнего кимоно до пояса оби.")]},
 {'notesEn':("Estimates of cocoons per kimono vary widely (about 2,000 to 10,000); answers in the low thousands are acceptable.",
             "Japan's Ministry of Agriculture gives about 3,000 cocoons per kimono and Tango's silk industry 2,600 cocoons from 2,700 silkworms per bolt; answers from about 2,000 to 3,000 are accepted (the Trivial Pursuit card's 2,000 included). Figures of 9,000–10,000 count a complete kimono outfit."),
  'notesDe':("Die Schätzungen der Kokons pro Kimono schwanken stark (etwa 2.000 bis 10.000); Antworten im niedrigen Tausenderbereich gelten.",
             "Das japanische Landwirtschaftsministerium nennt etwa 3.000 Kokons pro Kimono, die Seidenindustrie von Tango 2.600 Kokons von 2.700 Seidenraupen pro Stoffbahn; Antworten von etwa 2.000 bis 3.000 gelten (auch die 2.000 der Trivial-Pursuit-Karte). Zahlen von 9.000–10.000 beziehen sich auf eine komplette Kimono-Garnitur."),
  'notesRu':("Оценки числа коконов на одно кимоно сильно расходятся (примерно от 2000 до 10 000); засчитываются ответы порядка нескольких тысяч.",
             "Министерство сельского хозяйства Японии называет около 3000 коконов на кимоно, шёлковая промышленность Танго — 2600 коконов от 2700 шелкопрядов на отрез; засчитываются ответы примерно от 2000 до 3000 (включая 2000 с карточки Trivial Pursuit). Цифры в 9000–10 000 относятся к полному комплекту кимоно.")},
 {'f13224':f13224})

# ── b00323 · a2497 · f13242 ──
def f13242(f):
    w=f['wordings'][0]; assert w['id']=='w13432' and 'cardText' in w
    w['en']="According to the traditional upper estimate, up to how many years can a termite queen live?"
    w['de']="Wie viele Jahre kann eine Termitenkönigin nach der überlieferten Höchstschätzung alt werden?"
    w['ru']="До скольких лет, по традиционной верхней оценке, может жить царица термитов?"
    f['source']=src('b00323',"Termite queen longevity: what is actually documented behind the “50 years” answer? (research report)")
    untag(f,'risk:contested')
edit('a2497', {
 'En':[("A termite queen can live up to 50 years according to some reports, laying eggs throughout her long life, although lifespans vary by species and such figures are estimates. In many species the documented maxima are lower: the Australian Museum gives up to 20 years. The best documented records come from ants: queens",
        "A termite queen can live up to 50 years according to the traditional upper estimate, laying eggs throughout her long life – but no queen has actually been followed for that long. The figure was already in print in the early 1950s, when the age of a colony, which can exceed 50 years, was sometimes taken for the age of its queen, although colonies can replace their founders. The documented records are lower: known-age kings and queens of the termite Prorhinotermes simplex have lived more than 20 years in the laboratory, and queens over 20 years old have been studied in long-monitored field colonies of Macrotermes natalensis. Ants hold the best documented record: queens"),
       ("| termite queen | reportedly up to 50 years |","| termite queen | traditionally up to 50 years (documented: over 20) |")],
 'De':[("Eine Termitenkönigin kann einigen Berichten zufolge bis zu 50 Jahre alt werden und legt ihr ganzes langes Leben lang Eier, wobei die Lebensdauer je nach Art schwankt und solche Zahlen Schätzungen sind. Bei vielen Arten liegen die belegten Höchstwerte niedriger: Das Australian Museum nennt bis zu 20 Jahre. Die am besten belegten Rekorde stammen von Ameisen: Königinnen",
        "Eine Termitenkönigin kann nach der überlieferten Höchstschätzung bis zu 50 Jahre alt werden und legt ihr ganzes langes Leben lang Eier – doch keine Königin wurde tatsächlich so lange beobachtet. Die Zahl stand schon Anfang der 1950er-Jahre im Druck, als das Alter eines Termitenstaats, das über 50 Jahre betragen kann, mitunter für das Alter seiner Königin gehalten wurde, obwohl Staaten ihre Gründer ersetzen können. Die belegten Rekorde liegen niedriger: Könige und Königinnen bekannten Alters der Termite Prorhinotermes simplex lebten im Labor mehr als 20 Jahre, und über 20 Jahre alte Königinnen wurden in lange beobachteten Freilandkolonien von Macrotermes natalensis untersucht. Den am besten belegten Rekord halten Ameisen: Königinnen"),
       ("| Termitenkönigin | angeblich bis zu 50 Jahre |","| Termitenkönigin | überliefert bis zu 50 Jahre (belegt: über 20) |")],
 'Ru':[("Царица термитов, по некоторым сообщениям, может жить до 50 лет, откладывая яйца на протяжении всей своей долгой жизни, хотя продолжительность жизни зависит от вида и такие цифры – оценки. У многих видов подтверждённые максимумы ниже: Австралийский музей называет до 20 лет. Лучше всего задокументированы рекорды муравьёв: среди них",
        "Царица термитов, по традиционной верхней оценке, может жить до 50 лет, откладывая яйца на протяжении всей своей долгой жизни, – но ни за одной царицей на самом деле не наблюдали так долго. Эта цифра печаталась уже в начале 1950-х годов, когда возраст термитника, который может превышать 50 лет, порой принимали за возраст его царицы, хотя колонии способны заменять основателей. Задокументированные рекорды ниже: короли и царицы термита Prorhinotermes simplex известного возраста прожили в лаборатории больше 20 лет, а царицы старше 20 лет изучались в многолетне наблюдаемых природных колониях Macrotermes natalensis. Лучше всего задокументирован рекорд муравьёв: среди них"),
       ("| царица термитов | по сообщениям, до 50 лет |","| царица термитов | традиционно до 50 лет (подтверждено: больше 20) |")]},
 {'notesEn':("Termite queen lifespans of 30 to 50 years are reported estimates and vary by species.",
             "The 50-year termite queen lifespan is a traditional upper estimate, not a measured record; known-age queens are documented at over 20 years. On the card (50 hours, 50 months or 50 years) 50 years is the right choice."),
  'notesDe':("Lebensdauern von Termitenköniginnen von 30 bis 50 Jahren sind berichtete Schätzungen und je nach Art verschieden.",
             "Die 50 Jahre einer Termitenkönigin sind eine überlieferte Höchstschätzung, kein gemessener Rekord; Königinnen bekannten Alters sind mit über 20 Jahren belegt. Auf der Karte (50 Stunden, 50 Monate oder 50 Jahre) ist 50 Jahre die richtige Wahl."),
  'notesRu':("Продолжительность жизни цариц термитов от 30 до 50 лет – это приводимые оценки, и она зависит от вида.",
             "50 лет жизни царицы термитов – традиционная верхняя оценка, а не измеренный рекорд; для цариц известного возраста подтверждено больше 20 лет. На карточке (50 часов, 50 месяцев или 50 лет) верный выбор – 50 лет.")},
 {'f13242':f13242})
print('ok')
