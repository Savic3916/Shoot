import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PALETTE } from '@/constants/palette';
import type { HoopPick } from '@/features/basketball-picks';
import { formatPercent } from '@/features/markets';

const RESULT_COLOR = { won: PALETTE.positive, lost: PALETTE.negative } as const;

export function HoopCard({ pick, index }: { pick: HoopPick; index: number }) {
  const [open, setOpen] = useState(false);
  const color = pick.chance >= 0.75 ? PALETTE.positive : pick.chance >= 0.62 ? PALETTE.primary : PALETTE.caution;
  const tipoff = new Date(pick.utcDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{index + 1}</Text>
        </View>
        <Text style={styles.family}>{pick.league.toUpperCase()} · TO WIN</Text>
        <View style={styles.priceBox}>
          <Text style={styles.price}>{pick.odds.toFixed(2)}</Text>
          <Text style={styles.priceNote}>{pick.provider} odds</Text>
        </View>
      </View>

      <Text style={styles.selection}>{pick.team} to win</Text>
      <Text style={styles.match}>{pick.awayTeam} at {pick.homeTeam}</Text>
      <Text style={styles.meta}>
        Tip-off {tipoff}
        {pick.teamRecord && pick.opponentRecord ? ` · records ${pick.teamRecord} vs ${pick.opponentRecord}` : ''}
      </Text>

      <View style={styles.meterRow}>
        <Text style={styles.meterLabel}>Chance to win</Text>
        <Text style={[styles.meterValue, { color }]}>{formatPercent(pick.chance)}</Text>
        {pick.result && (
          <Text style={[styles.result, { color: RESULT_COLOR[pick.result], borderColor: RESULT_COLOR[pick.result] }]}>
            {pick.result.toUpperCase()}
          </Text>
        )}
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { backgroundColor: color, width: `${Math.round(pick.chance * 100)}%` }]} />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={[styles.dropdown, open && styles.dropdownOpen]}>
        <Text style={styles.dropdownText}>{open ? 'Hide why' : 'Why this pick'}</Text>
        <Text style={styles.chevron}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {open && (
        <View style={styles.panel}>
          {pick.reasons.map((reason) => (
            <Text key={reason} style={styles.reason}>{reason}</Text>
          ))}
          <Text style={styles.reason}>
            Bet on the match winner including overtime (often called “Home/Away” or “Winner incl. OT”), not the
            3-way result, where a draw after four quarters loses.
          </Text>
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
  meterRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 16 },
  meterLabel: { color: PALETTE.muted, flex: 1, fontSize: 13 },
  meterValue: { fontSize: 17, fontWeight: '700' },
  result: { borderRadius: 8, borderWidth: 1, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3 },
  track: { backgroundColor: PALETTE.surface, borderRadius: 4, height: 6, marginTop: 8, overflow: 'hidden' },
  fill: { borderRadius: 4, height: 6 },
  dropdown: { alignItems: 'center', backgroundColor: PALETTE.primarySoft, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, paddingHorizontal: 14, paddingVertical: 12 },
  dropdownOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  dropdownText: { color: PALETTE.primary, fontSize: 14, fontWeight: '700' },
  chevron: { color: PALETTE.primary, fontSize: 14 },
  panel: { borderColor: PALETTE.primarySoft, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, borderWidth: 1, borderTopWidth: 0, gap: 8, padding: 12 },
  reason: { color: PALETTE.muted, fontSize: 13, lineHeight: 19 },
});
