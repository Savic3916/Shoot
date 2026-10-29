import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { TennisCard } from '@/components/tennis-card';
import { PALETTE } from '@/constants/palette';
import { buildTennisBrief, type TennisBrief } from '@/features/tennis-pipeline';

type State = { key: string; brief?: TennisBrief; error?: string };

/** Tennis bets for one day. Mirrors the football section: locked once made, never changes. */
export function TennisSection({
  date,
  timezone,
  refreshKey,
  onRetry,
}: {
  date: string;
  timezone: string;
  refreshKey: number;
  onRetry: () => void;
}) {
  const requestKey = `${date}:${timezone}:${refreshKey}`;
  const [state, setState] = useState<State>();

  useEffect(() => {
    const controller = new AbortController();
    buildTennisBrief(date, timezone, controller.signal)
      .then((brief) => {
        if (!controller.signal.aborted) setState({ key: requestKey, brief });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          key: requestKey,
          error: reason instanceof Error ? reason.message : 'Unable to load tennis matches.',
        });
      });
    return () => controller.abort();
  }, [date, timezone, requestKey]);

  const current = state?.key === requestKey ? state : undefined;
  const brief = current?.brief;

  if (current?.error) {
    return (
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>Couldn’t reach the tennis feed</Text>
        <Text style={styles.noticeText}>{current.error}</Text>
        <Pressable style={styles.button} onPress={onRetry}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
  if (!brief) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={PALETTE.primary} />
        <Text style={styles.loadingText}>Rating players from the last 90 days…</Text>
        <Text style={styles.loadingHint}>The first run downloads recent results; after that it’s quick.</Text>
      </View>
    );
  }

  const { picks, track } = brief;
  return (
    <View>
      {picks.map((pick, index) => (
        <TennisCard key={pick.matchId} pick={pick} index={index} />
      ))}

      {!picks.length && (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>No safe tennis bet today</Text>
          <Text style={styles.noticeText}>
            {brief.matchesAnalysed
              ? `We checked ${brief.matchesAnalysed} singles matches. None had a favourite rated at least 95% to win a set who has also won a set in every recent match.`
              : 'No ATP or WTA singles matches were found for this day.'}{' '}
            Passing on a day is part of keeping the win rate high.
          </Text>
        </View>
      )}

      {track.settled > 0 && (
        <Text style={styles.record}>
          Track record: {track.won} of {track.settled} settled tennis bets won.
        </Text>
      )}

      <Text style={styles.disclaimer}>
        A “wins at least one set” bet is far safer than picking the match winner, but it is not
        guaranteed: an upset, injury or retirement can lose it. Tested on 100 days of past ATP and
        WTA matches, this rule found 41 bets and all 41 won, on roughly one bet every three days. That
        is a small sample, so expect a few losses over time. Odds are around 1.02–1.05 and are
        estimates; the free feed has no tennis prices. For information only.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', gap: 10, paddingVertical: 60 },
  loadingText: { color: PALETTE.muted, fontSize: 14 },
  loadingHint: { color: PALETTE.faint, fontSize: 12 },
  notice: { backgroundColor: PALETTE.surface, borderRadius: 16, padding: 18 },
  noticeTitle: { color: PALETTE.ink, fontSize: 16, fontWeight: '700' },
  noticeText: { color: PALETTE.muted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  button: { alignSelf: 'flex-start', backgroundColor: PALETTE.primary, borderRadius: 10, marginTop: 14, paddingHorizontal: 18, paddingVertical: 10 },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  record: { color: PALETTE.ink, fontSize: 13, lineHeight: 19, marginTop: 16 },
  disclaimer: { color: PALETTE.faint, fontSize: 12, lineHeight: 18, marginTop: 24 },
});
