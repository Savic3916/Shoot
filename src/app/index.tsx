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
import { buildBrief, type Brief } from '@/features/pipeline';
import { DailyPicks } from '@/components/daily-picks';

const COLORS = {
  background: '#FFFFFF',
  panel: '#F5F6F8',
  border: '#E4E6EA',
  muted: '#6B7280',
  text: '#141518',
  accent: '#E41827',
  amber: '#B45309',
};

function getDayString(offset: number) {
  const day = new Date();
  day.setDate(day.getDate() + offset);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

function ListHeader({
  data,
  brief,
  dayOffset,
  setDayOffset,
  displayDate,
  loading,
  onRefresh,
}: {
  data?: MatchdayData;
  brief?: Brief;
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
            {data ? 'LIVE ODDS FEED' : 'LOADING FEED'}
          </Text>
        </View>
      </View>

      <View style={styles.hero}>
        <Text style={styles.kicker}>THE MATCHDAY BRIEF</Text>
        <Text style={styles.title}>One slip.{'\n'}No guarantees.</Text>
        <Text style={styles.heroCopy}>
          Bookmaker odds are scraped from the live scoreboard feed, converted into goal
          expectations, and cross-checked against team ratings built from recent results.
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
          {loading ? <ActivityIndicator size="small" color={COLORS.accent} /> : <Text style={styles.refreshText}>↻</Text>}
        </Pressable>
      </View>

      {data?.coverageWarnings.length ? (
        <Text style={styles.coverageWarning}>
          Some competitions could not load: {data.coverageWarnings.slice(0, 3).join(' · ')}
        </Text>
      ) : null}

      {data && <DailyPicks brief={brief} />}

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
  const [briefState, setBriefState] = useState<{ key: string; brief: Brief }>();
  const brief = briefState?.key === requestKey ? briefState.brief : undefined;

  useEffect(() => {
    if (!data) return;
    const controller = new AbortController();
    buildBrief(
      data,
      (stage) => {
        if (!controller.signal.aborted) setBriefState({ key: requestKey, brief: stage });
      },
      controller.signal,
    )
      .then((full) => {
        if (!controller.signal.aborted) setBriefState({ key: requestKey, brief: full });
      })
      .catch(() => {
        // The stage-1 bookmaker analysis stays on screen if the history download fails.
      });
    return () => controller.abort();
  }, [data, requestKey]);
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
            Start or restart the app with npm start and check your internet connection. Fixtures
            load directly from public ESPN scoreboards; no local server, token, or paid account is
            required.
          </Text>
          <Pressable style={styles.retryButton} onPress={() => setRefreshKey((key) => key + 1)}>
            <Text style={styles.retryText}>Retry live feed</Text>
          </Pressable>
        </View>
      ) : loading && !data ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={COLORS.accent} />
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
              tintColor={COLORS.accent}
              colors={[COLORS.accent]}
            />
          }
          ListHeaderComponent={
            <ListHeader
              data={data}
              brief={brief}
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
              analysis={brief?.analyses.get(item.id)}
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
              ESPN scoreboard + DraftKings prices · model estimates, not advice
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
  brandMark: { alignItems: 'center', backgroundColor: COLORS.accent, borderRadius: 11, height: 35, justifyContent: 'center', width: 35 },
  brandIcon: { color: COLORS.background, fontSize: 19, fontWeight: '900' },
  brandWords: { marginLeft: 10 },
  brand: { color: COLORS.text, fontSize: 13, fontWeight: '900', letterSpacing: 1.8 },
  brandSub: { color: COLORS.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1.3, marginTop: 3 },
  liveBadge: { alignItems: 'center', borderColor: COLORS.border, borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 6, marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 7 },
  liveDot: { backgroundColor: COLORS.accent, borderRadius: 4, height: 6, width: 6 },
  liveLabel: { color: COLORS.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  hero: { paddingBottom: 19, paddingTop: 34 },
  kicker: { color: COLORS.accent, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  title: { color: COLORS.text, fontSize: 36, fontWeight: '800', letterSpacing: -1.5, lineHeight: 40, marginTop: 11 },
  heroCopy: { color: COLORS.muted, fontSize: 12, lineHeight: 19, marginTop: 11, maxWidth: 360 },
  heroMeta: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 17 },
  metaDot: { backgroundColor: COLORS.accent, borderRadius: 3, height: 6, width: 6 },
  metaText: { color: COLORS.text, fontSize: 9, fontWeight: '800', letterSpacing: 0.9 },
  metaDivider: { color: COLORS.muted, fontSize: 11 },
  dayTabs: { alignItems: 'center', backgroundColor: COLORS.panel, borderColor: COLORS.border, borderRadius: 14, borderWidth: 1, flexDirection: 'row', marginBottom: 17, padding: 3 },
  dayTab: { alignItems: 'center', borderRadius: 10, flex: 1, paddingVertical: 10 },
  dayTabSelected: { backgroundColor: '#E41827' },
  dayTabText: { color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  dayTabTextSelected: { color: '#FFFFFF' },
  refreshButton: { alignItems: 'center', borderLeftColor: COLORS.border, borderLeftWidth: 1, height: 32, justifyContent: 'center', width: 43 },
  refreshText: { color: COLORS.accent, fontSize: 21 },
  sectionHeader: { marginBottom: 12 },
  sectionTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  sectionSubtitle: { color: COLORS.muted, fontSize: 10, marginTop: 4 },
  errorWrap: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 25 },
  errorTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  errorText: { color: COLORS.muted, fontSize: 11, lineHeight: 17, marginTop: 8, textAlign: 'center' },
  retryButton: { backgroundColor: '#E41827', borderRadius: 10, marginTop: 14, paddingHorizontal: 16, paddingVertical: 10 },
  retryText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  loadingWrap: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center' },
  loadingText: { color: COLORS.muted, fontSize: 11 },
  emptyState: { alignItems: 'center', backgroundColor: COLORS.panel, borderColor: COLORS.border, borderRadius: 18, borderWidth: 1, padding: 20 },
  emptyTitle: { color: COLORS.text, fontSize: 13, fontWeight: '800' },
  emptyCopy: { color: COLORS.muted, fontSize: 10, lineHeight: 15, marginTop: 6, textAlign: 'center' },
  footerNote: { color: COLORS.muted, fontSize: 9, paddingBottom: 15, paddingTop: 5, textAlign: 'center' },
  coverageWarning: { color: COLORS.amber, fontSize: 9, lineHeight: 14, marginBottom: 12 },
});
