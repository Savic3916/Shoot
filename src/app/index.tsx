import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FixtureCard } from '@/components/fixture-card';
import {
  getMatchdayData,
  type FootballMatch,
  type MatchdayData,
} from '@/features/football-data';
import { buildDailyAccumulator } from '@/features/accumulator';

const COLORS = {
  background: '#09120D',
  panel: '#111D17',
  border: '#29362F',
  muted: '#829087',
  text: '#F4F7F4',
  green: '#B8F36B',
  amber: '#F2C875',
  red: '#F08378',
};

function getDayString(offset: number) {
  const day = new Date();
  day.setDate(day.getDate() + offset);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

function AccumulatorCard({ data }: { data: MatchdayData }) {
  const accumulator = useMemo(
    () => buildDailyAccumulator(data.fixtures, data.form, data.players),
    [data.fixtures, data.form, data.players],
  );

  return (
    <View style={styles.accumulator}>
      <View style={styles.accaHeader}>
        <View style={styles.accaLabel}>
          <View style={styles.accaDot} />
          <Text style={styles.accaKicker}>ONE DAILY ACCUMULATOR</Text>
        </View>
        <Text style={styles.oddsCap}>MAX 5.00</Text>
      </View>
      <Text style={styles.accaTitle}>Form-based shortlist</Text>
      <Text style={styles.accaDescription}>
        Double-chance estimates derived from the free feed’s recent W/D/L form. These are not
        bookmaker prices or calibrated probabilities.
      </Text>

      {accumulator ? (
        <>
          {accumulator.legs.map((leg, index) => (
            <View key={leg.fixtureId} style={styles.legRow}>
              <View style={styles.legNumber}>
                <Text style={styles.legNumberText}>{index + 1}</Text>
              </View>
              <View style={styles.legInfo}>
                <Text style={styles.legTeams} numberOfLines={1}>
                  {leg.homeTeam} vs {leg.awayTeam}
                </Text>
                <Text style={styles.legPick} numberOfLines={1}>
                  {leg.selection} · {leg.competition}
                </Text>
                <Text style={styles.legEvidence}>
                  {leg.formMatches} recent W/D/L results · model-only price estimate
                </Text>
                {leg.unavailableCount > 0 && (
                  <Text style={styles.legWarning}>
                    {leg.unavailableCount} reported absences — check team news
                  </Text>
                )}
              </View>
              <Text style={styles.legPrice}>{leg.decimalOdds.toFixed(2)}</Text>
            </View>
          ))}
          <View style={styles.combined}>
            <View>
              <Text style={styles.combinedCaption}>COMBINED MODEL PRICE ESTIMATE</Text>
              <Text style={styles.combinedSub}>Not a bookmaker quote</Text>
            </View>
            <Text style={styles.combinedPrice}>{accumulator.combinedOdds.toFixed(2)}</Text>
          </View>
          <Text style={styles.chanceNote}>
            Uncalibrated form estimate: {Math.round(accumulator.estimatedChance * 100)}% if each leg
            were independent. This is not a bookmaker implied probability, and outcomes are not
            guaranteed.
          </Text>
        </>
      ) : (
        <View style={styles.noPick}>
          <Text style={styles.noPickTitle}>
            No accumulator passed the checks
          </Text>
          <Text style={styles.noPickCopy}>
            At least two fixtures need enough recent form to qualify. We do not invent a pick when
            the free feed lacks the required results.
          </Text>
        </View>
      )}
      <Text style={styles.responsible}>
        No bet is safe or certain. A multi-match accumulator loses if any leg loses. For information
        only — not betting advice.
      </Text>
    </View>
  );
}

function ListHeader({
  data,
  dayOffset,
  setDayOffset,
  displayDate,
  loading,
  onRefresh,
}: {
  data?: MatchdayData;
  dayOffset: 0 | 1;
  setDayOffset: (value: 0 | 1) => void;
  displayDate: string;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <View>
      <View style={styles.topLine}>
        <View style={styles.brandMark}><Text style={styles.brandIcon}>S</Text></View>
        <View style={styles.brandWords}>
          <Text style={styles.brand}>SIDELINE</Text>
          <Text style={styles.brandSub}>MAJOR COMPETITIONS</Text>
        </View>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveLabel}>
            {data ? 'FREE SCORE FEED' : 'LOADING FEED'}
          </Text>
        </View>
      </View>

      <View style={styles.hero}>
        <Text style={styles.kicker}>THE MATCHDAY BRIEF</Text>
        <Text style={styles.title}>One slip.{'\n'}No guarantees.</Text>
        <Text style={styles.heroCopy}>
          Fixtures and scores from the free match feed, with recent team form where available.
          Bookmaker odds and lineup information are not included.
        </Text>
        <View style={styles.heroMeta}>
          <View style={styles.metaDot} />
          <Text style={styles.metaText}>{displayDate.toUpperCase()}</Text>
          <Text style={styles.metaDivider}>/</Text>
          <Text style={styles.metaText}>{data?.fixtures.length ?? '—'} FIXTURES</Text>
        </View>
      </View>

      <View style={styles.dayTabs}>
        {([0, 1] as const).map((offset) => (
          <Pressable
            key={offset}
            accessibilityRole="tab"
            accessibilityState={{ selected: dayOffset === offset }}
            onPress={() => setDayOffset(offset)}
            style={[styles.dayTab, dayOffset === offset && styles.dayTabSelected]}>
            <Text style={[styles.dayTabText, dayOffset === offset && styles.dayTabTextSelected]}>
              {offset === 0 ? 'Today' : 'Tomorrow'}
            </Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh fixtures and scores"
          onPress={onRefresh}
          style={styles.refreshButton}>
          {loading ? <ActivityIndicator size="small" color={COLORS.green} /> : <Text style={styles.refreshText}>↻</Text>}
        </Pressable>
      </View>

      {data?.coverageWarnings.length ? (
        <Text style={styles.coverageWarning}>
          Some competitions could not load: {data.coverageWarnings.slice(0, 3).join(' · ')}
        </Text>
      ) : null}

      {data && <AccumulatorCard data={data} />}

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>All matches</Text>
          <Text style={styles.sectionSubtitle}>
            {loading ? 'Refreshing free score feed…' : `${data?.fixtures.length ?? 0} fixtures available`}
          </Text>
        </View>
      </View>
    </View>
  );
}

function keyExtractor(match: FootballMatch) {
  return match.id;
}

export default function MatchesScreen() {
  const [dayOffset, setDayOffset] = useState<0 | 1>(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [response, setResponse] = useState<{
    key: string;
    data?: MatchdayData;
    error?: string;
  }>();
  const date = getDayString(dayOffset);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const requestKey = `${date}:${timezone}:${refreshKey}`;
  const displayDate = new Date(`${date}T12:00:00`).toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  useEffect(() => {
    const controller = new AbortController();
    getMatchdayData(date, timezone, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResponse({ key: requestKey, data });
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setResponse({
            key: requestKey,
            error: reason instanceof Error ? reason.message : 'Unable to load matches.',
          });
        }
      });
    return () => controller.abort();
  }, [date, requestKey, timezone]);

  const currentResponse = response?.key === requestKey ? response : undefined;
  const data = currentResponse?.data;
  const error = currentResponse?.error;
  const loading = !currentResponse;
  const fixtures = useMemo(
    () => (data?.fixtures ?? []).slice().sort((a, b) => a.utcDate.localeCompare(b.utcDate)),
    [data?.fixtures],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorTitle}>Free match feed unavailable</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorText}>
            Start the app with npm start; it launches the free match feed server and Expo together.
            On a phone, set EXPO_PUBLIC_API_URL in .env to your computer’s LAN address before
            starting. This source has no paid account or token, but does not provide bookmaker
            odds, player availability, or confirmed lineups.
          </Text>
          <Pressable style={styles.retryButton} onPress={() => setRefreshKey((key) => key + 1)}>
            <Text style={styles.retryText}>Retry live feed</Text>
          </Pressable>
        </View>
      ) : loading && !data ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={COLORS.green} />
          <Text style={styles.loadingText}>Loading matchday data…</Text>
        </View>
      ) : (
        <FlatList
          data={fixtures}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.content}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => setRefreshKey((key) => key + 1)}
              tintColor={COLORS.green}
              colors={[COLORS.green]}
            />
          }
          ListHeaderComponent={
            <ListHeader
              data={data}
              dayOffset={dayOffset}
              setDayOffset={setDayOffset}
              displayDate={displayDate}
              loading={loading}
              onRefresh={() => setRefreshKey((key) => key + 1)}
            />
          }
          renderItem={({ item }) => (
            <FixtureCard
              fixture={item}
              homeForm={data?.form[item.homeTeamId] ?? []}
              awayForm={data?.form[item.awayTeamId] ?? []}
              homePlayers={data?.players[item.homeTeamId] ?? []}
              awayPlayers={data?.players[item.awayTeamId] ?? []}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No fixtures for this date</Text>
              <Text style={styles.emptyCopy}>
                No fixtures were returned for this local date. The free feed covers selected major
                leagues and cups, not every competition worldwide.
              </Text>
            </View>
          }
          ListFooterComponent={
            <Text style={styles.footerNote}>
              Free ESPN score feed · selected competitions · no bookmaker odds
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: COLORS.background, flex: 1 },
  content: { alignSelf: 'center', maxWidth: 620, paddingBottom: 38, paddingHorizontal: 18, width: '100%' },
  topLine: { alignItems: 'center', flexDirection: 'row', paddingTop: 12 },
  brandMark: { alignItems: 'center', backgroundColor: COLORS.green, borderRadius: 11, height: 35, justifyContent: 'center', width: 35 },
  brandIcon: { color: COLORS.background, fontSize: 19, fontWeight: '900' },
  brandWords: { marginLeft: 10 },
  brand: { color: COLORS.text, fontSize: 13, fontWeight: '900', letterSpacing: 1.8 },
  brandSub: { color: COLORS.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1.3, marginTop: 3 },
  liveBadge: { alignItems: 'center', borderColor: COLORS.border, borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 6, marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 7 },
  liveDot: { backgroundColor: COLORS.green, borderRadius: 4, height: 6, width: 6 },
  liveLabel: { color: COLORS.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  hero: { paddingBottom: 19, paddingTop: 34 },
  kicker: { color: COLORS.green, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  title: { color: COLORS.text, fontSize: 36, fontWeight: '800', letterSpacing: -1.5, lineHeight: 40, marginTop: 11 },
  heroCopy: { color: COLORS.muted, fontSize: 12, lineHeight: 19, marginTop: 11, maxWidth: 360 },
  heroMeta: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 17 },
  metaDot: { backgroundColor: COLORS.green, borderRadius: 3, height: 6, width: 6 },
  metaText: { color: COLORS.text, fontSize: 9, fontWeight: '800', letterSpacing: 0.9 },
  metaDivider: { color: COLORS.muted, fontSize: 11 },
  dayTabs: { alignItems: 'center', backgroundColor: COLORS.panel, borderColor: COLORS.border, borderRadius: 14, borderWidth: 1, flexDirection: 'row', marginBottom: 17, padding: 3 },
  dayTab: { alignItems: 'center', borderRadius: 10, flex: 1, paddingVertical: 10 },
  dayTabSelected: { backgroundColor: '#26342B' },
  dayTabText: { color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  dayTabTextSelected: { color: COLORS.green },
  refreshButton: { alignItems: 'center', borderLeftColor: COLORS.border, borderLeftWidth: 1, height: 32, justifyContent: 'center', width: 43 },
  refreshText: { color: COLORS.green, fontSize: 21 },
  accumulator: { backgroundColor: '#111D17', borderColor: '#43583B', borderRadius: 19, borderWidth: 1, marginBottom: 24, padding: 15 },
  accaHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  accaLabel: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  accaDot: { backgroundColor: COLORS.green, borderRadius: 4, height: 7, width: 7 },
  accaKicker: { color: COLORS.green, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  oddsCap: { borderColor: '#536448', borderRadius: 9, borderWidth: 1, color: COLORS.amber, fontSize: 8, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 4 },
  accaTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.5, marginTop: 13 },
  accaDescription: { color: COLORS.muted, fontSize: 10, lineHeight: 15, marginTop: 5 },
  legRow: { alignItems: 'flex-start', borderBottomColor: COLORS.border, borderBottomWidth: 1, flexDirection: 'row', gap: 10, paddingVertical: 12 },
  legNumber: { alignItems: 'center', backgroundColor: '#243126', borderRadius: 7, height: 22, justifyContent: 'center', width: 22 },
  legNumberText: { color: COLORS.green, fontSize: 10, fontWeight: '900' },
  legInfo: { flex: 1, gap: 3 },
  legTeams: { color: COLORS.text, fontSize: 11, fontWeight: '700' },
  legPick: { color: COLORS.green, fontSize: 10, fontWeight: '600' },
  legEvidence: { color: COLORS.muted, fontSize: 8 },
  legWarning: { color: COLORS.amber, fontSize: 8 },
  legPrice: { color: COLORS.green, fontSize: 12, fontWeight: '900', paddingTop: 2 },
  combined: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingTop: 13 },
  combinedCaption: { color: COLORS.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  combinedSub: { color: COLORS.muted, fontSize: 8, marginTop: 4 },
  combinedPrice: { color: COLORS.green, fontSize: 25, fontWeight: '900', letterSpacing: -0.5 },
  chanceNote: { color: COLORS.muted, fontSize: 9, lineHeight: 14, marginTop: 12 },
  noPick: { backgroundColor: '#1B211B', borderRadius: 12, marginTop: 13, padding: 12 },
  noPickTitle: { color: COLORS.amber, fontSize: 11, fontWeight: '800' },
  noPickCopy: { color: COLORS.muted, fontSize: 10, lineHeight: 15, marginTop: 5 },
  responsible: { color: '#B1A98F', fontSize: 9, lineHeight: 14, marginTop: 11 },
  sectionHeader: { marginBottom: 12 },
  sectionTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  sectionSubtitle: { color: COLORS.muted, fontSize: 10, marginTop: 4 },
  errorWrap: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 25 },
  errorTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  errorText: { color: COLORS.muted, fontSize: 11, lineHeight: 17, marginTop: 8, textAlign: 'center' },
  retryButton: { backgroundColor: '#203025', borderRadius: 10, marginTop: 14, paddingHorizontal: 16, paddingVertical: 10 },
  retryText: { color: COLORS.green, fontSize: 11, fontWeight: '800' },
  loadingWrap: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center' },
  loadingText: { color: COLORS.muted, fontSize: 11 },
  emptyState: { alignItems: 'center', backgroundColor: COLORS.panel, borderColor: COLORS.border, borderRadius: 18, borderWidth: 1, padding: 20 },
  emptyTitle: { color: COLORS.text, fontSize: 13, fontWeight: '800' },
  emptyCopy: { color: COLORS.muted, fontSize: 10, lineHeight: 15, marginTop: 6, textAlign: 'center' },
  footerNote: { color: COLORS.muted, fontSize: 9, paddingBottom: 15, paddingTop: 5, textAlign: 'center' },
  coverageWarning: { color: COLORS.amber, fontSize: 9, lineHeight: 14, marginBottom: 12 },
});
