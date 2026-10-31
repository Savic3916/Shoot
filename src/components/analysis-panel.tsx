import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { PALETTE } from '@/constants/palette';
import type { Factor, H2HGame, NewsItem, PickInsight, RecentGame, TeamInsight } from '@/features/insight';

const { homeRed, awayBlue } = PALETTE;
const TABS = ['Summary', 'Form', 'Head to head', 'Table', 'News'] as const;
type Tab = (typeof TABS)[number];

const RESULT_COLOR = { W: PALETTE.positive, D: PALETTE.faint, L: PALETTE.negative } as const;

function shortDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function TeamLegend({ home, away }: { home: string; away: string }) {
  return (
    <View style={styles.legend}>
      <View style={styles.legendItem}>
        <View style={[styles.legendLine, { backgroundColor: homeRed }]} />
        <Text style={styles.legendText} numberOfLines={1}>{home}</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendLine, { backgroundColor: awayBlue }]} />
        <Text style={styles.legendText} numberOfLines={1}>{away}</Text>
      </View>
    </View>
  );
}

/** Two-team comparison: red share on the left, blue on the right. */
function CompareBar({ label, home, away, format }: { label: string; home: number; away: number; format: (v: number) => string }) {
  const total = home + away;
  const homeShare = total > 0 ? home / total : 0.5;
  return (
    <View style={styles.compare}>
      <View style={styles.compareHead}>
        <Text style={[styles.compareValue, { color: homeRed }]}>{format(home)}</Text>
        <Text style={styles.compareLabel}>{label}</Text>
        <Text style={[styles.compareValue, { color: awayBlue }]}>{format(away)}</Text>
      </View>
      <View style={styles.compareTrack}>
        <View style={{ backgroundColor: homeRed, flex: Math.max(homeShare, 0.04) }} />
        <View style={styles.compareGap} />
        <View style={{ backgroundColor: awayBlue, flex: Math.max(1 - homeShare, 0.04) }} />
      </View>
    </View>
  );
}

function average(games: RecentGame[], pick: (game: RecentGame) => number) {
  return games.length ? games.reduce((sum, game) => sum + pick(game), 0) / games.length : 0;
}

function points(games: RecentGame[]) {
  return games.reduce((sum, game) => sum + (game.result === 'W' ? 3 : game.result === 'D' ? 1 : 0), 0);
}

