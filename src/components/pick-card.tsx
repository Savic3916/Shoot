import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PALETTE } from '@/constants/palette';
import { formatPercent } from '@/features/markets';
import type { Pick } from '@/features/picks';

const TIER_COLOR: Record<string, string> = {
  STRONG: PALETTE.positive,
  SOLID: PALETTE.primary,
  LEAN: PALETTE.caution,
};

export function PickCard({ pick, index }: { pick: Pick; index: number }) {
  const [open, setOpen] = useState(false);
  const tier = TIER_COLOR[pick.tier] ?? PALETTE.muted;
  const kickoff = new Date(pick.utcDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{index + 1}</Text>
        </View>
        <Text style={styles.family}>{pick.family || 'BET'}</Text>
        <View style={styles.priceBox}>
          <Text style={styles.price}>{pick.odds.toFixed(2)}</Text>
          <Text style={styles.priceNote}>{pick.priceIsEstimate ? 'estimated odds' : 'bookmaker odds'}</Text>
        </View>
      </View>

      <Text style={styles.selection}>{pick.label}</Text>
      <Text style={styles.match}>{pick.home} vs {pick.away}</Text>
      <Text style={styles.meta}>{pick.competition} · {kickoff}</Text>

      <View style={styles.predicted}>
        <Text style={styles.predictedLabel}>Predicted score</Text>
        <Text style={styles.predictedValue}>
          {pick.predictedScore ? pick.predictedScore.replace('-', ' – ') : '—'}
        </Text>
      </View>

      <View style={styles.meterRow}>
        <Text style={styles.meterLabel}>Model chance</Text>
        <Text style={[styles.meterValue, { color: tier }]}>{formatPercent(pick.probability)}</Text>
        <Text style={[styles.tier, { color: tier, borderColor: tier }]}>{pick.tier}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { backgroundColor: tier, width: `${Math.round(pick.probability * 100)}%` }]} />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        hitSlop={8}>
        <Text style={styles.toggle}>{open ? 'Hide reasoning' : 'Why this bet'}</Text>
      </Pressable>
      {open && (
        <View style={styles.reasons}>
          {pick.reasons.map((reason) => (
            <Text key={reason} style={styles.reason}>{reason}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: PALETTE.background,
    borderColor: PALETTE.hairline,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 14,
    padding: 18,
    shadowColor: '#14212B',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
  },
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
  predicted: { alignItems: 'center', backgroundColor: PALETTE.surface, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, paddingHorizontal: 14, paddingVertical: 10 },
  predictedLabel: { color: PALETTE.muted, fontSize: 13 },
  predictedValue: { color: PALETTE.ink, fontSize: 17, fontWeight: '700' },
  meterRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 16 },
  meterLabel: { color: PALETTE.muted, flex: 1, fontSize: 13 },
  meterValue: { fontSize: 17, fontWeight: '700' },
  tier: { borderRadius: 8, borderWidth: 1, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3 },
  track: { backgroundColor: PALETTE.surface, borderRadius: 4, height: 6, marginTop: 8, overflow: 'hidden' },
  fill: { borderRadius: 4, height: 6 },
  toggle: { color: PALETTE.primary, fontSize: 14, fontWeight: '600', marginTop: 16 },
  reasons: { gap: 8, marginTop: 10 },
  reason: { color: PALETTE.muted, fontSize: 13, lineHeight: 19 },
});
