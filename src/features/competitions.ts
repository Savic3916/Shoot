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

/** Lower tiers, youth, college, reserve sides and friendlies: results there are too unpredictable. */
const EXCLUDED_COMPETITION =
  /ncaa|college|(^|\s)u-?\d{2}\b|youth|reserve|friendl|\bb team\b|\bii\b|academy|nacional b|primera b|primera c|serie c|serie d|3\. liga|regionalliga|oberliga|primera rfef|segunda rfef|tercera|amateur|national league (north|south)/i;

/**
 * Competitions with deep betting markets and reliable data, where bookmaker prices are sharp and
 * fixing is rare. Smaller leagues often have no prices in the feed, so their bets rest on the
 * model's own estimate alone, and SportyBet may not list those markets at all.
 */
const TRUSTED_LEAGUES = new Set([
  'eng.1', 'eng.2', 'eng.3', 'eng.4', 'esp.1', 'esp.2', 'ger.1', 'ger.2', 'ita.1', 'ita.2', 'fra.1', 'fra.2',
  'ned.1', 'ned.2', 'por.1', 'bel.1', 'sco.1', 'tur.1', 'gre.1', 'aut.1', 'den.1', 'swe.1', 'nor.1',
  'usa.1', 'mex.1', 'bra.1', 'arg.1', 'jpn.1', 'aus.1', 'ksa.1',
  'uefa.champions', 'uefa.europa', 'uefa.europa.conf', 'conmebol.libertadores', 'conmebol.sudamericana',
  'eng.fa', 'eng.league_cup', 'esp.copa_del_rey', 'ger.dfb_pokal', 'ita.coppa_italia', 'fra.coupe_de_france',
  'fifa.world', 'fifa.worldq.uefa', 'uefa.euro', 'uefa.euroq', 'uefa.nations',
]);

/** A well-covered competition (prices may not be published yet). */
export function isTrustedCompetition(fixture: Pick<FootballMatch, 'competition' | 'leagueId'>) {
  const slug = LEAGUES[fixture.leagueId]?.[2];
  return slug !== undefined && TRUSTED_LEAGUES.has(slug) && !EXCLUDED_COMPETITION.test(fixture.competition);
}

/** A well-covered competition whose match has bookmaker prices to anchor every market. */
export function isEligibleCompetition(fixture: Pick<FootballMatch, 'competition' | 'leagueId' | 'market'>) {
  return isTrustedCompetition(fixture) && fixture.market?.moneyline !== undefined;
}

export function countryOf(competition: string): string {
  for (const [pattern, label] of REGIONS) {
    if (pattern.test(competition)) return label;
  }
  return 'Other competitions';
}