function LineChart({
  title,
  home,
  away,
  width,
}: {
  title: string;
  home: number[];
  away: number[];
  width: number;
}) {
  const height = 130;
  const pad = { bottom: 22, left: 24, right: 10, top: 10 };
  const maxValue = Math.max(3, ...home, ...away);
  const count = Math.max(home.length, away.length, 2);
  const x = (index: number) => pad.left + (index * (width - pad.left - pad.right)) / (count - 1);
  const y = (value: number) => pad.top + (1 - value / maxValue) * (height - pad.top - pad.bottom);
  const ticks = Array.from({ length: maxValue + 1 }, (_, value) => value);

  const series = (values: number[], color: string) => (
    <>
      <Polyline
        points={values.map((value, index) => `${x(index)},${y(value)}`).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {values.map((value, index) => (
        <Circle key={index} cx={x(index)} cy={y(value)} r={4} fill="#FFFFFF" stroke={color} strokeWidth={2.5} />
      ))}
    </>
  );

  return (
    <View style={styles.chart}>
      <Text style={styles.chartTitle}>{title}</Text>
      <Svg width={width} height={height}>
        {ticks.map((tick) => (
          <Fragment key={tick}>
            <Line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke={PALETTE.hairline} strokeWidth={1} />
            <SvgText x={pad.left - 8} y={y(tick) + 4} fontSize={10} fill={PALETTE.faint} textAnchor="end">
              {tick}
            </SvgText>
          </Fragment>
        ))}
        {Array.from({ length: count }, (_, index) => (
          <SvgText key={index} x={x(index)} y={height - 6} fontSize={10} fill={PALETTE.faint} textAnchor="middle">
            {index === count - 1 ? 'Latest' : `G${index + 1}`}
          </SvgText>
        ))}
        {series(home, homeRed)}
        {series(away, awayBlue)}
      </Svg>
    </View>
  );
}

function GameList({ team, games, color }: { team: string; games: RecentGame[]; color: string }) {
  return (
    <View style={styles.block}>
      <View style={styles.teamHead}>
        <View style={[styles.teamDot, { backgroundColor: color }]} />
        <Text style={styles.teamName}>{team}</Text>
      </View>
      {games.length ? (
        [...games].reverse().map((game) => (
          <View key={game.date + game.opponent} style={styles.gameRow}>
            <View style={[styles.chip, { backgroundColor: RESULT_COLOR[game.result] }]}>
              <Text style={styles.chipText}>{game.result}</Text>
            </View>
            <Text style={styles.gameText} numberOfLines={1}>
              {game.venue === 'H' ? 'vs' : 'at'} {game.opponent}
            </Text>
            <Text style={styles.gameScore}>{game.goalsFor}–{game.goalsAgainst}</Text>
            <Text style={styles.gameDate}>{shortDate(game.date)}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.empty}>No recent games available.</Text>
      )}
    </View>
  );
}

function Summary({ insight, pickReasons }: { insight: PickInsight; pickReasons: string[] }) {
  const h = insight.home.games;
  const a = insight.away.games;
  const dot = (factor: Factor) =>
    factor.favours === 'home' ? homeRed : factor.favours === 'away' ? awayBlue : PALETTE.faint;
  return (
    <View style={styles.gap}>
      <Text style={styles.verdict}>{insight.verdict}</Text>
      <Text style={styles.heading}>Why this bet</Text>
      {(insight.betReasons.length ? insight.betReasons : pickReasons).map((reason) => (
        <View key={reason} style={styles.bulletRow}>
          <View style={styles.bullet} />
          <Text style={styles.body}>{reason}</Text>
        </View>
      ))}

      {h.length >= 3 && a.length >= 3 && (
        <>
          <Text style={styles.heading}>Side by side</Text>
          <TeamLegend home={insight.home.name} away={insight.away.name} />
          <CompareBar label="Points, last 5" home={points(h)} away={points(a)} format={(v) => String(v)} />
          <CompareBar label="Goals scored per game" home={average(h, (g) => g.goalsFor)} away={average(a, (g) => g.goalsFor)} format={(v) => v.toFixed(1)} />
          <CompareBar label="Goals conceded per game" home={average(h, (g) => g.goalsAgainst)} away={average(a, (g) => g.goalsAgainst)} format={(v) => v.toFixed(1)} />
        </>
      )}

      <Text style={styles.heading}>What we looked at</Text>
      {insight.factors.map((factor) => (
        <View key={factor.title} style={styles.factor}>
          <View style={[styles.factorBar, { backgroundColor: dot(factor) }]} />
          <View style={styles.factorText}>
            <Text style={styles.factorTitle}>{factor.title}</Text>
            <Text style={styles.body}>{factor.text}</Text>
          </View>
        </View>
      ))}
      <Text style={styles.key}>
        <Text style={{ color: homeRed }}>■</Text> favours home  <Text style={{ color: awayBlue }}>■</Text> favours away  <Text style={{ color: PALETTE.faint }}>■</Text> neutral
      </Text>
    </View>
  );
}

function FormTab({ insight, width }: { insight: PickInsight; width: number }) {
  const h = insight.home.games;
  const a = insight.away.games;
  return (
    <View style={styles.gap}>
      <TeamLegend home={insight.home.name} away={insight.away.name} />
      {h.length >= 2 && a.length >= 2 ? (
        <>
          <LineChart title="Goals scored, last 5 games" home={h.map((g) => g.goalsFor)} away={a.map((g) => g.goalsFor)} width={width} />
          <LineChart title="Goals conceded, last 5 games" home={h.map((g) => g.goalsAgainst)} away={a.map((g) => g.goalsAgainst)} width={width} />
        </>
      ) : (
        <Text style={styles.empty}>Not enough recent games to draw a trend.</Text>
      )}
      <GameList team={insight.home.name} games={h} color={homeRed} />
      <GameList team={insight.away.name} games={a} color={awayBlue} />
    </View>
  );
}

function H2HTab({ insight }: { insight: PickInsight }) {
  const games: H2HGame[] = insight.h2h;
  if (!games.length) return <Text style={styles.empty}>No recent meetings found between these teams.</Text>;
  const rows = games.map((game) => {
    const homeIsHostHere = game.home === insight.home.name;
    const ours = homeIsHostHere ? game.homeGoals : game.awayGoals;
    const theirs = homeIsHostHere ? game.awayGoals : game.homeGoals;
    return { game, winner: ours > theirs ? 'home' : ours < theirs ? 'away' : 'draw' };
  });
  const homeWins = rows.filter((row) => row.winner === 'home').length;
  const awayWins = rows.filter((row) => row.winner === 'away').length;
  const draws = rows.length - homeWins - awayWins;
  const goals = games.reduce((sum, game) => sum + game.homeGoals + game.awayGoals, 0);
  const btts = games.filter((game) => game.homeGoals > 0 && game.awayGoals > 0).length;
  return (
    <View style={styles.gap}>
      <TeamLegend home={insight.home.name} away={insight.away.name} />
      <View style={styles.h2hBar}>
        {homeWins > 0 && <View style={{ backgroundColor: homeRed, flex: homeWins }} />}
        {draws > 0 && <View style={{ backgroundColor: PALETTE.hairline, flex: draws }} />}
        {awayWins > 0 && <View style={{ backgroundColor: awayBlue, flex: awayWins }} />}
      </View>
      <View style={styles.h2hCounts}>
        <Text style={[styles.h2hCount, { color: homeRed }]}>{homeWins} wins</Text>
        <Text style={[styles.h2hCount, { color: PALETTE.muted }]}>{draws} draws</Text>
        <Text style={[styles.h2hCount, { color: awayBlue }]}>{awayWins} wins</Text>
      </View>
      <Text style={styles.body}>
        Over the last {games.length} meetings: {(goals / games.length).toFixed(1)} goals per game, and both teams scored in {btts} of them.
      </Text>
      {rows.map(({ game, winner }) => (
        <View key={game.date + game.home} style={styles.h2hRow}>
          <Text style={styles.gameDate}>{shortDate(game.date)}</Text>
          <Text
            style={[styles.h2hTeam, { textAlign: 'right' }, game.home === insight.home.name ? { color: homeRed } : { color: awayBlue }]}
            numberOfLines={1}>
            {game.home}
          </Text>
          <View style={[styles.scoreBox, winner === 'draw' && { backgroundColor: PALETTE.surface }]}>
            <Text style={styles.scoreText}>{game.homeGoals} – {game.awayGoals}</Text>
          </View>
          <Text
            style={[styles.h2hTeam, game.away === insight.home.name ? { color: homeRed } : { color: awayBlue }]}
            numberOfLines={1}>
            {game.away}
          </Text>
        </View>
      ))}
    </View>
  );
}

function TableTab({ insight }: { insight: PickInsight }) {
  const rows: [TeamInsight, string][] = [[insight.home, homeRed], [insight.away, awayBlue]];
  if (!rows.some(([team]) => team.standing)) {
    return <Text style={styles.empty}>No league table is available for this competition.</Text>;
  }
  return (
    <View style={styles.gap}>
      <View style={styles.tableHead}>
        <Text style={[styles.th, { flex: 1 }]}>Team</Text>
        {['Pos', 'Pts', 'GD'].map((label) => (
          <Text key={label} style={styles.th}>{label}</Text>
        ))}
      </View>
      {rows.map(([team, color]) => (
        <View key={team.id} style={[styles.tableRow, { borderLeftColor: color }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.teamName} numberOfLines={1}>{team.name}</Text>
            {team.standing?.record ? (
              <Text style={styles.gameDate}>W-D-L {team.standing.record} · {team.standing.played} played</Text>
            ) : null}
          </View>
          <Text style={styles.td}>{team.standing?.rank ?? '–'}</Text>
          <Text style={styles.td}>{team.standing?.points ?? '–'}</Text>
          <Text style={styles.td}>{team.standing ? (team.standing.goalDiff > 0 ? `+${team.standing.goalDiff}` : team.standing.goalDiff) : '–'}</Text>
        </View>
      ))}
    </View>
  );
}

const KIND_LABEL: Record<NewsItem['kind'], string> = {
  availability: 'PLAYER STATUS',
  club: 'CLUB ISSUE',
  general: 'NEWS',
};

function NewsBlock({ team, color }: { team: TeamInsight; color: string }) {
  return (
    <View style={styles.block}>
      <View style={styles.teamHead}>
        <View style={[styles.teamDot, { backgroundColor: color }]} />
        <Text style={styles.teamName}>{team.name}</Text>
      </View>
      {team.keyPlayers.map((player) => (
        <Text key={player.name} style={styles.body}>
          <Text style={styles.strong}>{player.name}</Text> · {player.note}
        </Text>
      ))}
      {team.news.length ? (
        team.news.map((item) => (
          <View key={item.headline} style={styles.newsRow}>
            <Text style={[styles.newsTag, item.kind === 'availability' && styles.tagAlert, item.kind === 'club' && styles.tagClub]}>
              {KIND_LABEL[item.kind]}
            </Text>
            <Text style={styles.body}>{item.headline}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.empty}>No injury, suspension or club-issue headlines in the last three weeks.</Text>
      )}
    </View>
  );
}

function NewsTab({ insight }: { insight: PickInsight }) {
  return (
    <View style={styles.gap}>
      <NewsBlock team={insight.home} color={homeRed} />
      <NewsBlock team={insight.away} color={awayBlue} />
      <Text style={styles.note}>
        Official injury lists and confirmed line-ups are not in the free data. Player status above comes from
        news headlines about fitness, suspensions and club issues, so check team news close to kick-off.
      </Text>
    </View>
  );
}

export function AnalysisPanel({ insight, pickReasons }: { insight: PickInsight; pickReasons: string[] }) {
  const [tab, setTab] = useState<Tab>('Summary');
  const [width, setWidth] = useState(280);
  return (
    <View onLayout={(event) => setWidth(Math.max(220, Math.floor(event.nativeEvent.layout.width)))}>
      <View style={styles.tabs}>
        {TABS.map((name) => (
          <Pressable
            key={name}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === name }}
            onPress={() => setTab(name)}
            style={[styles.tab, tab === name && styles.tabSelected]}>
            <Text style={[styles.tabText, tab === name && styles.tabTextSelected]}>{name}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'Summary' && <Summary insight={insight} pickReasons={pickReasons} />}
      {tab === 'Form' && <FormTab insight={insight} width={width} />}
      {tab === 'Head to head' && <H2HTab insight={insight} />}
      {tab === 'Table' && <TableTab insight={insight} />}
      {tab === 'News' && <NewsTab insight={insight} />}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { backgroundColor: PALETTE.surface, borderRadius: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginBottom: 14, padding: 3 },
  tab: { alignItems: 'center', borderRadius: 9, flexGrow: 1, paddingHorizontal: 8, paddingVertical: 8 },
  tabSelected: { backgroundColor: PALETTE.background, shadowColor: '#14212B', shadowOffset: { height: 1, width: 0 }, shadowOpacity: 0.08, shadowRadius: 3 },
  tabText: { color: PALETTE.muted, fontSize: 12, fontWeight: '600' },
  tabTextSelected: { color: PALETTE.ink },
  gap: { gap: 12 },
  verdict: { color: PALETTE.ink, fontSize: 15, fontWeight: '600', lineHeight: 22 },
  heading: { color: PALETTE.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 6, textTransform: 'uppercase' },
  body: { color: PALETTE.muted, flex: 1, fontSize: 14, lineHeight: 20 },
  strong: { color: PALETTE.ink, fontWeight: '700' },
  bulletRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  bullet: { backgroundColor: PALETTE.primary, borderRadius: 3, height: 6, marginTop: 7, width: 6 },
  legend: { flexDirection: 'row', gap: 16 },
  legendItem: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 8 },
  legendLine: { borderRadius: 2, height: 4, width: 18 },
  legendText: { color: PALETTE.ink, flex: 1, fontSize: 12, fontWeight: '600' },
  compare: { gap: 6 },
  compareHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  compareLabel: { color: PALETTE.muted, fontSize: 12 },
  compareValue: { fontSize: 14, fontWeight: '700', minWidth: 34 },
  compareTrack: { borderRadius: 4, flexDirection: 'row', height: 8, overflow: 'hidden' },
  compareGap: { backgroundColor: PALETTE.background, width: 3 },
  factor: { flexDirection: 'row', gap: 10 },
  factorBar: { borderRadius: 2, width: 4 },
  factorText: { flex: 1, gap: 2 },
  factorTitle: { color: PALETTE.ink, fontSize: 13, fontWeight: '700' },
  key: { color: PALETTE.faint, fontSize: 11 },
  chart: { gap: 4 },
  chartTitle: { color: PALETTE.ink, fontSize: 13, fontWeight: '700' },
  block: { backgroundColor: PALETTE.surface, borderRadius: 14, gap: 8, padding: 12 },
  teamHead: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  teamDot: { borderRadius: 5, height: 10, width: 10 },
  teamName: { color: PALETTE.ink, fontSize: 14, fontWeight: '700' },
  gameRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  chip: { alignItems: 'center', borderRadius: 6, height: 22, justifyContent: 'center', width: 22 },
  chipText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  gameText: { color: PALETTE.ink, flex: 1, fontSize: 13 },
  gameScore: { color: PALETTE.ink, fontSize: 13, fontWeight: '700' },
  gameDate: { color: PALETTE.faint, fontSize: 11 },
  empty: { color: PALETTE.muted, fontSize: 13, lineHeight: 19 },
  h2hBar: { borderRadius: 5, flexDirection: 'row', gap: 2, height: 10, overflow: 'hidden' },
  h2hCounts: { flexDirection: 'row', justifyContent: 'space-between' },
  h2hCount: { fontSize: 13, fontWeight: '700' },
  h2hRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  h2hTeam: { flex: 1, fontSize: 12, fontWeight: '600' },
  scoreBox: { alignItems: 'center', backgroundColor: PALETTE.primarySoft, borderRadius: 8, minWidth: 54, paddingVertical: 4 },
  scoreText: { color: PALETTE.ink, fontSize: 13, fontWeight: '800' },
  tableHead: { alignItems: 'center', flexDirection: 'row' },
  th: { color: PALETTE.faint, fontSize: 11, fontWeight: '700', textAlign: 'center', width: 44 },
  tableRow: { alignItems: 'center', backgroundColor: PALETTE.surface, borderLeftWidth: 4, borderRadius: 10, flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10 },
  td: { color: PALETTE.ink, fontSize: 14, fontWeight: '700', textAlign: 'center', width: 44 },
  newsRow: { gap: 3 },
  newsTag: { color: PALETTE.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  tagAlert: { color: PALETTE.negative },
  tagClub: { color: PALETTE.caution },
  note: { color: PALETTE.faint, fontSize: 12, lineHeight: 18 },
});
