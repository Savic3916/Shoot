import { LEAGUES } from '@/constants/leagues';
import type { FootballMatch } from './football-data';

/**
 * Maps ESPN competition names (e.g. "English Premier League", "Uefa Champions") to the country or
 * region a fan would look under. Order matters: international and continental names come first
 * because they also contain words like "English" or "Spanish" in qualifiers.
 */
const REGIONS: [RegExp, string][] = [
  [/world cup|fifa/i, 'World Cup'],
  [/friendl/i, 'International friendlies'],
  [/uefa|champions league|europa|conference league|nations league|\beuro\b|euros/i, 'Europe'],
  [/conmebol|libertadores|sudamericana|copa america/i, 'South America'],
  [/concacaf|gold cup/i, 'North & Central America'],
  [/\bcaf\b|africa/i, 'Africa'],
  [/\bafc\b|asian/i, 'Asia'],
  [/english|england|efl|fa cup|carabao|league cup|national league/i, 'England'],
  [/spanish|spain|laliga|copa del rey/i, 'Spain'],
  [/german|germany|bundesliga|dfb/i, 'Germany'],
  [/italian|italy|serie [ab]\b|coppa italia/i, 'Italy'],
  [/french|france|ligue [12]|coupe de france/i, 'France'],
  [/dutch|netherlands|eredivisie|eerste divisie/i, 'Netherlands'],
  [/portug|primeira|liga portugal/i, 'Portugal'],
  [/scottish|scotland/i, 'Scotland'],
  [/belgian|belgium|pro league/i, 'Belgium'],
  [/turk|super lig/i, 'Turkey'],
  [/greek|greece|super league 1/i, 'Greece'],
  [/swiss|switzerland/i, 'Switzerland'],
  [/austrian|austria|bundesliga austria/i, 'Austria'],
  [/danish|denmark|superliga/i, 'Denmark'],
  [/norweg|eliteserien/i, 'Norway'],
  [/swedish|allsvenskan/i, 'Sweden'],
  [/russian|russia/i, 'Russia'],
  [/ukrain/i, 'Ukraine'],
  [/brazil|brasileir/i, 'Brazil'],
  [/argentin/i, 'Argentina'],
  [/mexic|liga mx/i, 'Mexico'],
  [/colombia/i, 'Colombia'],
  [/chile/i, 'Chile'],
  [/american|major league soccer|\bmls\b|usl|nwsl|u\.s\./i, 'USA'],
  [/canad/i, 'Canada'],
  [/australia|a-league/i, 'Australia'],
  [/japan|j\.?\s?league|\bj1\b/i, 'Japan'],
  [/korea|k league/i, 'South Korea'],
  [/saudi/i, 'Saudi Arabia'],
  [/chinese|china/i, 'China'],
  [/qatar/i, 'Qatar'],
  [/egypt/i, 'Egypt'],
  [/south africa/i, 'South Africa'],
  [/costa rica/i, 'Costa Rica'],
  [/hondur/i, 'Honduras'],
  [/salvador/i, 'El Salvador'],
  [/guatemal/i, 'Guatemala'],
  [/paragua/i, 'Paraguay'],
  [/venezuel/i, 'Venezuela'],
  [/peru/i, 'Peru'],
  [/bolivia/i, 'Bolivia'],
  [/ecuador/i, 'Ecuador'],
  [/urugua/i, 'Uruguay'],
  [/indian|india/i, 'India'],
  [/polish|poland|ekstraklasa/i, 'Poland'],
  [/czech/i, 'Czech Republic'],
  [/hungar/i, 'Hungary'],
  [/romanian|romania/i, 'Romania'],
  [/croatia/i, 'Croatia'],
  [/serbia/i, 'Serbia'],
  [/israel/i, 'Israel'],
  [/irish|ireland/i, 'Ireland'],
  [/welsh|wales/i, 'Wales'],
  [/finland|finnish|veikkausliiga/i, 'Finland'],
  [/iran/i, 'Iran'],
  [/emirat|uae|arabian gulf/i, 'UAE'],
  [/thai/i, 'Thailand'],
  [/indonesia/i, 'Indonesia'],
];

const SLUG_REGIONS: Record<string, string> = {
  uefa: 'Europe',
  fifa: 'World Cup',
  conmebol: 'South America',
  concacaf: 'North & Central America',
  caf: 'Africa',
  afc: 'Asia',
  usa: 'USA',
  eng: 'England',
  esp: 'Spain',
  ger: 'Germany',
  ita: 'Italy',
  fra: 'France',
};

/** League name and country for an ESPN league id; falls back to the name the feed gave. */
export function leagueMeta(leagueId: string, fallbackName: string): { name: string; country: string } {
  const entry = LEAGUES[leagueId];
  if (!entry) return { name: fallbackName, country: countryOf(fallbackName) };
  const [name, country, slug] = entry;
  const prefix = slug.split('.')[0];
  const region = /world cup|fifa/i.test(name) ? 'World Cup' : SLUG_REGIONS[prefix];
  const continental = ['uefa', 'fifa', 'conmebol', 'concacaf', 'caf', 'afc'].includes(prefix);
  return { name, country: continental ? (region ?? country) : (country || region || countryOf(name)) };
}

/**
 * Countries and regions the app picks from: the major leagues, the continental and international
 * tournaments (Europe, World Cup, Nations League, Copa America, Africa Cup) and well-covered
 * leagues elsewhere. Obscure leagues have thin data, no bookmaker markets and unreliable form.
 */
export const COVERED_COUNTRIES = [
  'England', 'Spain', 'Germany', 'Italy', 'France', 'Netherlands', 'Portugal', 'Scotland',
  'Belgium', 'Turkey', 'Europe', 'World Cup', 'South America', 'Africa', 'Brazil', 'Argentina',
  'Mexico', 'USA', 'Saudi Arabia', 'Japan', 'Australia',
];

const COVERED = new Set(COVERED_COUNTRIES);

/** Lower tiers, youth, college, reserve sides and friendlies: results there are too unpredictable. */
const EXCLUDED_COMPETITION =
  /ncaa|college|(^|\s)u-?\d{2}\b|youth|reserve|friendl|\bb team\b|\bii\b|academy|nacional b|primera b|primera c|serie c|serie d|3\. liga|regionalliga|oberliga|primera rfef|segunda rfef|tercera|amateur|national league (north|south)/i;

export function isMajorCompetition(fixture: Pick<FootballMatch, 'country' | 'competition'>) {
  return COVERED.has(fixture.country) && !EXCLUDED_COMPETITION.test(fixture.competition);
}

export function countryOf(competition: string): string {
  for (const [pattern, label] of REGIONS) {
    if (pattern.test(competition)) return label;
  }
  return 'Other competitions';
}
