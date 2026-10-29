import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { PALETTE } from '@/constants/palette';

function money(value: number) {
  const rounded = Math.round(value);
  return `${rounded < 0 ? '−' : rounded > 0 ? '+' : ''}${Math.abs(rounded).toLocaleString()}`;
}

function percent(value: number) {
  const rounded = Math.round(value * 1000) / 10;
  return rounded < 0.1 && value > 0 ? 'under 0.1%' : `${rounded}%`;
}

const ROLLOVER_DAYS = [5, 10, 30];

/**
 * Shows what staking on the slip really means, using the app's own numbers. The slip only wins if
 * every pick wins, and a rollover (staking the winnings again the next day) must win every single
 * day: one loss ends it and takes the whole pot.
 */
export function StakePanel({ odds, chance, legs }: { odds: number; chance: number; legs: number }) {
  const [text, setText] = useState('1000');
  const stake = Math.max(0, Number(text.replace(/[^0-9.]/g, '')) || 0);

  const winProfit = stake * (odds - 1);
  const expectedPerDay = stake * (chance * odds - 1);
  const breakEven = 1 / odds;
  const negative = expectedPerDay < 0;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>What staking on this slip means</Text>
      <View style={styles.inputRow}>
        <Text style={styles.label}>Example stake</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          keyboardType="numeric"
          accessibilityLabel="Example stake"
          style={styles.input}
        />
      </View>

      <View style={styles.row}>
        <Text style={styles.rowLabel}>If all {legs} {legs === 1 ? 'pick wins' : 'picks win'}</Text>
        <Text style={[styles.rowValue, { color: PALETTE.positive }]}>{money(winProfit)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>If any one loses</Text>
        <Text style={[styles.rowValue, { color: PALETTE.negative }]}>{money(-stake)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Chance every pick wins (model)</Text>
        <Text style={styles.rowValue}>{percent(chance)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Chance needed just to break even</Text>
        <Text style={styles.rowValue}>{percent(breakEven)}</Text>
      </View>
      <View style={[styles.row, styles.rowLast]}>
        <Text style={styles.rowLabel}>Average result per day</Text>
        <Text style={[styles.rowValue, { color: negative ? PALETTE.negative : PALETTE.positive }]}>
          {money(expectedPerDay)}
        </Text>
      </View>

      <Text style={styles.heading}>If you roll the winnings over every day</Text>
      {ROLLOVER_DAYS.map((days) => (
        <View key={days} style={styles.row}>
          <Text style={styles.rowLabel}>
            Chance of winning {days} days in a row
          </Text>
          <Text style={styles.rowValue}>{percent(chance ** days)}</Text>
        </View>
      ))}
      <Text style={styles.note}>
        A rollover ends the first day a pick loses, and it takes the whole pot with it. After 5 wins in a
        row a stake of {Math.round(stake).toLocaleString()} would be {Math.round(stake * odds ** 5).toLocaleString()}, but
        the chance of getting there is {percent(chance ** 5)}.{' '}
        {negative
          ? 'On these numbers the average result is a loss, even though many days win.'
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
  heading: { color: PALETTE.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 16, textTransform: 'uppercase' },
  note: { color: PALETTE.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  responsible: { color: PALETTE.faint, fontSize: 12, lineHeight: 18, marginTop: 12 },
});
