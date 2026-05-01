export type LegalBlock = { intro: string; bullets: string[] }

export const LEGAL_COPY: Record<string, LegalBlock> = {
  Privacybeleid: {
    intro:
      'We verwerken alleen gegevens die nodig zijn voor accountbeheer, donaties, punten en beveiliging van het platform.',
    bullets: [
      'Persoonsgegevens worden niet verkocht aan derden.',
      'Je kunt inzage, correctie en verwijdering aanvragen via privacy@donatie.eu.',
      'Betaalgegevens worden verwerkt via externe betaalproviders.',
    ],
  },
  'Algemene voorwaarden': {
    intro:
      'Deze voorwaarden beschrijven het gebruik van Donatie.eu, accountverantwoordelijkheden en regels rond donaties.',
    bullets: [
      'Misbruik, fraude en manipulatie van ranglijsten is niet toegestaan.',
      'Beloningen in de puntenwinkel zijn onder voorbehoud van beschikbaarheid.',
      'Wij kunnen voorwaarden bijwerken met redelijke aankondiging.',
    ],
  },
  'ANBI-info': {
    intro:
      'Donatie.eu werkt met organisaties die voldoen aan relevante controles en publieke verantwoordingsnormen.',
    bullets: [
      'Doelen worden periodiek gecontroleerd op actuele status.',
      'Campagnes met onduidelijke bestemming worden niet gepubliceerd.',
      'Gebruikers kunnen onjuiste informatie melden via support.',
    ],
  },
  Transparantie: {
    intro:
      'Wij maken inzichtelijk hoe donaties, platformkosten en puntenlogica binnen het systeem worden toegepast.',
    bullets: [
      'Donatie-overzichten zijn zichtbaar in je dashboard.',
      'Belangrijke wijzigingen in puntensysteem worden aangekondigd.',
      'Rapportages kunnen op verzoek beschikbaar worden gesteld.',
    ],
  },
  'Anti-fraude beleid': {
    intro:
      'Fraude-preventie richt zich op accountmisbruik, verdachte transacties en manipulatie van badges/ranglijsten.',
    bullets: [
      'Verdachte activiteit kan leiden tot tijdelijke blokkade.',
      'Accounts kunnen extra verificatie vereisen bij afwijkend gedrag.',
      'Misbruikmeldingen worden onderzocht en gedocumenteerd.',
    ],
  },
  Cookieverklaring: {
    intro:
      'Cookies helpen ons sessies te beheren, voorkeuren te bewaren en de gebruikerservaring te verbeteren.',
    bullets: [
      'Functionele cookies zijn nodig voor basisfunctionaliteit.',
      'Analysecookies worden geanonimiseerd toegepast waar mogelijk.',
      'Je kunt cookies beheren via browserinstellingen.',
    ],
  },
  Gegevensverwerking: {
    intro:
      'Verwerking van gegevens gebeurt doelgebonden en beperkt tot wat functioneel noodzakelijk is.',
    bullets: [
      'Dataminimalisatie is standaard: alleen benodigde velden worden opgeslagen.',
      'Toegang tot gevoelige data is beperkt tot geautoriseerde beheerders.',
      'Bewaartermijnen volgen wettelijke en operationele noodzaak.',
    ],
  },
  'AVG / GDPR': {
    intro:
      'Donatie.eu ondersteunt kernrechten uit de AVG/GDPR, waaronder inzage, correctie en verwijdering.',
    bullets: [
      'Verzoeken worden binnen redelijke termijn afgehandeld.',
      'Dataverwerking is gebaseerd op toestemming of gerechtvaardigd belang.',
      'Beveiligingsmaatregelen worden periodiek geëvalueerd.',
    ],
  },
  'Recht op inzage': {
    intro:
      'Je kunt opvragen welke gegevens aan je account zijn gekoppeld en waarvoor die worden gebruikt.',
    bullets: [
      'Aanvragen verlopen via privacy@donatie.eu.',
      'We kunnen aanvullende verificatie vragen om identiteit te bevestigen.',
      'Je ontvangt overzicht in een gangbaar leesbaar formaat.',
    ],
  },
}

export const LEGAL_PAGE_TITLES: string[] = Object.keys(LEGAL_COPY)

export const GENERIC_LEGAL_FALLBACK: LegalBlock = {
  intro:
    'Dit document bevat informatie over het juridisch kader en de verwerking van gegevens binnen Donatie.eu.',
  bullets: [
    'Voor vragen kun je contact opnemen met support.',
    'Wijzigingen worden op deze pagina gepubliceerd.',
  ],
}

export function getDefaultLegalBlock(title: string): LegalBlock {
  return LEGAL_COPY[title] ?? GENERIC_LEGAL_FALLBACK
}
