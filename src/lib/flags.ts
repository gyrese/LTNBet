// Associe un nom d'équipe (nation) à un code pays ISO → vrai drapeau SVG (flagcdn.com).
// Les emojis drapeaux ne s'affichent pas sous Windows/plusieurs écrans → on privilégie les images.

/** Normalise un nom : minuscules, sans accents, sans espaces superflus. */
function norm(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

// Clés NORMALISÉES (sans accent). Codes ISO 3166-1 alpha-2 (+ subdivisions gb-* pour le Royaume-Uni).
const COUNTRY_CODES: Record<string, string> = {
  // Europe
  france: 'fr',
  angleterre: 'gb-eng', england: 'gb-eng',
  ecosse: 'gb-sct', scotland: 'gb-sct',
  'pays de galles': 'gb-wls', wales: 'gb-wls',
  'irlande du nord': 'gb-nir', 'northern ireland': 'gb-nir',
  irlande: 'ie', ireland: 'ie',
  espagne: 'es', spain: 'es',
  allemagne: 'de', germany: 'de',
  italie: 'it', italy: 'it',
  portugal: 'pt',
  belgique: 'be', belgium: 'be',
  'pays-bas': 'nl', 'pays bas': 'nl', netherlands: 'nl', holland: 'nl',
  croatie: 'hr', croatia: 'hr',
  suisse: 'ch', switzerland: 'ch',
  pologne: 'pl', poland: 'pl',
  danemark: 'dk', denmark: 'dk',
  autriche: 'at', austria: 'at',
  ukraine: 'ua',
  turquie: 'tr', turkey: 'tr', turkiye: 'tr',
  suede: 'se', sweden: 'se',
  norvege: 'no', norway: 'no',
  finlande: 'fi', finland: 'fi',
  islande: 'is', iceland: 'is',
  grece: 'gr', greece: 'gr',
  serbie: 'rs', serbia: 'rs',
  'republique tcheque': 'cz', tchequie: 'cz', czechia: 'cz', 'czech republic': 'cz',
  slovaquie: 'sk', slovakia: 'sk',
  slovenie: 'si', slovenia: 'si',
  hongrie: 'hu', hungary: 'hu',
  roumanie: 'ro', romania: 'ro',
  bulgarie: 'bg', bulgaria: 'bg',
  russie: 'ru', russia: 'ru',
  albanie: 'al', albania: 'al',
  georgie: 'ge', georgia: 'ge',
  'cap-vert': 'cv', 'cap vert': 'cv', 'cape verde': 'cv',
  // Afrique
  senegal: 'sn',
  maroc: 'ma', morocco: 'ma',
  tunisie: 'tn', tunisia: 'tn',
  algerie: 'dz', algeria: 'dz',
  egypte: 'eg', egypt: 'eg',
  ghana: 'gh',
  nigeria: 'ng',
  cameroun: 'cm', cameroon: 'cm',
  "cote d'ivoire": 'ci', 'ivory coast': 'ci',
  mali: 'ml',
  'afrique du sud': 'za', 'south africa': 'za',
  'rd congo': 'cd', 'dr congo': 'cd', 'congo dr': 'cd',
  guinee: 'gn', guinea: 'gn',
  'burkina faso': 'bf',
  gabon: 'ga',
  angola: 'ao',
  // Amériques
  bresil: 'br', brazil: 'br',
  argentine: 'ar', argentina: 'ar',
  uruguay: 'uy',
  colombie: 'co', colombia: 'co',
  chili: 'cl', chile: 'cl',
  perou: 'pe', peru: 'pe',
  paraguay: 'py',
  equateur: 'ec', ecuador: 'ec',
  venezuela: 've',
  bolivie: 'bo', bolivia: 'bo',
  'etats-unis': 'us', 'etats unis': 'us', usa: 'us', 'united states': 'us',
  mexique: 'mx', mexico: 'mx',
  canada: 'ca',
  'costa rica': 'cr',
  panama: 'pa',
  honduras: 'hn',
  jamaique: 'jm', jamaica: 'jm',
  // Asie / Océanie
  japon: 'jp', japan: 'jp',
  'coree du sud': 'kr', 'south korea': 'kr', 'korea republic': 'kr', coree: 'kr',
  australie: 'au', australia: 'au',
  iran: 'ir',
  'arabie saoudite': 'sa', 'saudi arabia': 'sa',
  qatar: 'qa',
  irak: 'iq', iraq: 'iq',
  jordanie: 'jo', jordan: 'jo',
  'emirats arabes unis': 'ae', uae: 'ae',
  ouzbekistan: 'uz', uzbekistan: 'uz',
  'nouvelle-zelande': 'nz', 'new zealand': 'nz',
};

/** URL d'un drapeau SVG haute qualité (flagcdn.com). `null` si la nation n'est pas connue. */
export function flagUrlFor(team: string): string | null {
  if (!team) return null;
  const code = COUNTRY_CODES[norm(team)];
  return code ? `https://flagcdn.com/${code}.svg` : null;
}

/** Emoji drapeau de secours (généré depuis le code à 2 lettres). ⚽ sinon. */
export function flagFor(team: string): string {
  if (!team) return '⚽';
  const code = COUNTRY_CODES[norm(team)];
  if (code && code.length === 2) {
    return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  }
  return '⚽';
}
