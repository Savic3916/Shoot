import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { PALETTE } from '@/constants/palette';

const DAYS = 30;

function money(value: number) {
  const rounded = Math.round(value);
  return `${rounded < 0 ? '−' : rounded > 0 ? '+' : ''}${Math.abs(rounded).toLocaleString()}`;
}

/**
 * Shows what staking on all three picks really means, using the app's own numbers. Low odds make
 * a high hit rate misleading: the three picks must ALL win, and one loss wipes out the profit
 * of several winning days.
 */
export function StakePanel({ odds, chance }: { odds: number; chance: number }) {
  const [text, setText] = useState('1000');
  const stake = Math.max(0, Number(text.replace(/[^0-9.]/g, '')) || 0);

  const winProfit = stake * (odds - 1);
  const expectedPerDay = stake * (chance * odds - 1);
  const losingDays = DAYS * (1 - chance);
  const anyLossIn30 = 1 - chance ** DAYS;
  const breakEven = 1 / odds;
  const negative = expectedPerDay < 0;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>What staking on all three means</Text>
      <View style={styles.inputRow}>
        <Text style={styles.label}>Example stake per day</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          keyboardType="numeric"
          accessibilityLabel="Example stake per day"
          style={styles.input}
        />
      </View>

      <View style={styles.row}>
        <Text style={styles.rowLabel}>If all three win</Text>
        <Text style={[styles.rowValue, { color: PALETTE.positive }]}>{money(winProfit)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>If any one loses</Text>
        <Text style={[styles.rowValue, { color: PALETTE.negative }]}>{money(-stake)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Chance all three win (model)</Text>
        <Text style={styles.rowValue}>{Math.round(chance * 100)}%</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Chance needed just to break even</Text>
        <Text style={styles.rowValue}>{Math.round(breakEven * 100)}%</Text>
      </View>
      <View style={[styles.row, styles.rowLast]}>
        <Text style={styles.rowLabel}>Average result per day</Text>
        <Text style={[styles.rowValue, { color: negative ? PALETTE.negative : PALETTE.positive }]}>
          {money(expectedPerDay)}
        </Text>
      </View>

      <Text style={styles.note}>
        Played every day for {DAYS} days you would expect about {Math.round(losingDays)} losing days, and
        a {Math.round(anyLossIn30 * 100)}% chance of at least one. Each losing day costs the whole stake, while a
        winning day pays only {money(winProfit)}.{' '}
        {negative
          ? 'On these numbers the average result is a loss, even though most days win.'
          : 'This is only positive if real bookmaker prices match the estimated odds, which they usually do not: bookmakers take a margin on every leg.'}
      </Text>
      <Text style={styles.responsible}>
        18+ only. Never stake money you cannot afford to lose, and never raise stakes to win back a loss.
        If betting stops being fun, take a break and speak to a support service in your country.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: PALETTE.surface, borderRadius: 20, marginTop: 14, padding: 18 },
  title: { color: PALETTE.ink, fontSize: 16, fontWeight: '700' },
  inputRow: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', marginTop: 12 },
  label: { color: PALETTE.muted, flex: 1, fontSize: 13 },
  input: { backgroundColor: PALETTE.background, borderColor: PALETTE.hairline, borderRadius: 10, borderWidth: 1, color: PALETTE.ink, fontSize: 16, fontWeight: '700', minWidth: 110, paddingHorizontal: 12, paddingVertical: 8, textAlign: 'right' },
  row: { alignItems: 'center', borderBottomColor: PALETTE.hairline, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { color: PALETTE.muted, flex: 1, fontSize: 13 },
  rowValue: { color: PALETTE.ink, fontSize: 15, fontWeight: '700' },
  note: { color: PALETTE.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  responsible: { color: PALETTE.faint, fontSize: 12, lineHeight: 18, marginTop: 12 },
});
