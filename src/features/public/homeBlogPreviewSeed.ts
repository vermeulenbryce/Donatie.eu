/** Matches `BLOG_SEED` + `renderBlogHomePreview()` in legacy index.html */

export type LegacyBlogPost = {
  id: string
  titel: string
  categorie: string
  auteur: string
  omschrijving: string
  stemmen: number
  type: string
  status: string
  featured?: boolean
}

export const CAT_ICONS: Record<string, string> = {
  kinderen: '👧',
  sociaal: '🤝',
  natuur: '🌿',
  gezondheid: '💊',
  dieren: '🐾',
  onderwijs: '📚',
  innovatie: '💡',
  sport: '⚽',
  kunst: '🎨',
  overig: '💡',
  wonen: '🏠',
  armoede: '❤️',
  milieu: '🌍',
}

const BLOG_SEED: LegacyBlogPost[] = [
  {
    id: 'blog1',
    titel: 'Schoolmoestuinen voor elk kind',
    categorie: 'kinderen',
    auteur: 'Emma de Vries',
    omschrijving:
      'Stel je voor: elk schoolkind in Nederland heeft toegang tot een eigen moestuin. Kinderen leren over natuur, gezond eten en samenwerken. Donatie.eu zou dit kunnen realiseren via een landelijke crowdfunding.',
    stemmen: 142,
    type: 'idee',
    status: 'actief',
  },
  {
    id: 'blog2',
    titel: 'Digitale buddy voor eenzame ouderen',
    categorie: 'sociaal',
    auteur: 'Pieter Jansen',
    omschrijving:
      'Veel ouderen zijn eenzaam maar hebben geen zin in "gewone" hulp. Een digitale buddy — een tablet met video-bellen en hulp van vrijwilligers — kan dit aanpakken. Donatie.eu kan dit project uitrollen via lokale partners.',
    stemmen: 98,
    type: 'idee',
    status: 'actief',
  },
  {
    id: 'blog3',
    titel: 'Plastic-vrije stranden actiedag',
    categorie: 'natuur',
    auteur: 'Sara Bakker',
    omschrijving:
      'Een nationale actiedag waarbij vrijwilligers van Donatie.eu samen alle stranden schoonmaken. Combineer dit met bewustwording over plastic soep en een puntenactie voor deelnemers.',
    stemmen: 211,
    type: 'idee',
    status: 'winnaar',
  },
  {
    id: 'blog4',
    titel: 'POLL: Welk project krijgt €10.000?',
    categorie: 'innovatie',
    auteur: 'Donatie.eu Team',
    omschrijving:
      'Wij hebben €10.000 gereserveerd voor een community-project. Stem op jouw favoriet! Het project met de meeste stemmen voor 1 april wordt uitgevoerd.',
    stemmen: 334,
    type: 'poll',
    status: 'actief',
  },
]

export function getHomeBlogPreviewPosts(): LegacyBlogPost[] {
  return BLOG_SEED.filter((p) => p.status === 'actief' && (p.featured || (p.stemmen || 0) > 50))
    .sort((a, b) => (b.stemmen || 0) - (a.stemmen || 0))
    .slice(0, 3)
}
