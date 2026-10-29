import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/logo';
import { PickCard } from '@/components/pick-card';
import { PALETTE } from '@/constants/palette';
import { getMatchdayData, type MatchdayData } from '@/features/football-data';
import { formatPercent } from '@/features/markets';
import { buildBrief, type Brief } from '@/features/pipeline';
import { combinedStats } from '@/features/picks';

function getDayString(offset: number) {
  const day = new Date();
  day.setDate(day.getDate() + offset);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

type Loaded = { key: string; data?: MatchdayData; error?: string };

export default function PicksScreen() {
  const [dayOffset, setDayOffset] = useState<0 | 1>(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loaded, setLoaded] = useState<Loaded>();
  const [briefState, setBriefState] = useState<{ key: string; brief: Brief }>();

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
        if (!controller.signal.aborted) setLoaded({ key: requestKey, data });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setLoaded({
          key: requestKey,
          error: reason instanceof Error ? reason.message : 'Unable to load matches.',
        });
      });
    return () => controller.abort();
  }, [date, requestKey, timezone]);

  const current = loaded?.key === requestKey ? loaded : undefined;
  const data = current?.data;

  useEffect(() => {
    if (!data) return;
    const controller = new AbortController();
    const publish = (brief: Brief) => {
      if (!controller.signal.aborted) setBriefState({ key: requestKey, brief });
    };
    buildBrief(data, publish, controller.signal)
      .then(publish)
      .catch(() => {
        if (controller.signal.aborted) return;
        setLoaded({
          key: requestKey,
          error: 'Recent results could not be downloaded, so today’s picks can’t be locked in yet.',
        });
      });
    return () => controller.abort();
  }, [data, requestKey]);

  const brief = briefState?.key === requestKey ? briefState.brief : undefined;
  const picks = brief?.picks ?? [];
  const stats = picks.length > 1 ? combinedStats(picks) : undefined;
  const track = brief?.track;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brandRow}>
          <View style={styles.logoWrap}><Logo size={38} /></View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh picks"
            onPress={() => setRefreshKey((key) => key + 1)}
            hitSlop={10}
            style={styles.refresh}>
            <Text style={styles.refreshText}>Refresh</Text>
          </Pressable>
        </View>

        <Text style={styles.title}>{dayOffset === 0 ? 'Today’s three' : 'Tomorrow’s three'}</Text>
        <Text style={styles.subtitle}>
          Three bets a day, each from a different market and chosen for how likely it is to land.
          Once set, they never change.
        </Text>

        <View style={styles.tabs}>
          {([0, 1] as const).map((offset) => (
            <Pressable
              key={offset}
              accessibilityRole="tab"
              accessibilityState={{ selected: dayOffset === offset }}
              onPress={() => setDayOffset(offset)}
              style={[styles.tab, dayOffset === offset && styles.tabSelected]}>
              <Text style={[styles.tabText, dayOffset === offset && styles.tabTextSelected]}>
                {offset === 0 ? 'Today' : 'Tomorrow'}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.date}>{displayDate}</Text>

        {current?.error ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Couldn’t reach the odds feed</Text>
            <Text style={styles.noticeText}>{current.error}</Text>
            <Pressable style={styles.button} onPress={() => setRefreshKey((key) => key + 1)}>
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>
          </View>
        ) : !brief?.picksReady ? (
          <View style={styles.loading}>
            <ActivityIndicator color={PALETTE.primary} />
            <Text style={styles.loadingText}>
              {brief ? 'Analysing recent results…' : 'Reading the odds…'}
            </Text>
          </View>
        ) : (
          <>
            {brief.coverage.length > 0 && (
              <View style={styles.coverage}>
                <Text style={styles.coverageTitle}>
                  {brief.coverage.reduce((sum, item) => sum + item.matches, 0)} matches analysed across
                </Text>
                <View style={styles.chips}>
                  {brief.coverage.slice(0, 12).map((item) => (
                    <View key={item.country} style={styles.chip}>
                      <Text style={styles.chipText}>{item.country} · {item.matches}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {picks.map((pick, index) => (
              <PickCard key={pick.fixtureId} pick={pick} index={index} />
            ))}

            {!picks.length && (
              <View style={styles.notice}>
                <Text style={styles.noticeTitle}>No bet cleared the bar</Text>
                <Text style={styles.noticeText}>
                  Nothing had enough evidence and a worthwhile price. Skipping a day is better than
                  forcing a bet.
                </Text>
              </View>
            )}

            {stats && (
              <View style={styles.combined}>
                <View>
                  <Text style={styles.combinedLabel}>All three together</Text>
                  <Text style={styles.combinedSub}>{formatPercent(stats.chance)} model chance</Text>
                </View>
                <Text style={styles.combinedOdds}>{stats.odds.toFixed(2)}</Text>
              </View>
            )}

            {track && track.picksSettled > 0 && (
              <Text style={styles.record}>
                Track record: {track.picksWon} of {track.picksSettled} settled bets won — the model
                expected {formatPercent(track.picksAverageProbability)}.
              </Text>
            )}
          </>
        )}

        <Text style={styles.disclaimer}>
          No bet is guaranteed; even a 75% pick loses one time in four. Estimated odds are
          model-derived, not bookmaker quotes. Injuries and lineups are not included. For
          information only — never stake more than you can afford to lose.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: PALETTE.background, flex: 1 },
  content: { alignSelf: 'center', maxWidth: 520, paddingBottom: 48, paddingHorizontal: 20, paddingTop: 12, width: '100%' },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  logoWrap: { flex: 1 },
  refresh: { paddingVertical: 4 },
  refreshText: { color: PALETTE.primary, fontSize: 14, fontWeight: '600' },
  title: { color: PALETTE.ink, fontSize: 34, fontWeight: '800', letterSpacing: -1, marginTop: 30 },
  subtitle: { color: PALETTE.muted, fontSize: 15, lineHeight: 22, marginTop: 8 },
  tabs: { backgroundColor: PALETTE.surface, borderRadius: 12, flexDirection: 'row', marginTop: 22, padding: 3 },
  tab: { alignItems: 'center', borderRadius: 10, flex: 1, paddingVertical: 10 },
  tabSelected: { backgroundColor: PALETTE.background, shadowColor: '#14212B', shadowOffset: { height: 1, width: 0 }, shadowOpacity: 0.08, shadowRadius: 3 },
  tabText: { color: PALETTE.muted, fontSize: 14, fontWeight: '600' },
  tabTextSelected: { color: PALETTE.ink },
  date: { color: PALETTE.faint, fontSize: 13, marginBottom: 18, marginTop: 12 },
  loading: { alignItems: 'center', gap: 12, paddingVertical: 60 },
  loadingText: { color: PALETTE.muted, fontSize: 14 },
  notice: { backgroundColor: PALETTE.surface, borderRadius: 16, padding: 18 },
  noticeTitle: { color: PALETTE.ink, fontSize: 16, fontWeight: '700' },
  noticeText: { color: PALETTE.muted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  button: { alignSelf: 'flex-start', backgroundColor: PALETTE.primary, borderRadius: 10, marginTop: 14, paddingHorizontal: 18, paddingVertical: 10 },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  coverage: { backgroundColor: PALETTE.surface, borderRadius: 16, marginBottom: 14, padding: 14 },
  coverageTitle: { color: PALETTE.muted, fontSize: 13, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: { backgroundColor: PALETTE.background, borderColor: PALETTE.hairline, borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { color: PALETTE.ink, fontSize: 12, fontWeight: '600' },
  combined: { alignItems: 'center', backgroundColor: PALETTE.primaryDeep, borderRadius: 20, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, padding: 20 },
  combinedLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  combinedSub: { color: '#B9D6CF', fontSize: 13, marginTop: 3 },
  combinedOdds: { color: '#FFFFFF', fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  record: { color: PALETTE.ink, fontSize: 13, lineHeight: 19, marginTop: 16 },
  disclaimer: { color: PALETTE.faint, fontSize: 12, lineHeight: 18, marginTop: 24 },
});
