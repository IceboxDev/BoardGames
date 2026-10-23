// The quiz platform's own categories. Every article sits in exactly one
// domain and one of its sub-categories, whichever game its questions came
// from: a game's printed categories survive only as a source label on its
// printed wordings (`sources.ts`), never as navigation. There are 14
// domains of equal size (7 × 200 + 7 × 199 articles), each named after what
// it holds; articles and sub-categories may be regrouped, but a domain slug
// is never removed or renamed, only relabelled: members' `excludeFromAll`
// settings store domain slugs (an unknown slug would reset their settings).

export interface QuizSub {
  readonly slug: string;
  readonly en: string;
  readonly de: string;
  readonly ru: string;
}

export interface QuizDomain {
  /** 1-based position, the order the hub lists domains in. */
  readonly n: number;
  readonly slug: string;
  readonly en: string;
  readonly de: string;
  readonly ru: string;
  readonly subs: readonly QuizSub[];
}

const sub = (slug: string, en: string, de: string, ru: string): QuizSub => ({ slug, en, de, ru });

export const QUIZ_DOMAINS: readonly QuizDomain[] = [
  {
    n: 1,
    slug: "music-stage",
    en: "Music & Stage",
    de: "Musik & Bühne",
    ru: "Музыка и сцена",
    subs: [
      sub("classical", "Classical Music & Opera", "Klassik & Oper", "Классическая музыка и опера"),
      sub(
        "instruments",
        "Instruments & Music Theory",
        "Instrumente & Musiktheorie",
        "Инструменты и теория музыки",
      ),
      sub("pop-rock", "Pop Music & Pop Stars", "Popmusik & Popstars", "Поп-музыка и поп-звёзды"),
      sub("rock-metal", "Rock, Punk & Metal", "Rock, Punk & Metal", "Рок, панк и метал"),
      sub(
        "jazz-soul-hiphop",
        "Jazz, Soul & Hip-Hop",
        "Jazz, Soul & Hip-Hop",
        "Джаз, соул и хип-хоп",
      ),
      sub(
        "world-music",
        "German Pop & World Music",
        "Deutschpop & Weltmusik",
        "Немецкая эстрада и музыка мира",
      ),
      sub(
        "theatre",
        "Theatre, Drama & Cabaret",
        "Theater, Drama & Kabarett",
        "Театр, драма и кабаре",
      ),
      sub(
        "musicals",
        "Musicals, Ballet & Dance",
        "Musical, Ballett & Tanz",
        "Мюзиклы, балет и танец",
      ),
    ],
  },
  {
    n: 2,
    slug: "literature",
    en: "Literature & Words",
    de: "Literatur & Wörter",
    ru: "Литература и слова",
    subs: [
      sub(
        "german-lit",
        "German-Language Literature",
        "Deutschsprachige Literatur",
        "Немецкоязычная литература",
      ),
      sub("classics", "World Classics", "Klassiker der Weltliteratur", "Мировая классика"),
      sub("modern-lit", "Modern Fiction", "Moderne Romane", "Современная проза"),
      sub(
        "genre-fiction",
        "Crime, Sci-Fi & Fantasy",
        "Krimi, Science-Fiction & Fantasy",
        "Детективы, фантастика и фэнтези",
      ),
      sub(
        "children-lit",
        "Children's Books & Comics",
        "Kinderbücher & Comics",
        "Детские книги и комиксы",
      ),
      sub(
        "book-world",
        "Books, Authors & Prizes",
        "Bücher, Autoren & Preise",
        "Книги, авторы и премии",
      ),
      sub("plays", "Plays & Drama", "Theaterstücke & Drama", "Пьесы и драма"),
      sub(
        "poetry-words",
        "Poetry, Rhetoric & Word Origins",
        "Lyrik, Rhetorik & Wortherkunft",
        "Поэзия, риторика и происхождение слов",
      ),
    ],
  },
  {
    n: 3,
    slug: "art",
    en: "Art, Architecture & Design",
    de: "Kunst, Architektur & Design",
    ru: "Искусство, архитектура и дизайн",
    subs: [
      sub(
        "architecture",
        "Architectural Styles & Terms",
        "Baustile & Fachbegriffe",
        "Архитектурные стили и термины",
      ),
      sub(
        "historic-buildings",
        "Historic Buildings & Monuments",
        "Historische Bauten & Monumente",
        "Исторические здания и памятники",
      ),
      sub("modern-arch", "Modern Architecture", "Moderne Architektur", "Современная архитектура"),
      sub(
        "painting",
        "Old Masters & Painting",
        "Alte Meister & Malerei",
        "Старые мастера и живопись",
      ),
      sub(
        "modern-art",
        "Modern Art Movements",
        "Kunstrichtungen der Moderne",
        "Течения модернизма",
      ),
      sub(
        "art-world",
        "Contemporary Art & Museums",
        "Gegenwartskunst & Museen",
        "Современное искусство и музеи",
      ),
      sub(
        "sculpt-photo",
        "Sculpture & Photography",
        "Skulptur & Fotografie",
        "Скульптура и фотография",
      ),
      sub("design", "Fashion & Design", "Mode & Design", "Мода и дизайн"),
    ],
  },
  {
    n: 4,
    slug: "film-media",
    en: "Film & Television",
    de: "Film & Fernsehen",
    ru: "Кино и телевидение",
    subs: [
      sub("stars", "Film Stars & Their Roles", "Filmstars & ihre Rollen", "Кинозвёзды и их роли"),
      sub("film", "Famous Films & Quotes", "Berühmte Filme & Zitate", "Знаменитые фильмы и цитаты"),
      sub(
        "film-makers",
        "Directors, Oscars & Film Craft",
        "Regie, Oscars & Filmhandwerk",
        "Режиссёры, «Оскар» и киноремесло",
      ),
      sub(
        "franchises",
        "Franchises, Sci-Fi & Animation",
        "Filmreihen, Sci-Fi & Animation",
        "Франшизы, фантастика и анимация",
      ),
      sub(
        "world-cinema",
        "German & World Cinema",
        "Deutsches Kino & Weltkino",
        "Немецкое и мировое кино",
      ),
      sub(
        "tv-drama",
        "TV Series & Broadcasting",
        "Serien & Fernsehgeschichte",
        "Сериалы и телевидение",
      ),
    ],
  },
  {
    n: 5,
    slug: "sport-games",
    en: "Sport & Games",
    de: "Sport & Spiel",
    ru: "Спорт и игры",
    subs: [
      sub(
        "ball-sports",
        "Ball & Racket Sports",
        "Ball- & Rückschlagsport",
        "Игры с мячом и ракеткой",
      ),
      sub("football", "Football", "Fußball", "Футбол"),
      sub(
        "combat",
        "Combat Sports & Martial Arts",
        "Kampfsport & Kampfkunst",
        "Единоборства и боевые искусства",
      ),
      sub(
        "motor-winter",
        "Winter, Motor & Outdoor Sports",
        "Winter-, Motor- & Outdoorsport",
        "Зимние, моторные и природные виды спорта",
      ),
      sub(
        "olympics",
        "Olympics & Sport Culture",
        "Olympia & Sportkultur",
        "Олимпиады и спортивная культура",
      ),
      sub(
        "games",
        "Classic Games, Cards & Billiards",
        "Klassische Spiele, Karten & Billard",
        "Классические игры, карты и бильярд",
      ),
      sub(
        "board-games",
        "Modern Board & Card Games",
        "Moderne Brett- & Kartenspiele",
        "Современные настольные игры",
      ),
    ],
  },
  {
    n: 6,
    slug: "history",
    en: "History",
    de: "Geschichte",
    ru: "История",
    subs: [
      sub("ancient", "Ancient World", "Antike", "Древний мир"),
      sub("medieval", "Middle Ages", "Mittelalter", "Средние века"),
      sub("early-modern", "Early Modern Era", "Frühe Neuzeit", "Раннее Новое время"),
      sub(
        "modern-history",
        "19th Century & Empires",
        "19. Jahrhundert & Imperien",
        "XIX век и империи",
      ),
      sub(
        "world-wars",
        "World Wars & Interwar Years",
        "Weltkriege & Zwischenkriegszeit",
        "Мировые войны и межвоенные годы",
      ),
      sub(
        "cold-war",
        "Cold War & Divided Germany",
        "Kalter Krieg & geteiltes Deutschland",
        "Холодная война и разделённая Германия",
      ),
      sub(
        "contemporary",
        "Late 20th Century & Today",
        "Spätes 20. Jahrhundert & Gegenwart",
        "Конец XX века и наши дни",
      ),
      sub(
        "across-ages",
        "Turning Points Across the Ages",
        "Wendepunkte durch die Epochen",
        "Поворотные моменты сквозь эпохи",
      ),
    ],
  },
  {
    n: 7,
    slug: "society",
    en: "Politics, Law & Economy",
    de: "Politik, Recht & Wirtschaft",
    ru: "Политика, право и экономика",
    subs: [
      sub(
        "politics",
        "World Politics & Leaders",
        "Weltpolitik & Staatschefs",
        "Мировая политика и лидеры",
      ),
      sub("german-politics", "German Politics", "Deutsche Politik", "Политика Германии"),
      sub(
        "political-ideas",
        "State, Government & Diplomacy",
        "Staat, Regierung & Diplomatie",
        "Государство, власть и дипломатия",
      ),
      sub(
        "europe-un",
        "EU, UN & International Bodies",
        "EU, UNO & internationale Organisationen",
        "ЕС, ООН и международные организации",
      ),
      sub("law", "Law, Rights & Justice", "Recht, Rechte & Justiz", "Право, права и правосудие"),
      sub("business", "Economics & Trade", "Wirtschaft & Handel", "Экономика и торговля"),
      sub(
        "companies",
        "Corporations, Deals & Scandals",
        "Konzerne, Übernahmen & Skandale",
        "Корпорации, сделки и скандалы",
      ),
      sub("money", "Money & Currencies", "Geld & Währungen", "Деньги и валюты"),
    ],
  },
  {
    n: 8,
    slug: "belief",
    en: "Religion, Myth & Philosophy",
    de: "Religion, Mythos & Philosophie",
    ru: "Религия, мифы и философия",
    subs: [
      sub(
        "christianity",
        "Christianity & the Bible",
        "Christentum & Bibel",
        "Христианство и Библия",
      ),
      sub("religion", "World Religions", "Weltreligionen", "Мировые религии"),
      sub("mythology", "Gods & Heroes of Myth", "Götter & Helden der Mythen", "Боги и герои мифов"),
      sub(
        "folklore",
        "Folklore, Symbols & Occult",
        "Volksglaube, Symbole & Okkultes",
        "Фольклор, символы и оккультизм",
      ),
      sub("philosophy", "Philosophy", "Philosophie", "Философия"),
    ],
  },
  {
    n: 9,
    slug: "science",
    en: "Science & Medicine",
    de: "Wissenschaft & Medizin",
    ru: "Наука и медицина",
    subs: [
      sub("chemistry", "Chemistry & Elements", "Chemie & Elemente", "Химия и элементы"),
      sub(
        "maths",
        "Maths & Measurement",
        "Mathematik & Maßeinheiten",
        "Математика и единицы измерения",
      ),
      sub(
        "cells-genes",
        "Cells, Genes & Biology",
        "Zellen, Gene & Biologie",
        "Клетки, гены и биология",
      ),
      sub("human-body", "The Human Body", "Der menschliche Körper", "Человеческое тело"),
      sub("medicine", "Diseases & Treatment", "Krankheiten & Behandlung", "Болезни и лечение"),
      sub("med-history", "History of Medicine", "Geschichte der Medizin", "История медицины"),
      sub("psychology", "Mind & Psychology", "Geist & Psychologie", "Разум и психология"),
    ],
  },
  {
    n: 10,
    slug: "earth-space",
    en: "Physics, Earth & Space",
    de: "Physik, Erde & Weltraum",
    ru: "Физика, Земля и космос",
    subs: [
      sub(
        "astronomy",
        "Astronomy & the Night Sky",
        "Astronomie & Sternenhimmel",
        "Астрономия и звёздное небо",
      ),
      sub("spaceflight", "Spaceflight", "Raumfahrt", "Космонавтика"),
      sub("physics", "Physics & Energy", "Physik & Energie", "Физика и энергия"),
      sub(
        "geology",
        "Geology, Rocks & Volcanoes",
        "Geologie, Gestein & Vulkane",
        "Геология, горные породы и вулканы",
      ),
      sub("weather", "Weather & Climate", "Wetter & Klima", "Погода и климат"),
      sub("rivers-lakes", "Rivers, Lakes & Seas", "Flüsse, Seen & Meere", "Реки, озёра и моря"),
      sub(
        "mountains-isles",
        "Mountains, Islands & Parks",
        "Berge, Inseln & Nationalparks",
        "Горы, острова и национальные парки",
      ),
    ],
  },
  {
    n: 11,
    slug: "nature",
    en: "Animals & Plants",
    de: "Tiere & Pflanzen",
    ru: "Животные и растения",
    subs: [
      sub(
        "animals",
        "Animal Life, Birds & Reptiles",
        "Tierleben, Vögel & Reptilien",
        "Жизнь животных, птицы и рептилии",
      ),
      sub(
        "fish-insects",
        "Fish, Insects & Invertebrates",
        "Fische, Insekten & Wirbellose",
        "Рыбы, насекомые и беспозвоночные",
      ),
      sub("mammals", "Wild Mammals", "Wilde Säugetiere", "Дикие млекопитающие"),
      sub(
        "farm-names",
        "Domestic Animals & Animal Names",
        "Haustiere & Tiernamen",
        "Домашние животные и названия животных",
      ),
      sub("ecology", "Ecology & Evolution", "Ökologie & Evolution", "Экология и эволюция"),
      sub(
        "fruit-veg",
        "Fruit, Vegetables & Crops",
        "Obst, Gemüse & Nutzpflanzen",
        "Фрукты, овощи и культурные растения",
      ),
      sub(
        "plants",
        "Plants, Herbs & Fungi",
        "Pflanzen, Kräuter & Pilze",
        "Растения, травы и грибы",
      ),
      sub("trees", "Trees & Forests", "Bäume & Wälder", "Деревья и леса"),
    ],
  },
  {
    n: 12,
    slug: "technology",
    en: "Technology & Video Games",
    de: "Technik & Videospiele",
    ru: "Технологии и видеоигры",
    subs: [
      sub(
        "inventions",
        "Inventions & Inventors",
        "Erfindungen & Erfinder",
        "Изобретения и изобретатели",
      ),
      sub("transport", "Transport & Vehicles", "Verkehr & Fahrzeuge", "Транспорт и машины"),
      sub(
        "electronics",
        "Electronics & Communications",
        "Elektronik & Nachrichtentechnik",
        "Электроника и связь",
      ),
      sub(
        "computing",
        "Computers & Programming",
        "Computer & Programmierung",
        "Компьютеры и программирование",
      ),
      sub(
        "internet",
        "Internet & Tech Companies",
        "Internet & Tech-Konzerne",
        "Интернет и IT-компании",
      ),
      sub(
        "tech-terms",
        "Tech Abbreviations & Jargon",
        "Technik-Abkürzungen & Fachjargon",
        "Технические аббревиатуры и жаргон",
      ),
      sub("video-games", "Video Games", "Videospiele", "Видеоигры"),
    ],
  },
  {
    n: 13,
    slug: "geography",
    en: "Countries, Peoples & Languages",
    de: "Länder, Völker & Sprachen",
    ru: "Страны, народы и языки",
    subs: [
      sub("countries", "Countries & Borders", "Länder & Grenzen", "Страны и границы"),
      sub(
        "cities",
        "Cities & Sights",
        "Städte & Sehenswürdigkeiten",
        "Города и достопримечательности",
      ),
      sub(
        "peoples",
        "Peoples, Flags & Emblems",
        "Völker, Flaggen & Wappen",
        "Народы, флаги и гербы",
      ),
      sub(
        "customs",
        "Customs, Cuisines & Festivals",
        "Bräuche, Küchen & Feste",
        "Обычаи, кухни и праздники",
      ),
      sub(
        "societies",
        "Societies & Social Science",
        "Gesellschaften & Sozialwissenschaft",
        "Общества и социология",
      ),
      sub("language", "Languages & Scripts", "Sprachen & Schriften", "Языки и письменность"),
      sub(
        "loanwords",
        "Loanwords & Word Origins",
        "Lehnwörter & Wortherkunft",
        "Заимствования и происхождение слов",
      ),
    ],
  },
  {
    n: 14,
    slug: "everyday",
    en: "Everyday Life & Pop Culture",
    de: "Alltag & Popkultur",
    ru: "Повседневность и поп-культура",
    subs: [
      sub("food", "Food & Drink", "Essen & Trinken", "Еда и напитки"),
      sub(
        "brands",
        "Brands, Fashion & Advertising",
        "Marken, Mode & Werbung",
        "Бренды, мода и реклама",
      ),
      sub(
        "shops-companies",
        "Shops & Consumer Companies",
        "Läden & Konsumunternehmen",
        "Магазины и потребительские компании",
      ),
      sub(
        "tv-entertainment",
        "TV Entertainment & Celebrities",
        "TV-Unterhaltung & Prominente",
        "Телеразвлечения и знаменитости",
      ),
      sub("media", "Press & Broadcasting", "Presse & Rundfunk", "Пресса и вещание"),
      sub(
        "online-culture",
        "Social Media & Online Culture",
        "Soziale Medien & Netzkultur",
        "Соцсети и интернет-культура",
      ),
      sub(
        "leisure",
        "Toys, Pastimes & Holidays",
        "Spielzeug, Zeitvertreib & Feiertage",
        "Игрушки, досуг и праздники",
      ),
      sub("sayings", "Idioms & Sayings", "Redewendungen & Sprichwörter", "Идиомы и поговорки"),
    ],
  },
];

export const DOMAIN_COUNT = QUIZ_DOMAINS.length;
export const DOMAIN_SLUGS = QUIZ_DOMAINS.map((d) => d.slug) as [string, ...string[]];

export function domainBySlug(slug: string): QuizDomain | undefined {
  return QUIZ_DOMAINS.find((d) => d.slug === slug);
}

export function subOf(domain: string, slug: string): QuizSub | undefined {
  return domainBySlug(domain)?.subs.find((s) => s.slug === slug);
}
