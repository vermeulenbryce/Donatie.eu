export type AdminSectionId =
  | 'dashboard'
  | 'featured'
  | 'goededoelen'
  | 'faq'
  | 'logos'
  | 'nieuws'
  | 'users'
  | 'influencers'
  | 'communities'
  | 'vrijwilliger'
  | 'collectanten'
  | 'markten'
  | 'punten'
  | 'shop'
  | 'bedragen'
  | 'meldingen'
  | 'push'
  | 'sessions'
  | 'betalingen'
  | 'projecten'
  | 'finance'
  | 'footer'
  | 'email'
  | 'responsive'

export type AdminSection = {
  id: AdminSectionId
  label: string
  group: string
  icon: string
  /** `true` = volledig live in deze fase; anders placeholder met "in aanbouw" */
  livePhase1?: boolean
}

export const ADMIN_SECTIONS: AdminSection[] = [
  { id: 'dashboard', label: 'Dashboard', group: 'Overzicht', icon: '▦', livePhase1: true },

  { id: 'featured',    label: 'Uitgelichte doelen', group: 'Content beheer', icon: '★', livePhase1: true },
  { id: 'goededoelen', label: 'Goede doelen beheer', group: 'Content beheer', icon: '◎', livePhase1: true },
  { id: 'faq',         label: 'FAQ beheren', group: 'Content beheer', icon: '?', livePhase1: true },
  { id: 'logos',       label: "Logo's & Branding", group: 'Content beheer', icon: '◰', livePhase1: true },
  { id: 'nieuws',      label: 'Nieuwsbeheer', group: 'Content beheer', icon: '▤', livePhase1: true },

  { id: 'users',        label: 'Gebruikersoverzicht', group: 'Gebruikers & Community', icon: '☰', livePhase1: true },
  { id: 'influencers',  label: 'Influencers & Communities', group: 'Gebruikers & Community', icon: '✦', livePhase1: true },
  { id: 'communities',  label: 'Community beheer', group: 'Gebruikers & Community', icon: '◎', livePhase1: true },
  { id: 'vrijwilliger', label: 'Vrijwilliger verzoeken', group: 'Gebruikers & Community', icon: '♥', livePhase1: true },
  { id: 'collectanten', label: 'Collectant verzoeken', group: 'Gebruikers & Community', icon: '🎗', livePhase1: true },
  { id: 'markten',      label: 'Markten & modules', group: 'Gebruikers & Community', icon: '◍', livePhase1: true },

  { id: 'punten',    label: 'Puntensysteem beheer', group: 'Punten & Winkel', icon: '★', livePhase1: true },
  { id: 'shop',      label: 'Puntenwinkel', group: 'Punten & Winkel', icon: '🛍', livePhase1: true },
  { id: 'bedragen',  label: 'Donatiebedragen', group: 'Punten & Winkel', icon: '€', livePhase1: true },

  { id: 'meldingen', label: 'Meldingen', group: 'Berichten & Meldingen', icon: '!', livePhase1: true },
  { id: 'push',      label: 'Pushberichten', group: 'Berichten & Meldingen', icon: '✉', livePhase1: true },
  { id: 'sessions',  label: 'Actieve sessies', group: 'Berichten & Meldingen', icon: '⊙', livePhase1: true },

  { id: 'betalingen', label: 'Betalingen', group: 'Financiën', icon: '▤', livePhase1: true },
  { id: 'projecten', label: 'Projecten', group: 'Financiën', icon: '◫', livePhase1: true },
  { id: 'finance',    label: 'Financieel overzicht', group: 'Financiën', icon: '∑', livePhase1: true },

  { id: 'footer',     label: 'Footer & Juridisch', group: 'Instellingen', icon: '▁', livePhase1: true },
  { id: 'email',      label: 'E-mail templates', group: 'Instellingen', icon: '✉', livePhase1: true },
  { id: 'responsive', label: 'Responsive preview', group: 'Instellingen', icon: '▢', livePhase1: true },
]

export const ADMIN_SECTION_GROUPS: { label: string; items: AdminSection[] }[] = (() => {
  const map = new Map<string, AdminSection[]>()
  for (const s of ADMIN_SECTIONS) {
    if (!map.has(s.group)) map.set(s.group, [])
    map.get(s.group)!.push(s)
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }))
})()
