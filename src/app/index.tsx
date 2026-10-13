import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FixtureCard } from '@/components/fixture-card';
import { LEAGUES, getMatchdayData, type LeagueCode, type MatchdayData } from '@/features/football-data';

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
  const year = day.getFullYear();
  const month = String(day.getMonth() + 1).padStart(2, '0');
  const date = String(day.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

export default function MatchesScreen() {
  const [league, setLeague] = useState<LeagueCode>('PL');
  const [dayOffset, setDayOffset] = useState<0 | 1>(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [response, setResponse] = useState<{
    key: string;
    data?: MatchdayData;
    error?: string;
  }>();
  const date = getDayString(dayOffset);
  const requestKey = `${league}:${date}:${refreshKey}`;
  const displayDate = new Date(`${date}T12:00:00`).toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  useEffect(() => {
    const controller = new AbortController();

    getMatchdayData(league, date, controller.signal)
      .then((loadedData) => {
        if (!controller.signal.aborted) {
          setResponse({ key: requestKey, data: loadedData });
        }
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
  }, [date, league, requestKey]);

  const currentResponse = response?.key === requestKey ? response : undefined;
  const data = currentResponse?.data;
  const error = currentResponse?.error;
  const loading = !currentResponse;
  const fixtures = data?.fixtures.filter((fixture) =>
    ['SCHEDULED', 'TIMED', 'IN_PLAY', 'LIVE', 'PAUSED', 'FINISHED'].includes(fixture.status),
  ) ?? [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading && Boolean(response?.data)}
            onRefresh={() => setRefreshKey((current) => current + 1)}
            tintColor={COLORS.green}
            colors={[COLORS.green]}
          />
        }>
        <View style={styles.topLine}>
          <View style={styles.brandMark}>
            <Text style={styles.brandIcon}>S</Text>
          </View>
          <View style={styles.brandWords}>
            <Text style={styles.brand}>SIDELINE</Text>
            <Text style={styles.brandSub}>FOOTBALL MODEL</Text>
          </View>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveLabel}>{data?.source === 'demo' || !data ? 'DEMO MODE' : 'DATA READY'}</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.kicker}>THE MATCHDAY BRIEF</Text>
          <Text style={styles.title}>Read the{'\n'}form, not the hype.</Text>
          <Text style={styles.heroCopy}>
            Recent results and head-to-heads, turned into five transparent probability estimates.
          </Text>
          <View style={styles.heroMeta}>
            <View style={styles.metaDot} />
            <Text style={styles.metaText}>{displayDate.toUpperCase()}</Text>
            <Text style={styles.metaDivider}>/</Text>
            <Text style={styles.metaText}>{data?.competition.toUpperCase() ?? 'MATCH CENTRE'}</Text>
          </View>
        </View>

        <View style={styles.dateSwitch}>
          {([0, 1] as const).map((offset) => (
            <Pressable
              key={offset}
              accessibilityRole="button"
              accessibilityState={{ selected: dayOffset === offset }}
              onPress={() => setDayOffset(offset)}
              style={[styles.dateOption, dayOffset === offset && styles.dateOptionSelected]}>
              <Text style={[styles.dateOptionText, dayOffset === offset && styles.dateOptionTextSelected]}>
                {offset === 0 ? 'Today' : 'Tomorrow'}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.leagues}>
          {LEAGUES.map((item) => (
            <Pressable
              key={item.code}
              accessibilityRole="button"
              accessibilityState={{ selected: league === item.code }}
              onPress={() => setLeague(item.code)}
              style={[styles.leagueChip, league === item.code && styles.leagueChipSelected]}>
              <Text style={[styles.leagueTag, league === item.code && styles.leagueTagSelected]}>
                {item.shortName}
              </Text>
              <Text style={[styles.leagueName, league === item.code && styles.leagueNameSelected]}>
                {item.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Upcoming fixtures</Text>
            <Text style={styles.sectionSubtitle}>
              {loading ? 'Checking the match list…' : `${fixtures.length} ${fixtures.length === 1 ? 'match' : 'matches'} found`}
            </Text>
          </View>
          {loading && <ActivityIndicator color={COLORS.green} />}
        </View>

        {error ? (
          <View style={styles.messageCard}>
            <Text style={styles.messageTitle}>Couldn’t load match data</Text>
            <Text style={styles.messageText}>{error}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setRefreshKey((current) => current + 1)}
              style={styles.retryButton}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : loading && !data ? (
          <View style={styles.messageCard}>
            <ActivityIndicator color={COLORS.green} />
            <Text style={styles.messageText}>Loading matchday data…</Text>
          </View>
        ) : fixtures.length ? (
          fixtures.map((fixture) => (
            <FixtureCard
              key={fixture.id}
              fixture={fixture}
              history={data?.history ?? []}
              competition={data?.competition ?? ''}
              demo={data?.source === 'demo'}
            />
          ))
        ) : (
          <View style={styles.messageCard}>
            <Text style={styles.messageTitle}>No fixtures on this date</Text>
            <Text style={styles.messageText}>
              Try another day or competition. The live feed only shows matches available from the
              selected league.
            </Text>
          </View>
        )}

        {data?.source === 'demo' && (
          <View style={styles.demoNotice}>
            <Text style={styles.demoNoticeTitle}>Sample data · not live fixtures</Text>
            <Text style={styles.demoNoticeCopy}>
              Connect the server and add your football-data.org API token to see real schedules and
              past scores. See the Model tab for setup steps.
            </Text>
          </View>
        )}

        <View style={styles.bottomNote}>
          <Text style={styles.bottomNoteText}>
            Estimates only · Not betting advice · Past performance is not a guarantee
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: COLORS.background, flex: 1 },
  content: { alignSelf: 'center', maxWidth: 560, paddingBottom: 38, paddingHorizontal: 20, width: '100%' },
  topLine: { alignItems: 'center', flexDirection: 'row', paddingTop: 13 },
  brandMark: { alignItems: 'center', backgroundColor: COLORS.green, borderRadius: 12, height: 36, justifyContent: 'center', width: 36 },
  brandIcon: { color: COLORS.background, fontSize: 19, fontWeight: '900' },
  brandWords: { marginLeft: 10 },
  brand: { color: COLORS.text, fontSize: 13, fontWeight: '900', letterSpacing: 1.8 },
  brandSub: { color: COLORS.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1.3, marginTop: 3 },
  liveBadge: { alignItems: 'center', borderColor: COLORS.border, borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 6, marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 7 },
  liveDot: { backgroundColor: COLORS.green, borderRadius: 4, height: 6, width: 6 },
  liveLabel: { color: COLORS.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  hero: { paddingBottom: 20, paddingTop: 39 },
  kicker: { color: COLORS.green, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  title: { color: COLORS.text, fontSize: 39, fontWeight: '800', letterSpacing: -1.6, lineHeight: 44, marginTop: 13 },
  heroCopy: { color: COLORS.muted, fontSize: 13, lineHeight: 20, marginTop: 12, maxWidth: 340 },
  heroMeta: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 20 },
  metaDot: { backgroundColor: COLORS.green, borderRadius: 3, height: 6, width: 6 },
  metaText: { color: COLORS.text, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  metaDivider: { color: COLORS.muted, fontSize: 11 },
  dateSwitch: { alignSelf: 'flex-start', backgroundColor: COLORS.panel, borderColor: COLORS.border, borderRadius: 13, borderWidth: 1, flexDirection: 'row', padding: 3 },
  dateOption: { borderRadius: 10, paddingHorizontal: 18, paddingVertical: 9 },
  dateOptionSelected: { backgroundColor: '#26342B' },
  dateOptionText: { color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  dateOptionTextSelected: { color: COLORS.green },
  leagues: { gap: 8, paddingBottom: 22, paddingTop: 17 },
  leagueChip: { alignItems: 'center', backgroundColor: COLORS.panel, borderColor: COLORS.border, borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 11, paddingVertical: 9 },
  leagueChipSelected: { backgroundColor: '#1D2A22', borderColor: '#6E914A' },
  leagueTag: { color: COLORS.muted, fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  leagueTagSelected: { color: COLORS.green },
  leagueName: { color: COLORS.muted, fontSize: 10, fontWeight: '700' },
  leagueNameSelected: { color: COLORS.text },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 13 },
  sectionTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  sectionSubtitle: { color: COLORS.muted, fontSize: 10, marginTop: 4 },
  messageCard: { alignItems: 'center', backgroundColor: COLORS.panel, borderColor: COLORS.border, borderRadius: 19, borderWidth: 1, gap: 10, paddingHorizontal: 20, paddingVertical: 23 },
  messageTitle: { color: COLORS.text, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  messageText: { color: COLORS.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  retryButton: { backgroundColor: '#203025', borderRadius: 10, marginTop: 2, paddingHorizontal: 15, paddingVertical: 9 },
  retryText: { color: COLORS.green, fontSize: 11, fontWeight: '800' },
  demoNotice: { backgroundColor: '#231F15', borderColor: '#54462B', borderRadius: 15, borderWidth: 1, marginTop: 1, padding: 14 },
  demoNoticeTitle: { color: COLORS.amber, fontSize: 11, fontWeight: '800' },
  demoNoticeCopy: { color: '#B4A98E', fontSize: 10, lineHeight: 15, marginTop: 5 },
  bottomNote: { alignItems: 'center', borderTopColor: COLORS.border, borderTopWidth: 1, marginTop: 21, paddingTop: 15 },
  bottomNoteText: { color: COLORS.muted, fontSize: 9, textAlign: 'center' },
});
