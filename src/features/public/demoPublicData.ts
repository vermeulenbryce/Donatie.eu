/** Statische demo-data voor publieke pagina’s (legacy index.html). */

export type CauseCategory =
  | 'alle'
  | 'NEDERLAND'
  | 'GEZONDHEID'
  | 'DIEREN EN NATUUR'
  | 'MILIEU EN NATUUR'
  | 'SOCIAAL EN WELZIJN'
  | 'INTERNATIONALE HULP EN MENSENRECHTEN'
  | 'CULTUUR EN EDUCATIE'

export type DemoCause = {
  id: string
  name: string
  category: Exclude<CauseCategory, 'alle'>
  excerpt: string
  emoji: string
}

export const DEMO_CAUSES: DemoCause[] = [
  {
    id: '1',
    name: 'KWF Kankerbestrijding',
    category: 'GEZONDHEID',
    excerpt: 'Samen tegen kanker — onderzoek en voorlichting in Nederland.',
    emoji: '🎗️',
  },
  {
    id: '2',
    name: 'Het Nederlandse Rode Kruis',
    category: 'NEDERLAND',
    excerpt: 'Hulp waar nodig: rampen, gezondheid en kwetsbare groepen.',
    emoji: '⛑️',
  },
  {
    id: '3',
    name: 'WWF Nederland',
    category: 'MILIEU EN NATUUR',
    excerpt: 'Bescherming van wilde dieren en leefgebieden wereldwijd.',
    emoji: '🐼',
  },
  {
    id: '4',
    name: 'Unicef Nederland',
    category: 'INTERNATIONALE HULP EN MENSENRECHTEN',
    excerpt: 'Rechten en gezondheid van kinderen overal ter wereld.',
    emoji: '🌍',
  },
  {
    id: '5',
    name: 'Landelijk Fonds Kinderhulp',
    category: 'SOCIAAL EN WELZIJN',
    excerpt: 'Financiële steun voor kinderen die het thuis moeilijk hebben.',
    emoji: '🤝',
  },
  {
    id: '6',
    name: 'Dierenbescherming',
    category: 'DIEREN EN NATUUR',
    excerpt: 'Voor welzijn van huisdieren, landbouwdieren en wilde dieren.',
    emoji: '🐾',
  },
  {
    id: '7',
    name: 'Prins Bernhard Cultuurfonds',
    category: 'CULTUUR EN EDUCATIE',
    excerpt: 'Behoud en vernieuwing van natuur en cultuur in Nederland.',
    emoji: '📚',
  },
  {
    id: '8',
    name: 'Hersenstichting',
    category: 'GEZONDHEID',
    excerpt: 'Onderzoek naar hersenen en ziekten van het zenuwstelsel.',
    emoji: '🧠',
  },
]

export type RankTabId =
  | 'individuen'
  | 'bedrijven'
  | 'projecten'
  | 'influencers'
  | 'puntensysteem'
  | 'goededoelen'

export type RankRow = {
  rank: number
  name: string
  euros: string
  points: string
  diff: string
  medal?: '🥇' | '🥈' | '🥉'
}

