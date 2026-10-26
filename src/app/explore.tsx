import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  DEFAULT_LEARNED,
  fitLearned,
  loadPicks,
  loadRecords,
  trackRecord,
  type Learned,
  type LoggedPick,
  type TrackRecord,
} from '@/features/learning';
import { formatPercent } from '@/features/markets';

const COLORS = {
  background: '#FFFFFF',
  card: '#F5F6F8',
  border: '#E4E6EA',
  muted: '#6B7280',
  text: '#141518',
  accent: '#E41827',
  amber: '#B45309',
  green: '#1F8A4C',
};

type State = { learned: Learned; track: TrackRecord; picks: LoggedPick[] };

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {note ? <Text style={styles.statNote}>{note}</Text> : null}
    </View>
  );
}

export default function InsightsScreen() {
  const [state, setState] = useState<State>();

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadRecords(), loadPicks()]).then(([records, picks]) => {
      if (cancelled) return;
      setState({
        learned: records.length ? fitLearned(records) : DEFAULT_LEARNED,
        track: trackRecord(records, picks),
        picks: picks.slice().sort((a, b) => b.utcDate.localeCompare(a.utcDate)),
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const learned = state?.learned ?? DEFAULT_LEARNED;
  const track = state?.track;
  const graded = track?.matchesGraded ?? 0;
  const skill = track && track.brierBaseline > 0 ? 1 - track.brier / track.brierBaseline : undefined;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>HOW THE ANALYSIS LEARNS</Text>
        <Text style={styles.title}>Every prediction{'\n'}gets graded.</Text>
        <Text style={styles.intro}>
          The app saves what it predicted for each match. When results come in, it scores itself
          and adjusts how much it trusts bookmaker prices versus team ratings, and how confident
          to be. Nothing is sent anywhere — the learning lives on this device.
        </Text>

        <View style={styles.stats}>
          <Stat label="MATCHES GRADED" value={String(graded)} note="grows every day you open the app" />
          <Stat
            label="TRUST IN BOOKMAKER"
            value={formatPercent(learned.weightMarket)}
            note={graded < 30 ? 'default prior until ~30 graded' : 'learned from results'}
          />
        </View>
        <View style={styles.stats}>
          <Stat label="RESULT CONFIDENCE" value={`×${learned.scale.result.toFixed(2)}`} note="<1 = was overconfident" />
          <Stat label="GOALS CONFIDENCE" value={`×${learned.scale.goals.toFixed(2)}`} note="over/under markets" />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pick track record</Text>
          {track && track.picksSettled > 0 ? (
            <Text style={styles.cardBody}>
              {track.picksWon} of {track.picksSettled} settled picks won (
              {formatPercent(track.picksWon / track.picksSettled)}). The model expected{' '}
              {formatPercent(track.picksAverageProbability)} on average. Small samples are noisy —
              judge it over dozens of picks, not a few days.
            </Text>
          ) : (
            <Text style={styles.cardBody}>
              No picks have been graded yet. Open the app daily; yesterday’s picks are settled
              automatically from published results.
            </Text>
          )}
          {skill !== undefined && graded >= 20 && (
            <Text style={styles.cardBody}>
              Brier score {track!.brier.toFixed(3)} vs {track!.brierBaseline.toFixed(3)} for a naive
              base-rate guess ({skill >= 0 ? '+' : ''}{(skill * 100).toFixed(1)}% skill).
            </Text>
          )}
        </View>

        {state?.picks.slice(0, 12).map((pick) => (
          <View key={`${pick.date}-${pick.fixtureId}`} style={styles.pickRow}>
            <View style={styles.pickText}>
              <Text style={styles.pickTeams} numberOfLines={1}>{pick.home} vs {pick.away}</Text>
              <Text style={styles.pickLabel} numberOfLines={1}>
                {pick.label} · {formatPercent(pick.probability)} · {pick.odds.toFixed(2)}
              </Text>
            </View>
            <Text
              style={[
                styles.outcome,
                pick.outcome === 'won' && { color: COLORS.green },
                pick.outcome === 'lost' && { color: COLORS.accent },
              ]}>
              {pick.outcome ? pick.outcome.toUpperCase() : 'PENDING'}
            </Text>
          </View>
        ))}

        <Text style={styles.section}>The method</Text>
        <Text style={styles.body}>
          1. Prices — home/draw/away, over/under and handicap prices are read from the scoreboard
          feed (DraftKings) and the bookmaker margin is removed.
        </Text>
        <Text style={styles.body}>
          2. Reverse-engineering — the app solves for the goal rates for each team that reproduce
          those prices, then derives every other market (over 1.5/2.5/3.5, both teams to score,
          double chance, handicaps) from the same score model so they stay consistent.
        </Text>
        <Text style={styles.body}>
          3. Ratings — attack and defence strength for each team from ~45 days of results across
          all competitions, weighted toward recent matches. This is the independent second opinion.
        </Text>
        <Text style={styles.body}>
          4. Blend and calibrate — bookmaker and ratings models are blended; confidence is then
          corrected by what actually happened to past predictions.
        </Text>
        <Text style={styles.body}>
          5. Selection — the top three selections by conservative probability (reduced when the two
          models disagree), at a worthwhile price, from different matches.
        </Text>

        <View style={styles.warning}>
          <Text style={styles.warningTitle}>Nothing here is guaranteed</Text>
          <Text style={styles.warningBody}>
            Bookmaker prices already contain most public information, so beating them is hard. A
            75% pick still loses one in four. Injuries and lineups are not in the free feed. Use
            this as analysis, not as a promise, and never stake money you cannot afford to lose.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: COLORS.background, flex: 1 },
  content: { alignSelf: 'center', maxWidth: 560, paddingBottom: 42, paddingHorizontal: 22, paddingTop: 28, width: '100%' },
  kicker: { color: COLORS.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  title: { color: COLORS.text, fontSize: 32, fontWeight: '800', letterSpacing: -1.2, lineHeight: 39, marginTop: 12 },
  intro: { color: COLORS.muted, fontSize: 12, lineHeight: 19, marginTop: 12 },
  stats: { flexDirection: 'row', gap: 10, marginTop: 12 },
  stat: { backgroundColor: COLORS.card, borderColor: COLORS.border, borderRadius: 14, borderWidth: 1, flex: 1, padding: 12 },
  statLabel: { color: COLORS.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  statValue: { color: COLORS.text, fontSize: 22, fontWeight: '800', marginTop: 6 },
  statNote: { color: COLORS.muted, fontSize: 8, marginTop: 4 },
  card: { backgroundColor: COLORS.card, borderColor: COLORS.border, borderRadius: 16, borderWidth: 1, marginTop: 16, padding: 14 },
  cardTitle: { color: COLORS.text, fontSize: 14, fontWeight: '800' },
  cardBody: { color: COLORS.muted, fontSize: 10, lineHeight: 16, marginTop: 7 },
  pickRow: { alignItems: 'center', borderBottomColor: COLORS.border, borderBottomWidth: 1, flexDirection: 'row', gap: 10, paddingVertical: 10 },
  pickText: { flex: 1, gap: 3 },
  pickTeams: { color: COLORS.text, fontSize: 11, fontWeight: '700' },
  pickLabel: { color: COLORS.muted, fontSize: 9 },
  outcome: { color: COLORS.muted, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  section: { color: COLORS.text, fontSize: 15, fontWeight: '800', marginTop: 26 },
  body: { color: COLORS.muted, fontSize: 10, lineHeight: 16, marginTop: 8 },
  warning: { backgroundColor: '#FFF9EB', borderColor: '#EFDFB7', borderRadius: 16, borderWidth: 1, marginTop: 24, padding: 15 },
  warningTitle: { color: COLORS.amber, fontSize: 12, fontWeight: '800' },
  warningBody: { color: '#8A6D2F', fontSize: 10, lineHeight: 16, marginTop: 6 },
});
