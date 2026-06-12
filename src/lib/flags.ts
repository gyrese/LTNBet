// Associe un nom d'équipe (nation) à un code pays ISO → vrai drapeau SVG (flagcdn.com).
// Les emojis drapeaux ne s'affichent pas sous Windows/plusieurs écrans → on privilégie les images.

/** Normalise un nom : minuscules, sans accents, sans espaces superflus. */
function norm(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

// Clés NORMALISÉES (sans accent). Codes ISO 3166-1 alpha-2 (+ subdivisions gb-* pour le Royaume-Uni).
const COUNTRY_CODES: Record<string, string> = {
  // Europe Ouest
  france: 'fr',
  angleterre: 'gb-eng', england: 'gb-eng',
  ecosse: 'gb-sct', scotland: 'gb-sct',
  'pays de galles': 'gb-wls', wales: 'gb-wls',
  'irlande du nord': 'gb-nir', 'northern ireland': 'gb-nir',
  'grande-bretagne': 'gb', 'royaume-uni': 'gb', 'united kingdom': 'gb', 'great britain': 'gb',
  irlande: 'ie', ireland: 'ie',
  espagne: 'es', spain: 'es',
  allemagne: 'de', germany: 'de',
  italie: 'it', italy: 'it',
  portugal: 'pt',
  belgique: 'be', belgium: 'be',
  'pays-bas': 'nl', 'pays bas': 'nl', netherlands: 'nl', holland: 'nl',
  suisse: 'ch', switzerland: 'ch',
  autriche: 'at', austria: 'at',
  luxembourg: 'lu',
  andorre: 'ad', andorra: 'ad',
  'san marino': 'sm',
  monaco: 'mc',
  liechtenstein: 'li',
  // Europe Nord
  danemark: 'dk', denmark: 'dk',
  suede: 'se', sweden: 'se',
  norvege: 'no', norway: 'no',
  finlande: 'fi', finland: 'fi',
  islande: 'is', iceland: 'is',
  estonie: 'ee', estonia: 'ee',
  lettonie: 'lv', latvia: 'lv',
  lituanie: 'lt', lithuania: 'lt',
  // Europe Centre/Est
  pologne: 'pl', poland: 'pl',
  ukraine: 'ua',
  bielorussie: 'by', bélarus: 'by', belarus: 'by',
  russie: 'ru', russia: 'ru',
  'republique tcheque': 'cz', tchequie: 'cz', czechia: 'cz', 'czech republic': 'cz',
  slovaquie: 'sk', slovakia: 'sk',
  hongrie: 'hu', hungary: 'hu',
  roumanie: 'ro', romania: 'ro',
  moldavie: 'md', moldova: 'md',
  // Europe Sud/Balkans
  croatie: 'hr', croatia: 'hr',
  slovenie: 'si', slovenia: 'si',
  serbie: 'rs', serbia: 'rs',
  'bosnie-herzegovine': 'ba', 'bosnie herzegovine': 'ba', 'bosnia': 'ba', 'bosnia and herzegovina': 'ba', 'bosnie': 'ba',
  'bosnia & herzegovina': 'ba', 'bosnia-herzegovina': 'ba',
  montenegro: 'me',
  'macedoine du nord': 'mk', 'north macedonia': 'mk', 'macedoine': 'mk', 'macedonia': 'mk',
  kosovo: 'xk',
  albanie: 'al', albania: 'al',
  grece: 'gr', greece: 'gr',
  bulgarie: 'bg', bulgaria: 'bg',
  turquie: 'tr', turkey: 'tr', turkiye: 'tr',
  chypre: 'cy', cyprus: 'cy',
  malte: 'mt', malta: 'mt',
  // Europe Est étendu
  georgie: 'ge', georgia: 'ge',
  armenie: 'am', armenia: 'am',
  azerbaidjan: 'az', azerbaijan: 'az',
  // Afrique du Nord / Moyen-Orient
  maroc: 'ma', morocco: 'ma',
  tunisie: 'tn', tunisia: 'tn',
  algerie: 'dz', algeria: 'dz',
  egypte: 'eg', egypt: 'eg',
  libye: 'ly', libya: 'ly',
  israel: 'il',
  palestine: 'ps',
  liban: 'lb', lebanon: 'lb',
  syrie: 'sy', syria: 'sy',
  irak: 'iq', iraq: 'iq',
  iran: 'ir',
  jordanie: 'jo', jordan: 'jo',
  'arabie saoudite': 'sa', 'saudi arabia': 'sa',
  'emirats arabes unis': 'ae', uae: 'ae',
  qatar: 'qa',
  koweit: 'kw', kuwait: 'kw',
  bahrein: 'bh', bahrain: 'bh',
  oman: 'om',
  yemen: 'ye',
  // Afrique Sub-Saharienne
  senegal: 'sn',
  mali: 'ml',
  'burkina faso': 'bf',
  'cap-vert': 'cv', 'cap vert': 'cv', 'cape verde': 'cv',
  guinee: 'gn', guinea: 'gn',
  'guinee-bissau': 'gw', 'guinea-bissau': 'gw',
  'guinee equatoriale': 'gq', 'equatorial guinea': 'gq',
  'sierra leone': 'sl',
  liberia: 'lr',
  "cote d'ivoire": 'ci', 'ivory coast': 'ci',
  ghana: 'gh',
  togo: 'tg',
  benin: 'bj',
  nigeria: 'ng',
  niger: 'ne',
  cameroun: 'cm', cameroon: 'cm',
  gabon: 'ga',
  'congo': 'cg', 'republique du congo': 'cg',
  'rd congo': 'cd', 'dr congo': 'cd', 'congo dr': 'cd',
  angola: 'ao',
  'afrique du sud': 'za', 'south africa': 'za',
  zimbabwe: 'zw',
  zambie: 'zm', zambia: 'zm',
  mozambique: 'mz',
  madagascar: 'mg',
  tanzanie: 'tz', tanzania: 'tz',
  kenya: 'ke',
  ouganda: 'ug', uganda: 'ug',
  rwanda: 'rw',
  ethiopie: 'et', ethiopia: 'et',
  somalie: 'so', somalia: 'so',
  soudan: 'sd', sudan: 'sd',
  mauritanie: 'mr', mauritania: 'mr',
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
  'el salvador': 'sv',
  guatemala: 'gt',
  nicaragua: 'ni',
  jamaique: 'jm', jamaica: 'jm',
  cuba: 'cu',
  haiti: 'ht',
  'trinite-et-tobago': 'tt', 'trinidad and tobago': 'tt',
  // Asie
  japon: 'jp', japan: 'jp',
  'coree du sud': 'kr', 'south korea': 'kr', 'korea republic': 'kr', coree: 'kr',
  'coree du nord': 'kp', 'north korea': 'kp',
  chine: 'cn', china: 'cn',
  'taiwan': 'tw',
  inde: 'in', india: 'in',
  pakistan: 'pk',
  bangladesh: 'bd',
  'sri lanka': 'lk',
  birmanie: 'mm', myanmar: 'mm',
  thailand: 'th', thailande: 'th',
  vietnam: 'vn',
  cambodge: 'kh', cambodia: 'kh',
  'philippines': 'ph',
  indonesie: 'id', indonesia: 'id',
  malaisie: 'my', malaysia: 'my',
  singapour: 'sg', singapore: 'sg',
  ouzbekistan: 'uz', uzbekistan: 'uz',
  kazakhstan: 'kz',
  // Océanie
  australie: 'au', australia: 'au',
  'nouvelle-zelande': 'nz', 'new zealand': 'nz',
};

/**
 * Cherche le logo personnalisé d'une équipe dans une map { nom → url }.
 * Tolère les écarts d'accent / casse / espaces (ex. « Bosnie » ↔ « Bosnie-Herzégovine »
 * n'est PAS équivalent, mais « bosnie » ↔ « Bosnie » l'est). `null` si rien ne correspond.
 */
export function logoForTeam(team: string, logos: Record<string, string> | null | undefined): string | null {
  if (!team || !logos) return null;
  if (logos[team]) return logos[team]; // correspondance exacte (cas le plus fréquent)
  const target = norm(team);
  for (const key in logos) {
    if (norm(key) === target) return logos[key];
  }
  return null;
}

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
