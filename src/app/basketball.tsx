import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HoopCard } from '@/components/hoop-card';
import { Logo } from '@/components/logo';
import { PALETTE } from '@/constants/palette';
import { getGameDay } from '@/features/basketball-data';
import { buildHoopsDay, TARGET_ODDS, type HoopsDay } from '@/features/basketball-picks';
import { formatPercent } from '@/features/markets';

function getDayString(offset: number) {
  const day = new Date();
  day.setDate(day.getDate() + offset);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

type Loaded = { key: string; day?: HoopsDay; error?: string };

export default function BasketballScreen() {
  const [dayOffset, setDayOffset] = useState<0 | 1>(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loaded, setLoaded] = useState<Loaded>();

  const date = getDayString(dayOffset);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const requestKey = `${date}:${timezone}:${refreshKey}`;
  const displayDate = new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  useEffect(() => {
    const controller = new AbortController();
    getGameDay(date, timezone, controller.signal)
      .then((games) => buildHoopsDay(date, games, controller.signal))
      .then((day) => {
        if (!controller.signal.aborted) setLoaded({ key: requestKey, day });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setLoaded({ key: requestKey, error: reason instanceof Error ? reason.message : 'Unable to load games.' });
      });
    return () => controller.abort();
  }, [date, requestKey, timezone]);

  const current = loaded?.key === requestKey ? loaded : undefined;
  const day = current?.day;
  const slip = day?.slip;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brandRow}>
          <View style={styles.logoWrap}><Logo size={38} /></View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh"
            onPress={() => setRefreshKey((key) => key + 1)}
            hitSlop={10}
            style={styles.refresh}>
            <Text style={styles.refreshText}>Refresh</Text>
          </Pressable>
        </View>

        <Text style={styles.title}>{dayOffset === 0 ? 'Today’s basketball bet' : 'Tomorrow’s basketball bet'}</Text>
        <Text style={styles.subtitle}>
          Every NBA, WNBA, college and NBL game of the day is checked. The app picks the one favourite paying{' '}
          {TARGET_ODDS.toFixed(2)} or more that is most likely to win, or two favourites that together pay{' '}
          {TARGET_ODDS.toFixed(2)} when that pair is clearly safer. Once set, the bet never changes for the day.
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
            <Text style={styles.noticeTitle}>Couldn’t reach the games feed</Text>
            <Text style={styles.noticeText}>{current.error}</Text>
            <Pressable style={styles.button} onPress={() => setRefreshKey((key) => key + 1)}>
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>
          </View>
        ) : !day ? (
          <View style={styles.loading}>
            <ActivityIndicator color={PALETTE.primary} />
            <Text style={styles.loadingText}>Reading the odds and the last 30 days of scores…</Text>
          </View>
        ) : (
          <>
            {slip?.picks.map((pick, index) => <HoopCard key={pick.gameId} pick={pick} index={index} />)}

            {slip ? (
              <View style={styles.combined}>
                <View style={styles.combinedText}>
                  <Text style={styles.combinedLabel}>{slip.kind === 'single' ? 'Single bet' : 'Two-game slip'}</Text>
                  <Text style={styles.combinedSub}>
                    {formatPercent(slip.chance)} chance {slip.kind === 'single' ? 'it wins' : 'both win'}
                  </Text>
                </View>
                <Text style={styles.combinedOdds}>{slip.odds.toFixed(2)}</Text>
              </View>
            ) : (
              <View style={styles.notice}>
                <Text style={styles.noticeTitle}>No bet today</Text>
                <Text style={styles.noticeText}>
                  {day.priced === 0
                    ? 'None of the games still to start has bookmaker odds yet. Odds usually appear a day or two before tip-off.'
                    : `No favourite, or pair of favourites, reached ${TARGET_ODDS.toFixed(2)} without too much risk. Skipping a day is better than forcing a bet.`}
                </Text>
              </View>
            )}

            {!day.locked && (day.bestSingle !== undefined || day.bestPair !== undefined) && (
              <Text style={styles.record}>
                Compared {day.candidates} favourites from {day.priced} priced games of {day.games}. Best single:{' '}
                {day.bestSingle === undefined ? 'none at 1.50+' : formatPercent(day.bestSingle)}; best pair:{' '}
                {day.bestPair === undefined ? 'none' : formatPercent(day.bestPair)}.
              </Text>
            )}

            {day.track.settled > 0 && (
              <Text style={styles.record}>
                Track record: {day.track.won} of {day.track.settled} days won. The app expected{' '}
                {formatPercent(day.track.expected)}.
              </Text>
            )}
          </>
        )}

        <Link href="/" style={styles.link}>Football picks →</Link>

        <Text style={styles.disclaimer}>
          No bet is guaranteed: a 60% pick still loses about two days in five. Odds shown are the US bookmaker’s; your
          bookie’s price may differ, so check it is still 1.50 or more before staking. Late injury news is not
          included. For information only — never stake more than you can afford to lose.
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
  title: { color: PALETTE.ink, fontSize: 30, fontWeight: '800', letterSpacing: -1, marginTop: 30 },
  subtitle: { color: PALETTE.muted, fontSize: 15, lineHeight: 22, marginTop: 8 },
  tabs: { backgroundColor: PALETTE.surface, borderRadius: 12, flexDirection: 'row', marginTop: 22, padding: 3 },
  tab: { alignItems: 'center', borderRadius: 10, flex: 1, paddingVertical: 10 },
  tabSelected: { backgroundColor: PALETTE.background, shadowColor: '#14212B', shadowOffset: { height: 1, width: 0 }, shadowOpacity: 0.08, shadowRadius: 3 },
  tabText: { color: PALETTE.muted, fontSize: 14, fontWeight: '600' },
  tabTextSelected: { color: PALETTE.ink },
  date: { color: PALETTE.faint, fontSize: 13, marginBottom: 18, marginTop: 12 },
  loading: { alignItems: 'center', gap: 12, paddingVertical: 60 },
  loadingText: { color: PALETTE.muted, fontSize: 14, textAlign: 'center' },
  notice: { backgroundColor: PALETTE.surface, borderRadius: 16, padding: 18 },
  noticeTitle: { color: PALETTE.ink, fontSize: 16, fontWeight: '700' },
  noticeText: { color: PALETTE.muted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  button: { alignSelf: 'flex-start', backgroundColor: PALETTE.primary, borderRadius: 10, marginTop: 14, paddingHorizontal: 18, paddingVertical: 10 },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  combined: { alignItems: 'center', backgroundColor: PALETTE.primaryDeep, borderRadius: 20, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, padding: 20 },
  combinedText: { flex: 1 },
  combinedLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  combinedSub: { color: '#B9D6CF', fontSize: 13, marginTop: 3 },
  combinedOdds: { color: '#FFFFFF', fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  record: { color: PALETTE.ink, fontSize: 13, lineHeight: 19, marginTop: 16 },
  link: { color: PALETTE.primary, fontSize: 14, fontWeight: '600', marginTop: 24 },
  disclaimer: { color: PALETTE.faint, fontSize: 12, lineHeight: 18, marginTop: 24 },
});
