import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MatchAnalysis } from '@/features/analysis';
import type { FootballMatch } from '@/features/football-data';
import { formatPercent } from '@/features/markets';

const COLORS = {
  text: '#141518',
  muted: '#6B7280',
  border: '#E4E6EA',
  accent: '#E41827',
  amber: '#B45309',
  green: '#1F8A4C',
  panel: '#F5F6F8',
};

const SHOWN = ['dc1x', 'dcx2', 'o15', 'o25', 'u25', 'o35', 'btts', 'nobtts'];

function ResultBar({ analysis, fixture }: { analysis: MatchAnalysis; fixture: FootballMatch }) {
  const { home, draw, away } = analysis.probs;
  return (
    <View>
      <View style={styles.bar}>
        <View style={[styles.segment, { backgroundColor: COLORS.accent, flex: home }]} />
        <View style={[styles.segment, { backgroundColor: '#B8BCC4', flex: draw }]} />
        <View style={[styles.segment, { backgroundColor: '#3B4252', flex: away }]} />
      </View>
      <View style={styles.barLabels}>
        <Text style={styles.barLabel} numberOfLines={1}>{fixture.homeTeam} {formatPercent(home)}</Text>
        <Text style={styles.barLabel}>Draw {formatPercent(draw)}</Text>
        <Text style={[styles.barLabel, styles.right]} numberOfLines={1}>{formatPercent(away)} {fixture.awayTeam}</Text>
      </View>
    </View>
  );
}

export function MatchAnalysisPanel({
  analysis,
  fixture,
}: {
  analysis?: MatchAnalysis;
  fixture: FootballMatch;
}) {
  const [open, setOpen] = useState(false);
  if (!analysis) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>ANALYSIS</Text>
        <Text style={styles.empty}>
          No bookmaker prices and too little recent data for one of these teams, so no estimate is
          shown.
        </Text>
      </View>
    );
  }

  const book = analysis.lines.filter((line) => line.bookOdds);
  const extra = analysis.lines.filter((line) => SHOWN.includes(line.key) && !line.bookOdds);
  const sources = [analysis.hasMarket && 'BOOKMAKER', analysis.hasStats && 'RATINGS'].filter(Boolean).join(' + ');

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>ANALYSIS · {sources}</Text>
        <Text style={styles.quality}>EVIDENCE {Math.round(analysis.quality * 100)}%</Text>
      </View>
      <ResultBar analysis={analysis} fixture={fixture} />
      <Text style={styles.xg}>
        Expected goals {analysis.expectedGoals.home.toFixed(2)} – {analysis.expectedGoals.away.toFixed(2)}
        {' · '}Over 2.5 {formatPercent(analysis.probs.o25)} · BTTS {formatPercent(analysis.probs.btts)}
      </Text>

      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Text style={styles.toggle}>{open ? 'Hide detail ▴' : 'Show prices, value and reasoning ▾'}</Text>
      </Pressable>

      {open && (
        <View style={styles.detail}>
          {book.length > 0 && (
            <>
              <Text style={styles.sub}>BOOKMAKER MARKETS · MODEL VS PRICE</Text>
              {book.map((line) => (
                <View key={line.key} style={styles.row}>
                  <Text style={styles.rowLabel} numberOfLines={1}>{line.label}</Text>
                  <Text style={styles.rowValue}>{formatPercent(line.probability)}</Text>
                  <Text style={styles.rowValue}>{line.bookOdds!.toFixed(2)}</Text>
                  <Text style={[styles.rowValue, (line.edge ?? 0) > 0 && { color: COLORS.green }]}>
                    {(line.edge ?? 0) >= 0 ? '+' : ''}{((line.edge ?? 0) * 100).toFixed(1)}%
                  </Text>
                </View>
              ))}
              <Text style={styles.legend}>chance · price · expected value</Text>
            </>
          )}
          <Text style={styles.sub}>MODEL-PRICED MARKETS</Text>
          {extra.map((line) => (
            <View key={line.key} style={styles.row}>
              <Text style={styles.rowLabel} numberOfLines={1}>{line.label}</Text>
              <Text style={styles.rowValue}>{formatPercent(line.probability)}</Text>
              <Text style={styles.rowValue}>{line.fairOdds.toFixed(2)}</Text>
            </View>
          ))}
          <Text style={styles.legend}>chance · fair price (no margin)</Text>
          {analysis.reasons.map((reason) => (
            <Text key={reason} style={styles.reason}>• {reason}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderTopColor: COLORS.border, borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  titleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 9 },
  title: { color: COLORS.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  quality: { color: COLORS.amber, fontSize: 8, fontWeight: '800' },
  empty: { color: COLORS.muted, fontSize: 9, lineHeight: 14, marginTop: 6 },
  bar: { borderRadius: 4, flexDirection: 'row', gap: 2, height: 8, overflow: 'hidden' },
  segment: { height: 8 },
  barLabels: { flexDirection: 'row', gap: 6, justifyContent: 'space-between', marginTop: 6 },
  barLabel: { color: COLORS.text, flex: 1, fontSize: 9, fontWeight: '700' },
  right: { textAlign: 'right' },
  xg: { color: COLORS.muted, fontSize: 9, marginTop: 8 },
  toggle: { color: COLORS.accent, fontSize: 9, fontWeight: '800', marginTop: 10 },
  detail: { backgroundColor: COLORS.panel, borderRadius: 10, gap: 5, marginTop: 8, padding: 10 },
  sub: { color: COLORS.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.6, marginTop: 4 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  rowLabel: { color: COLORS.text, flex: 1, fontSize: 9 },
  rowValue: { color: COLORS.text, fontSize: 9, fontWeight: '700', minWidth: 40, textAlign: 'right' },
  legend: { color: '#8A8F98', fontSize: 8, textAlign: 'right' },
  reason: { color: '#4B5563', fontSize: 9, lineHeight: 14 },
});