export const DEMO_RANK_ROWS: Record<RankTabId, RankRow[]> = {
  individuen: [
    { rank: 1, name: 'Peter H.', euros: '€1.240', points: '312', diff: '↑ 12', medal: '🥇' },
    { rank: 2, name: 'Lisa V.', euros: '€980', points: '268', diff: '↑ 4', medal: '🥈' },
    { rank: 3, name: 'Marijn B.', euros: '€820', points: '214', diff: '↓ 2', medal: '🥉' },
    { rank: 4, name: 'Anouk D.', euros: '€640', points: '188', diff: '—' },
    { rank: 5, name: 'Tom W.', euros: '€510', points: '156', diff: '↑ 8' },
  ],
  bedrijven: [
    { rank: 1, name: 'Studio Noord B.V.', euros: '€4.200', points: '890', diff: '↑ 40', medal: '🥇' },
    { rank: 2, name: 'Café De Hoek', euros: '€2.800', points: '612', diff: '—', medal: '🥈' },
    { rank: 3, name: 'Tech4Good B.V.', euros: '€2.100', points: '540', diff: '↑ 22', medal: '🥉' },
  ],
  projecten: [
    { rank: 1, name: 'Marathon voor het asiel', euros: '€6.400', points: '420', diff: '↑ 18', medal: '🥇' },
    { rank: 2, name: 'Schoolplein groener', euros: '€3.900', points: '310', diff: '↑ 6', medal: '🥈' },
  ],
  influencers: [
    { rank: 1, name: '@sara_gives', euros: '€2.100', points: '780', diff: '↑ 31', medal: '🥇' },
    { rank: 2, name: '@milan_doet', euros: '€1.450', points: '590', diff: '—', medal: '🥈' },
  ],
  puntensysteem: [
    { rank: 1, name: 'Elite donor #8821', euros: '—', points: '2.840', diff: '↑ 120', medal: '🥇' },
    { rank: 2, name: 'Sticker ambassadeur', euros: '—', points: '2.100', diff: '↑ 44', medal: '🥈' },
    { rank: 3, name: 'Maandelijkse held', euros: '—', points: '1.960', diff: '↓ 8', medal: '🥉' },
  ],
  goededoelen: [
    { rank: 1, name: 'KWF (campagne Q2)', euros: '€18.200', points: 'n.v.t.', diff: '↑ 5%', medal: '🥇' },
    { rank: 2, name: 'Rode Kruis', euros: '€14.900', points: 'n.v.t.', diff: '—', medal: '🥈' },
  ],
}

export type DemoProject = {
  id: string
  title: string
  category: string
  raised: number
  goal: number
  banner: string
}

export const DEMO_PROJECTS: DemoProject[] = [
  { id: 'p1', title: 'Marathon voor het dierenasiel', category: 'Dieren', raised: 4200, goal: 8000, banner: 'linear-gradient(135deg,#059669,#10b981)' },
  { id: 'p2', title: 'Schoolplein vol bloemen', category: 'Kinderen', raised: 2100, goal: 3500, banner: 'linear-gradient(135deg,#7c3aed,#8b5cf6)' },
  { id: 'p3', title: 'Warme winter voor ouderen', category: 'Gezondheid', raised: 8900, goal: 12000, banner: 'linear-gradient(135deg,#dc2626,#f97316)' },
  { id: 'p4', title: 'Plasticvrij strandweekend', category: 'Natuur', raised: 1800, goal: 5000, banner: 'linear-gradient(135deg,#0284c7,#22d3ee)' },
]

export type DemoNews = {
  id: string
  type: string
  title: string
  date: string
  emoji: string
}

export const DEMO_NEWS: DemoNews[] = [
  { id: 'n1', type: 'nieuws', title: 'Donatie.eu sluit partnerschap met drie nieuwe ANBI’s', date: '12 apr 2026', emoji: '📰' },
  { id: 'n2', type: 'update', title: 'Nieuwe filters op de goede-doelenpagina', date: '8 apr 2026', emoji: '📢' },
  { id: 'n3', type: 'succes', title: '€100.000 opgehaald via sticker-campagnes', date: '1 apr 2026', emoji: '🏆' },
  { id: 'n4', type: 'evenement', title: 'Live Q&A over het puntensysteem', date: '28 mrt 2026', emoji: '📅' },
]

export type DemoBlogPost = {
  id: string
  title: string
  excerpt: string
  votes: number
  tag: 'idee' | 'poll' | 'winnaar'
  category: string
}

