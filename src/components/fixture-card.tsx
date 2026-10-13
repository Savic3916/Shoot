import { StyleSheet, Text, View } from 'react-native';

import type { FootballMatch, PlayerSummary, TeamResult } from '@/features/football-data';

const COLORS = {
  card: '#111D17',
  line: '#29362F',
  muted: '#829087',
  white: '#F4F7F4',
  green: '#B8F36B',
  red: '#F08378',
  amber: '#F2C875',
};

type Props = {
  fixture: FootballMatch;
  homeForm: TeamResult[];
  awayForm: TeamResult[];
  homePlayers: PlayerSummary[];
  awayPlayers: PlayerSummary[];
};

function Form({ results }: { results: TeamResult[] }) {
  if (!results.length) {
    return <Text style={styles.formUnavailable}>Recent scores unavailable</Text>;
  }
  return (
    <View style={styles.formRow}>
      {results.slice(0, 5).reverse().map((result, index) => {
        const outcome =
          result.goalsFor > result.goalsAgainst
            ? 'W'
            : result.goalsFor === result.goalsAgainst
              ? 'D'
              : 'L';
        return (
          <View
            key={`${result.utcDate}-${index}`}
            style={[
              styles.formDot,
              outcome === 'W' ? styles.formWin : outcome === 'D' ? styles.formDraw : styles.formLoss,
            ]}>
            <Text style={styles.formLetter}>{outcome}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function FixtureCard({ fixture, homeForm, awayForm, homePlayers, awayPlayers }: Props) {
  const kickoff = new Date(fixture.utcDate);
  const live = ['IN PLAY', 'LIVE', 'PAUSED', 'INPLAY'].includes(fixture.status.toUpperCase());
  const finished = fixture.status.toUpperCase() === 'FINISHED';
  const score = finished || live
    ? `${fixture.homeGoals ?? '–'} : ${fixture.awayGoals ?? '–'}`
    : kickoff.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const doubleChance = fixture.odds
    .filter((odd) => odd.market.toLowerCase().includes('double chance'))
    .slice(0, 4);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.competition} numberOfLines={1}>{fixture.competition.toUpperCase()}</Text>
        <Text style={[styles.status, live && styles.live]}>{live ? 'LIVE' : finished ? 'FT' : score}</Text>
      </View>
      <View style={styles.teams}>
        <View style={styles.teamColumn}>
          <Text style={styles.teamName} numberOfLines={2}>{fixture.homeTeam}</Text>
          <Text style={styles.sideLabel}>HOME</Text>
        </View>
        <Text style={styles.score}>{finished || live ? score : 'VS'}</Text>
        <View style={[styles.teamColumn, styles.awayTeam]}>
          <Text style={styles.teamName} numberOfLines={2}>{fixture.awayTeam}</Text>
          <Text style={styles.sideLabel}>AWAY</Text>
        </View>
      </View>
      <View style={styles.formSection}>
        <View style={styles.formTeam}>
          <Text style={styles.formLabel}>{fixture.homeTeam} · last 5</Text>
          <Form results={homeForm} />
        </View>
        {(homePlayers.length > 0 || awayPlayers.length > 0) && (
          <View style={styles.playerStats}>
            <Text style={styles.playerStatsTitle}>PLAYER FORM · LAST 8 COMPLETED MATCHES</Text>
            {[...homePlayers.slice(0, 3), ...awayPlayers.slice(0, 3)].map((player) => (
              <Text key={player.id} style={styles.playerStat} numberOfLines={1}>
                {player.name} · {player.goals}G {player.assists}A · {player.minutes} min
                {player.averageRating === null ? '' : ` · ${player.averageRating.toFixed(1)} rating`}
              </Text>
            ))}
          </View>
        )}
        <View style={[styles.formTeam, styles.awayForm]}>
          <Text style={styles.formLabel}>{fixture.awayTeam} · last 5</Text>
          <Form results={awayForm} />
        </View>
      </View>
      {doubleChance.length > 0 && (
        <View style={styles.oddsSection}>
          <Text style={styles.oddsTitle}>DOUBLE-CHANCE MARKET · LIVE FEED</Text>
          {doubleChance.map((odd, index) => (
            <View key={`${odd.marketId}-${odd.selection}-${odd.bookmaker}-${index}`} style={styles.oddRow}>
              <Text style={styles.oddLabel}>{odd.selection}</Text>
              <Text style={styles.bookmaker}>{odd.bookmaker}</Text>
              <Text style={styles.oddPrice}>{odd.decimal.toFixed(2)}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={styles.availability}>
        <Text style={styles.availabilityText}>
          {fixture.unavailable.length
            ? `${fixture.unavailable.length} reported unavailable`
            : 'No unavailability report'}
        </Text>
        <Text style={[styles.lineupState, fixture.lineupsPublished && styles.lineupConfirmed]}>
          {fixture.lineupsPublished ? 'LINEUPS POSTED' : 'LINEUPS PENDING'}
        </Text>
      </View>
      {fixture.unavailable.length > 0 && (
        <View style={styles.absences}>
          {fixture.unavailable.slice(0, 4).map((player, index) => (
            <Text key={`${player.name}-${index}`} style={styles.absenceText} numberOfLines={1}>
              {player.name} · {player.reason}
            </Text>
          ))}
          {fixture.unavailable.length > 4 && (
            <Text style={styles.absenceText}>+{fixture.unavailable.length - 4} more</Text>
          )}
          {fixture.expectedPlayers.length > 0 && !fixture.lineupsPublished && (
            <View style={styles.absences}>
              <Text style={styles.expectedTitle}>EXPECTED XI · SUBJECT TO CHANGE</Text>
              <Text style={styles.absenceText} numberOfLines={2}>
                {fixture.expectedPlayers.slice(0, 11).join(' · ')}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.card, borderColor: COLORS.line, borderRadius: 20, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  cardHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 15 },
  competition: { color: COLORS.muted, flex: 1, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  status: { color: COLORS.green, fontSize: 10, fontWeight: '800' },
  live: { color: COLORS.red },
  teams: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 17 },
  teamColumn: { flex: 1, gap: 5 },
  awayTeam: { alignItems: 'flex-end' },
  teamName: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  sideLabel: { color: COLORS.muted, fontSize: 8, fontWeight: '700', letterSpacing: 1 },
  score: { color: COLORS.white, fontSize: 14, fontWeight: '800', minWidth: 54, textAlign: 'center' },
  formSection: { borderTopColor: COLORS.line, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 11 },
  formTeam: { gap: 6 },
  awayForm: { alignItems: 'flex-end' },
  formLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '600' },
  formRow: { flexDirection: 'row', gap: 4 },
  formDot: { alignItems: 'center', borderRadius: 6, height: 18, justifyContent: 'center', width: 18 },
  formWin: { backgroundColor: '#24402A' },
  formDraw: { backgroundColor: '#353C35' },
  formLoss: { backgroundColor: '#442D2D' },
  formLetter: { color: COLORS.white, fontSize: 8, fontWeight: '800' },
  formUnavailable: { color: COLORS.amber, fontSize: 9 },
  playerStats: { backgroundColor: '#0D1711', borderTopColor: COLORS.line, borderTopWidth: 1, gap: 4, paddingHorizontal: 16, paddingVertical: 10 },
  playerStatsTitle: { color: COLORS.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.5, marginBottom: 2 },
  playerStat: { color: '#C1C9C2', fontSize: 9 },
  oddsSection: { borderTopColor: COLORS.line, borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 11 },
  oddsTitle: { color: COLORS.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.8, marginBottom: 6 },
  oddRow: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingVertical: 4 },
  oddLabel: { color: COLORS.white, flex: 1, fontSize: 10, fontWeight: '600' },
  bookmaker: { color: COLORS.muted, fontSize: 9 },
  oddPrice: { color: COLORS.green, fontSize: 11, fontWeight: '800', minWidth: 38, textAlign: 'right' },
  availability: { alignItems: 'center', borderTopColor: COLORS.line, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  availabilityText: { color: COLORS.muted, flex: 1, fontSize: 9 },
  lineupState: { color: COLORS.amber, fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  lineupConfirmed: { color: COLORS.green },
  absences: { backgroundColor: '#1C211B', gap: 4, paddingHorizontal: 16, paddingVertical: 10 },
  absenceText: { color: '#C1B79E', fontSize: 9 },
  expectedTitle: { color: COLORS.amber, fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
});
