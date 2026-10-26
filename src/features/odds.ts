export type ThreeWay = { home: number; draw: number; away: number };

export type MarketOdds = {
  provider: string;
  /** Current decimal prices. */
  moneyline?: ThreeWay;
  openMoneyline?: ThreeWay;
  total?: { line: number; over: number; under: number; openOver?: number; openUnder?: number };
  /** Handicap line is expressed from the home team's side. */
  spread?: { line: number; home: number; away: number; openLine?: number };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** "+125" / "-165" / 125 -> decimal odds. */
export function americanToDecimal(value: unknown): number | undefined {
  const american = typeof value === 'number' ? value : Number(String(value ?? '').replace('+', ''));
  if (!Number.isFinite(american) || american === 0) return undefined;
  return american > 0 ? 1 + american / 100 : 1 + 100 / -american;
}

/** "o2.5" / "-0.5" / "+1" -> number. */
function parseLine(value: unknown): number | undefined {
  const line = Number(String(value ?? '').replace(/^[ou]/i, '').replace('+', ''));
  return Number.isFinite(line) ? line : undefined;
}

function side(node: unknown, which: 'open' | 'close') {
  const entry = isRecord(node) && isRecord(node[which]) ? node[which] : undefined;
  return {
    odds: americanToDecimal(entry?.odds),
    line: parseLine(entry?.line),
  };
}

function threeWay(moneyline: Record<string, unknown>, which: 'open' | 'close'): ThreeWay | undefined {
  const home = side(moneyline.home, which).odds;
  const draw = side(moneyline.draw, which).odds;
  const away = side(moneyline.away, which).odds;
  return home && draw && away ? { home, draw, away } : undefined;
}

/** Parses the DraftKings block ESPN attaches to scoreboard events. */
export function parseMarketOdds(raw: unknown): MarketOdds | undefined {
  if (!isRecord(raw)) return undefined;
  const provider = isRecord(raw.provider) && typeof raw.provider.displayName === 'string'
    ? raw.provider.displayName
    : 'Bookmaker';
  const result: MarketOdds = { provider };

  if (isRecord(raw.moneyline)) {
    result.moneyline = threeWay(raw.moneyline, 'close');
    result.openMoneyline = threeWay(raw.moneyline, 'open');
  }
  if (isRecord(raw.total)) {
    const over = side(raw.total.over, 'close');
    const under = side(raw.total.under, 'close');
    const openOver = side(raw.total.over, 'open');
    const openUnder = side(raw.total.under, 'open');
    const line = over.line ?? (typeof raw.overUnder === 'number' ? raw.overUnder : undefined);
    if (line !== undefined && over.odds && under.odds) {
      result.total = {
        line,
        over: over.odds,
        under: under.odds,
        openOver: openOver.odds,
        openUnder: openUnder.odds,
      };
    }
  }
  if (isRecord(raw.pointSpread)) {
    const home = side(raw.pointSpread.home, 'close');
    const away = side(raw.pointSpread.away, 'close');
    const open = side(raw.pointSpread.home, 'open');
    if (home.line !== undefined && home.odds && away.odds) {
      result.spread = { line: home.line, home: home.odds, away: away.odds, openLine: open.line };
    }
  }
  return result.moneyline || result.total || result.spread ? result : undefined;
}

/**
 * Removes the bookmaker margin using the power method, which also corrects part of the
 * favourite-longshot bias that proportional scaling leaves in.
 */
export function devig(decimalOdds: number[]): number[] {
  const raw = decimalOdds.map((odds) => 1 / odds);
  const total = raw.reduce((sum, value) => sum + value, 0);
  if (total <= 1) return raw.map((value) => value / total);
  let low = 1;
  let high = 12;
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    const sum = raw.reduce((acc, value) => acc + value ** mid, 0);
    if (sum > 1) low = mid;
    else high = mid;
  }
  const power = (low + high) / 2;
  const fair = raw.map((value) => value ** power);
  const norm = fair.reduce((sum, value) => sum + value, 0);
  return fair.map((value) => value / norm);
}

export function overround(decimalOdds: number[]) {
  return decimalOdds.reduce((sum, odds) => sum + 1 / odds, 0) - 1;
}
