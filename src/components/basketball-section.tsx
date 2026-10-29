import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { PALETTE } from '@/constants/palette';
import { buildBasketballBrief, type BasketballBrief, type BasketballPick } from '@/features/basketball-pipeline';

type State = { key: string; brief?: BasketballBrief; error?: string };

function BasketballCard({ pick, index }: { pick: BasketballPick; index: number }) {
  const [open, setOpen] = useState(false);
  const time = new Date(pick.utcDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.badge}><Text style={styles.badgeText}>{index + 1}</Text></View>
        <Text style={styles.family}>NBA · SAFE HANDICAP</Text>
        <View style={styles.priceBox}>
          <Text style={styles.price}>{pick.odds.toFixed(2)}</Text>
          <Text style={styles.priceNote}>estimated odds</Text>
        </View>
      </View>
      <Text style={styles.selection}>{pick.label}</Text>
      <Text style={styles.match}>{pick.home} vs {pick.away}</Text>
      <Text style={styles.meta}>
        Expected margin {pick.expectedMargin.toFixed(1)} · {time}
        {Date.parse(pick.utcDate) <= Date.now() ? ' · already started' : ''}
      </Text>

      <View style={styles.meterRow}>
        <Text style={styles.meterLabel}>Model chance</Text>
        <Text style={styles.meterValue}>{Math.round(pick.probability * 1000) / 10}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(pick.probability * 100)}%` }]} />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={[styles.dropdown, open && styles.dropdownOpen]}>
        <Text style={styles.dropdownText}>{open ? 'Hide full analysis' : 'See the full analysis'}</Text>
        <Text style={styles.chevron}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {open && (
        <View style={styles.panel}>
          {pick.reasons.map((reason) => (
            <View key={reason} style={styles.bulletRow}>
              <View style={styles.bullet} />
              <Text style={styles.body}>{reason}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** NBA bets for one day. Locked once made, so they never change. */
export function BasketballSection({
  date,
  timezone,
  refreshKey,
}: {
  date: string;
  timezone: string;
  refreshKey: number;
}) {
  const requestKey = `${date}:${timezone}:${refreshKey}`;
  const [state, setState] = useState<State>();

  useEffect(() => {
    const controller = new AbortController();
    buildBasketballBrief(date, timezone, controller.signal)
      .then((brief) => {
        if (!controller.signal.aborted) setState({ key: requestKey, brief });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setState({ key: requestKey, error: reason instanceof Error ? reason.message : 'Unable to load basketball.' });
      });
    return () => controller.abort();
  }, [date, timezone, requestKey]);

  const current = state?.key === requestKey ? state : undefined;
  const brief = current?.brief;

  return (
    <View style={styles.wrap}>
      {current?.error ? (
        <Text style={styles.empty}>{current.error}</Text>
      ) : !brief ? (
        <View style={styles.loading}>
          <ActivityIndicator color={PALETTE.primary} />
          <Text style={styles.empty}>Checking NBA games, injuries and rest…</Text>
        </View>
      ) : (
        <>
          {brief.picks.map((pick, index) => (
            <BasketballCard key={pick.gameId} pick={pick} index={index} />
          ))}
          {!brief.picks.length && (
            <View style={styles.notice}>
              <Text style={styles.noticeTitle}>No safe basketball bet either</Text>
              <Text style={styles.empty}>
                {brief.gamesChecked
                  ? `We checked ${brief.gamesChecked} NBA games. None was lopsided enough with both teams rested and every key player clear of the injury report.`
                  : 'No NBA games with pre-game prices were found for this day.'}{' '}
                Skipping today is the safe choice.
              </Text>
            </View>
          )}
          {brief.track.settled > 0 && (
            <Text style={styles.record}>
              Basketball track record: {brief.track.won} of {brief.track.settled} settled bets won.
            </Text>
          )}
          <Text style={styles.disclaimer}>
            These are wide handicaps: the favourite only has to avoid losing by a large margin. Odds are
            estimates, and many bookmakers do not list alternate spreads this wide, so check before
            betting. Nothing here is guaranteed.
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {},
  loading: { alignItems: 'center', gap: 10, paddingVertical: 30 },
  empty: { color: PALETTE.muted, fontSize: 14, lineHeight: 20 },
  notice: { backgroundColor: PALETTE.surface, borderRadius: 16, padding: 18 },
  noticeTitle: { color: PALETTE.ink, fontSize: 16, fontWeight: '700', marginBottom: 6 },
  card: { backgroundColor: PALETTE.background, borderColor: PALETTE.hairline, borderRadius: 20, borderWidth: 1, marginBottom: 14, padding: 18, shadowColor: '#14212B', shadowOffset: { height: 4, width: 0 }, shadowOpacity: 0.05, shadowRadius: 14 },
  topRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  badge: { alignItems: 'center', backgroundColor: PALETTE.primarySoft, borderRadius: 10, height: 28, justifyContent: 'center', width: 28 },
  badgeText: { color: PALETTE.primary, fontSize: 14, fontWeight: '700' },
  family: { color: PALETTE.muted, flex: 1, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  priceBox: { alignItems: 'flex-end' },
  price: { color: PALETTE.primary, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  priceNote: { color: PALETTE.faint, fontSize: 11, marginTop: -2 },
  selection: { color: PALETTE.ink, fontSize: 22, fontWeight: '700', letterSpacing: -0.4, marginTop: 14 },
  match: { color: PALETTE.ink, fontSize: 15, marginTop: 4 },
  meta: { color: PALETTE.muted, fontSize: 13, marginTop: 2 },
  meterRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 16 },
  meterLabel: { color: PALETTE.muted, flex: 1, fontSize: 13 },
  meterValue: { color: PALETTE.positive, fontSize: 17, fontWeight: '700' },
  track: { backgroundColor: PALETTE.surface, borderRadius: 4, height: 6, marginTop: 8, overflow: 'hidden' },
  fill: { backgroundColor: PALETTE.positive, borderRadius: 4, height: 6 },
  dropdown: { alignItems: 'center', backgroundColor: PALETTE.primarySoft, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, paddingHorizontal: 14, paddingVertical: 12 },
  dropdownOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  dropdownText: { color: PALETTE.primary, fontSize: 14, fontWeight: '700' },
  chevron: { color: PALETTE.primary, fontSize: 14 },
  panel: { borderColor: PALETTE.primarySoft, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, borderTopWidth: 0, borderWidth: 1, gap: 10, padding: 12 },
  bulletRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  bullet: { backgroundColor: PALETTE.primary, borderRadius: 3, height: 6, marginTop: 7, width: 6 },
  body: { color: PALETTE.muted, flex: 1, fontSize: 14, lineHeight: 20 },
  record: { color: PALETTE.ink, fontSize: 13, lineHeight: 19, marginTop: 8 },
  disclaimer: { color: PALETTE.faint, fontSize: 12, lineHeight: 18, marginTop: 16 },
});