export const DEMO_BLOG_POSTS: DemoBlogPost[] = [
  {
    id: 'b1',
    title: 'Buurtmoestuin op elk schoolplein',
    excerpt: 'Kinderen leren groente kweken én dragen bij aan biodiversiteit.',
    votes: 128,
    tag: 'idee',
    category: 'natuur',
  },
  {
    id: 'b2',
    title: 'Poll: welk thema prioriteit in Q3?',
    excerpt: 'Stem mee op gezondheid, dieren of onderwijs.',
    votes: 340,
    tag: 'poll',
    category: 'innovatie',
  },
  {
    id: 'b3',
    title: 'Winnaar: “Warme truien voor iedereen”',
    excerpt: 'Het project wordt dit voorjaar uitgerold met lokale partners.',
    votes: 512,
    tag: 'winnaar',
    category: 'sociaal',
  },
]

export const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: 'Hoeveel van mijn donatie gaat naar het goede doel?',
    a: '80% van elke donatie gaat direct naar het door jou gekozen ANBI-gecertificeerde goede doel. De overige 20% dekt de platformkosten van Donatie.eu, waaronder beheer, ontwikkeling en betalingsverwerking. Zo houden wij het platform gratis en toegankelijk voor iedereen.',
  },
  {
    q: 'Waarom gaat er 20% naar het platform?',
    a: 'Donatie.eu investeert de 20% platformbijdrage in technische ontwikkeling, klantenservice, betalingsverwerking en marketing om meer donateurs te bereiken. Dankzij dit model kunnen wij het platform gratis aanbieden aan goede doelen en donateurs. Alle kosten zijn volledig transparant inzichtelijk.',
  },
  {
    q: 'Zijn alle goede doelen echt ANBI-gecertificeerd?',
    a: 'Ja, absoluut. Donatie.eu accepteert uitsluitend ANBI-gecertificeerde goede doelen. Elke organisatie wordt zorgvuldig geverifieerd voordat ze op het platform verschijnt. Je kunt altijd de ANBI-status controleren via de Belastingdienst.',
  },
  {
    q: 'Hoe werkt het puntensysteem?',
    a: 'Voor elke euro donatie ontvang je 0,5 punt. Extra bonussen verdien je via terugkerende donaties (×1.2), campagneacties (×1.5), stickers (+50/+100), en streaks. Je punten kun je inwisselen voor kortingen, producten, loterijen en meer.',
  },
  {
    q: 'Kan ik anoniem doneren?',
    a: 'Ja! Je kunt altijd kiezen voor anonimiteit op de ranglijst. Je punten tellen gewoon mee, maar je naam blijft verborgen. Dit kun je instellen in je accountinstellingen of tijdens het donatieproces.',
  },
  {
    q: 'Via welke betaalmethoden kan ik doneren?',
    a: 'Wij ondersteunen iDEAL, creditcard en PayPal. Je kunt kiezen voor een eenmalige donatie of een terugkerende bijdrage op maandelijkse, kwartaal- of jaarlijkse basis.',
  },
  {
    q: 'Hoe weet ik dat mijn geld veilig is?',
    a: 'Alle fondsen worden verwerkt via een onafhankelijke Stichting Derdengelden. Dit betekent dat jouw geld volledig gescheiden is van de operationele activiteiten van Donatie.eu. Je ontvangt ook automatisch een jaarlijks donatie-overzicht voor je belastingaangifte.',
  },
  {
    q: 'Kan ik een terugkerende donatie instellen?',
    a: 'Ja! Bij elke donatie kun je kiezen voor maandelijks, per kwartaal of jaarlijks. Terugkerende donaties leveren een ×1.2 puntenmultiplier op en helpen goede doelen met voorspelbare cashflow.',
  },
  {
    q: 'Hoe werkt het stickerprogramma?',
    a: 'Na aankoop van een sticker ontvang je 50 (persoonlijk) of 100 (zakelijk) bonuspunten op je account. De sticker laat aan collectantes zien dat jij al digitaal doneert. Bedrijven met een sticker worden speciaal vermeld op de bedrijfsranglijst.',
  },
]
