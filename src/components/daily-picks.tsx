import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatPercent } from '@/features/markets';
import type { Brief } from '@/features/pipeline';
import { combinedStats } from '@/features/picks';

const COLORS = {
  text: '#141518',
  muted: '#6B7280',
  border: '#E4E6EA',
  accent: '#E41827',
  amber: '#B45309',
  green: '#1F8A4C',
  panel: '#F5F6F8',
};

const TIER_COLOR: Record<string, string> = {
  STRONG: COLORS.green,
  SOLID: COLORS.accent,
  LEAN: COLORS.amber,
};

export function DailyPicks({ brief }: { brief?: Brief }) {
  const [open, setOpen] = useState<string>();
  const picks = brief?.picks ?? [];
  const stats = picks.length ? combinedStats(picks) : undefined;
  const track = brief?.track;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.label}>
          <View style={styles.dot} />
          <Text style={styles.kicker}>TODAY’S 3 BEST-SUPPORTED PICKS</Text>
        </View>
        <Text style={styles.stage}>
          {!brief ? 'ANALYSING' : brief.stage === 'market' ? 'PRELIMINARY' : brief.picksLocked ? 'LOCKED' : 'FULL MODEL'}
        </Text>
      </View>
      <Text style={styles.title}>Odds model shortlist</Text>
      <Text style={styles.description}>
        Bookmaker prices are de-vigged and inverted into expected goals, blended with team ratings
        from the last 45 days of results, then corrected using how past predictions actually
        finished.
      </Text>

      {brief?.stage === 'market' && (
        <Text style={styles.notice}>
          Loading 45 days of results to finish the stats model — picks may change in a moment.
        </Text>
      )}

      {picks.map((pick, index) => {
        const expanded = open === pick.fixtureId;
        return (
          <Pressable
            key={pick.fixtureId}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            onPress={() => setOpen(expanded ? undefined : pick.fixtureId)}
            style={styles.leg}>
            <View style={styles.legTop}>
              <View style={styles.number}>
                <Text style={styles.numberText}>{index + 1}</Text>
              </View>
              <View style={styles.legInfo}>
                <Text style={styles.teams} numberOfLines={1}>{pick.home} vs {pick.away}</Text>
                <Text style={styles.selection} numberOfLines={1}>{pick.label}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {pick.competition} ·{' '}
                  {new Date(pick.utcDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <View style={styles.priceBox}>
                <Text style={styles.price}>{pick.odds.toFixed(2)}</Text>
                <Text style={styles.priceNote}>{pick.priceIsEstimate ? 'EST. PRICE' : 'BOOK PRICE'}</Text>
              </View>
            </View>
            <View style={styles.chips}>
              <Text style={[styles.chip, { color: TIER_COLOR[pick.tier] ?? COLORS.muted }]}>{pick.tier}</Text>
              <Text style={styles.chip}>{formatPercent(pick.probability)} chance</Text>
              {pick.edge !== undefined && (
                <Text style={[styles.chip, pick.edge >= 0 && { color: COLORS.green }]}>
                  {pick.edge >= 0 ? '+' : ''}{(pick.edge * 100).toFixed(1)}% value
                </Text>
              )}
              <Text style={styles.more}>{expanded ? 'Hide ▴' : 'Why ▾'}</Text>
            </View>
            {expanded && (
              <View style={styles.reasons}>
                {pick.reasons.map((reason) => (
                  <Text key={reason} style={styles.reason}>• {reason}</Text>
                ))}
              </View>
            )}
          </Pressable>
        );
      })}

      {brief && !picks.length && (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No selection cleared the bar</Text>
          <Text style={styles.emptyCopy}>
            Nothing today had both enough evidence and at least a 60% conservative chance at a
            worthwhile price. Skipping is a valid outcome.
          </Text>
        </View>
      )}

      {stats && picks.length > 1 && (
        <View style={styles.combined}>
          <View>
            <Text style={styles.combinedCaption}>ALL {picks.length} COMBINED</Text>
            <Text style={styles.combinedSub}>
              {formatPercent(stats.chance)} chance if independent
            </Text>
          </View>
          <Text style={styles.combinedPrice}>{stats.odds.toFixed(2)}</Text>
        </View>
      )}

      {track && track.picksSettled > 0 && (
        <Text style={styles.track}>
          Track record: {track.picksWon}/{track.picksSettled} settled picks won (model expected{' '}
          {formatPercent(track.picksAverageProbability)}).
        </Text>
      )}

      <Text style={styles.disclaimer}>
        No pick is guaranteed — even a 75% selection loses one time in four. Prices marked EST. are
        model-derived, not bookmaker quotes. For information only, not betting advice.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderColor: '#F3C7CB', borderRadius: 19, borderWidth: 1, marginBottom: 24, padding: 15 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  label: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  dot: { backgroundColor: COLORS.accent, borderRadius: 4, height: 7, width: 7 },
  kicker: { color: COLORS.accent, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  stage: { borderColor: '#F3C7CB', borderRadius: 9, borderWidth: 1, color: COLORS.amber, fontSize: 8, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 4 },
  title: { color: COLORS.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.5, marginTop: 13 },
  description: { color: COLORS.muted, fontSize: 10, lineHeight: 15, marginTop: 5 },
  notice: { color: COLORS.amber, fontSize: 9, lineHeight: 14, marginTop: 8 },
  leg: { borderBottomColor: COLORS.border, borderBottomWidth: 1, paddingVertical: 12 },
  legTop: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  number: { alignItems: 'center', backgroundColor: '#FDEBEC', borderRadius: 7, height: 22, justifyContent: 'center', width: 22 },
  numberText: { color: COLORS.accent, fontSize: 10, fontWeight: '900' },
  legInfo: { flex: 1, gap: 3 },
  teams: { color: COLORS.text, fontSize: 11, fontWeight: '700' },
  selection: { color: COLORS.accent, fontSize: 12, fontWeight: '800' },
  meta: { color: COLORS.muted, fontSize: 9 },
  priceBox: { alignItems: 'flex-end' },
  price: { color: COLORS.accent, fontSize: 16, fontWeight: '900' },
  priceNote: { color: COLORS.muted, fontSize: 7, fontWeight: '800', letterSpacing: 0.6, marginTop: 2 },
  chips: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginLeft: 32, marginTop: 8 },
  chip: { color: COLORS.muted, fontSize: 9, fontWeight: '800' },
  more: { color: COLORS.accent, fontSize: 9, fontWeight: '800', marginLeft: 'auto' },
  reasons: { backgroundColor: COLORS.panel, borderRadius: 10, gap: 5, marginLeft: 32, marginTop: 10, padding: 10 },
  reason: { color: '#4B5563', fontSize: 9, lineHeight: 14 },
  empty: { backgroundColor: COLORS.panel, borderRadius: 12, marginTop: 13, padding: 12 },
  emptyTitle: { color: COLORS.amber, fontSize: 11, fontWeight: '800' },
  emptyCopy: { color: COLORS.muted, fontSize: 10, lineHeight: 15, marginTop: 5 },
  combined: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingTop: 13 },
  combinedCaption: { color: COLORS.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  combinedSub: { color: COLORS.muted, fontSize: 8, marginTop: 4 },
  combinedPrice: { color: COLORS.accent, fontSize: 25, fontWeight: '900', letterSpacing: -0.5 },
  track: { color: COLORS.text, fontSize: 9, fontWeight: '700', lineHeight: 14, marginTop: 12 },
  disclaimer: { color: '#8A8F98', fontSize: 9, lineHeight: 14, marginTop: 11 },
});
