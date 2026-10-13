import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getTeamForm, predictMarkets } from '@/features/predictions';
import type { FootballMatch } from '@/features/football-data';

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
  history: FootballMatch[];
  competition: string;
  demo: boolean;
};

function FormDots({ form }: { form: string }) {
  if (!form) {
    return <Text style={styles.formEmpty}>No recent results</Text>;
  }

  return (
    <View style={styles.formRow}>
      {form.split('').map((result, index) => (
        <View
          key={`${index}-${result}`}
          style={[
            styles.formDot,
            result === 'W' ? styles.formWin : result === 'D' ? styles.formDraw : styles.formLoss,
          ]}>
          <Text style={styles.formLetter}>{result}</Text>
        </View>
      ))}
    </View>
  );
}

export function FixtureCard({ fixture, history, competition, demo }: Props) {
  const [expanded, setExpanded] = useState(false);
  const predictions = predictMarkets(fixture, history);
  const kickoff = new Date(fixture.utcDate);
  const isLive = ['IN_PLAY', 'LIVE', 'PAUSED'].includes(fixture.status);
  const isFinished = fixture.status === 'FINISHED';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.competition}>{competition.toUpperCase()}</Text>
        <Text style={[styles.status, isLive && styles.liveStatus]}>
          {isLive ? 'LIVE' : isFinished ? 'FT' : kickoff.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>

      <View style={styles.teams}>
        <View style={styles.teamColumn}>
          <Text style={styles.teamName}>{fixture.homeTeam}</Text>
          <Text style={styles.sideLabel}>HOME</Text>
        </View>
        <View style={styles.scoreColumn}>
          {isFinished || isLive ? (
            <Text style={styles.score}>
              {fixture.homeGoals ?? 0} : {fixture.awayGoals ?? 0}
            </Text>
          ) : (
            <Text style={styles.vs}>VS</Text>
          )}
        </View>
        <View style={[styles.teamColumn, styles.awayTeam]}>
          <Text style={styles.teamName}>{fixture.awayTeam}</Text>
          <Text style={styles.sideLabel}>AWAY</Text>
        </View>
      </View>

      <View style={styles.formSection}>
        <View style={styles.formTeam}>
          <Text style={styles.formLabel}>{fixture.homeTeam} form</Text>
          <FormDots form={getTeamForm(fixture.homeTeam, history, fixture.utcDate)} />
        </View>
        <View style={[styles.formTeam, styles.awayForm]}>
          <Text style={styles.formLabel}>{fixture.awayTeam} form</Text>
          <FormDots form={getTeamForm(fixture.awayTeam, history, fixture.utcDate)} />
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}>
        <Text style={styles.toggleText}>
          {expanded ? 'Hide model picks' : 'See 5 model picks'}
        </Text>
        <Text style={styles.toggleIcon}>{expanded ? '−' : '+'}</Text>
      </Pressable>

      {expanded && (
        <View style={styles.markets}>
          <View style={styles.marketHeading}>
            <Text style={styles.marketTitle}>MODEL ESTIMATES</Text>
            <Text style={styles.marketNote}>{demo ? 'SAMPLE DATA' : 'HISTORICAL MODEL'}</Text>
          </View>
          {predictions.map((prediction) => (
            <View key={prediction.key} style={styles.marketRow}>
              <View style={styles.marketLabelColumn}>
                <Text style={styles.marketLabel}>{prediction.label}</Text>
                <Text style={styles.marketSample}>{prediction.sampleSize} recent observations</Text>
              </View>
              <View style={styles.probabilityColumn}>
                <Text style={styles.probability}>{Math.round(prediction.probability * 100)}%</Text>
                <Text style={styles.probabilityCaption}>EST. CHANCE</Text>
              </View>
              <View style={styles.oddsPill}>
                <Text style={styles.odds}>x{prediction.decimalOdds.toFixed(2)}</Text>
              </View>
            </View>
          ))}
          <Text style={styles.disclaimer}>
            Estimated fair odds are 1 ÷ estimated chance—not bookmaker prices. Past results don’t
            guarantee future outcomes.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.line,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 14,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 17,
  },
  competition: { color: COLORS.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  status: { color: COLORS.green, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  liveStatus: { color: COLORS.red },
  teams: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  teamColumn: { flex: 1, gap: 5 },
  awayTeam: { alignItems: 'flex-end' },
  teamName: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
  sideLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  scoreColumn: { alignItems: 'center', minWidth: 62 },
  score: { color: COLORS.white, fontSize: 19, fontWeight: '800' },
  vs: { color: COLORS.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  formSection: {
    borderTopColor: COLORS.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  formTeam: { gap: 7 },
  awayForm: { alignItems: 'flex-end' },
  formLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '600' },
  formRow: { flexDirection: 'row', gap: 4 },
  formDot: { alignItems: 'center', borderRadius: 7, height: 19, justifyContent: 'center', width: 19 },
  formWin: { backgroundColor: '#24402A' },
  formDraw: { backgroundColor: '#353C35' },
  formLoss: { backgroundColor: '#442D2D' },
  formLetter: { color: COLORS.white, fontSize: 9, fontWeight: '800' },
  formEmpty: { color: COLORS.muted, fontSize: 10 },
  toggle: {
    alignItems: 'center',
    borderTopColor: COLORS.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  toggleText: { color: COLORS.green, fontSize: 12, fontWeight: '700' },
  toggleIcon: { color: COLORS.green, fontSize: 19, fontWeight: '500' },
  pressed: { opacity: 0.72 },
  markets: { borderTopColor: COLORS.line, borderTopWidth: 1, paddingHorizontal: 18, paddingTop: 15 },
  marketHeading: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  marketTitle: { color: COLORS.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  marketNote: { color: COLORS.amber, fontSize: 9, fontWeight: '800', letterSpacing: 0.7 },
  marketRow: {
    alignItems: 'center',
    borderBottomColor: COLORS.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 61,
  },
  marketLabelColumn: { flex: 1 },
  marketLabel: { color: COLORS.white, fontSize: 11, fontWeight: '600' },
  marketSample: { color: COLORS.muted, fontSize: 9, marginTop: 4 },
  probabilityColumn: { alignItems: 'flex-end', minWidth: 48 },
  probability: { color: COLORS.white, fontSize: 13, fontWeight: '800' },
  probabilityCaption: { color: COLORS.muted, fontSize: 7, marginTop: 3 },
  oddsPill: { alignItems: 'center', backgroundColor: '#203025', borderRadius: 9, minWidth: 56, paddingHorizontal: 8, paddingVertical: 7 },
  odds: { color: COLORS.green, fontSize: 12, fontWeight: '800' },
  disclaimer: { color: COLORS.muted, fontSize: 10, lineHeight: 15, paddingVertical: 12 },
});
