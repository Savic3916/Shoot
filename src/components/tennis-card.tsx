import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PALETTE } from '@/constants/palette';
import type { FormEntry, PlayerCard, TennisPick } from '@/features/tennis-pipeline';

const { homeRed, awayBlue } = PALETTE;
const TABS = ['Summary', 'Form', 'Head to head'] as const;
type Tab = (typeof TABS)[number];

const TIER_COLOR = { BANKER: PALETTE.positive, STRONG: PALETTE.primary } as const;

function shortDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function CompareBar({ label, left, right, format }: { label: string; left: number; right: number; format: (v: number) => string }) {
  const total = left + right;
  const share = total > 0 ? left / total : 0.5;
  return (
    <View style={styles.compare}>
      <View style={styles.compareHead}>
        <Text style={[styles.compareValue, { color: homeRed }]}>{format(left)}</Text>
        <Text style={styles.compareLabel}>{label}</Text>
        <Text style={[styles.compareValue, { color: awayBlue }]}>{format(right)}</Text>
      </View>
      <View style={styles.compareTrack}>
        <View style={{ backgroundColor: homeRed, flex: Math.max(share, 0.04) }} />
        <View style={styles.compareGap} />
        <View style={{ backgroundColor: awayBlue, flex: Math.max(1 - share, 0.04) }} />
      </View>
    </View>
  );
}

function winRate(entries: FormEntry[]) {
  return entries.length ? entries.filter((entry) => entry.won).length / entries.length : 0;
}

function setShare(entries: FormEntry[]) {
  const won = entries.reduce((sum, entry) => sum + entry.setsWon, 0);
  const lost = entries.reduce((sum, entry) => sum + entry.setsLost, 0);
  return won + lost ? won / (won + lost) : 0;
}

function FormList({ card, color }: { card: PlayerCard; color: string }) {
  return (
    <View style={styles.block}>
      <View style={styles.playerHead}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={styles.playerName}>{card.name}</Text>
        <Text style={styles.rank}>{card.rank ? `#${card.rank}` : 'unranked'}</Text>
      </View>
      {card.recent.length ? (
        [...card.recent].reverse().map((entry) => (
          <View key={entry.date + entry.opponent} style={styles.formRow}>
            <View style={[styles.chip, { backgroundColor: entry.won ? PALETTE.positive : PALETTE.negative }]}>
              <Text style={styles.chipText}>{entry.won ? 'W' : 'L'}</Text>
            </View>
            <Text style={styles.formOpponent} numberOfLines={1}>vs {entry.opponent}</Text>
            <Text style={styles.formScore}>{entry.score}</Text>
            <Text style={styles.formDate}>{shortDate(entry.date)}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.empty}>No recent tour-level results.</Text>
      )}
    </View>
  );
}

export function TennisCard({ pick, index }: { pick: TennisPick; index: number }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('Summary');
  const { insight } = pick;
  const tier = TIER_COLOR[pick.tier];
  const time = new Date(pick.utcDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const started = Date.parse(pick.utcDate) <= Date.now();

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.badge}><Text style={styles.badgeText}>{index + 1}</Text></View>
        <Text style={styles.family}>{pick.tour.toUpperCase()} · SET BET</Text>
        <View style={styles.priceBox}>
          <Text style={styles.price}>{pick.odds.toFixed(2)}</Text>
          <Text style={styles.priceNote}>estimated odds</Text>
        </View>
      </View>

      <Text style={styles.selection}>{pick.label}</Text>
      <Text style={styles.match}>{pick.playerName} vs {pick.opponentName}</Text>
      <Text style={styles.meta}>
        {pick.tournament}{pick.round ? ` · ${pick.round}` : ''} · {time}{started ? ' · already started' : ''}
      </Text>

      <View style={styles.meterRow}>
        <Text style={styles.meterLabel}>Chance of a set</Text>
        <Text style={[styles.meterValue, { color: tier }]}>{Math.round(pick.probability * 100)}%</Text>
        <Text style={[styles.tier, { color: tier, borderColor: tier }]}>{pick.tier}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { backgroundColor: tier, width: `${Math.round(pick.probability * 100)}%` }]} />
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
          <View style={styles.tabs}>
            {TABS.map((name) => (
              <Pressable
                key={name}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === name }}
                onPress={() => setTab(name)}
                style={[styles.tab, tab === name && styles.tabSelected]}>
                <Text style={[styles.tabText, tab === name && styles.tabTextSelected]}>{name}</Text>
              </Pressable>
            ))}
          </View>

          {tab === 'Summary' && (
            <View style={styles.gap}>
              <Text style={styles.verdict}>{insight.verdict}</Text>
              <Text style={styles.heading}>Why this bet</Text>
              {insight.reasons.map((reason) => (
                <View key={reason} style={styles.bulletRow}>
                  <View style={styles.bullet} />
                  <Text style={styles.body}>{reason}</Text>
                </View>
              ))}
              <Text style={styles.heading}>Side by side</Text>
              <View style={styles.legend}>
                <View style={styles.legendItem}><View style={[styles.legendLine, { backgroundColor: homeRed }]} /><Text style={styles.legendText} numberOfLines={1}>{insight.player.name}</Text></View>
                <View style={styles.legendItem}><View style={[styles.legendLine, { backgroundColor: awayBlue }]} /><Text style={styles.legendText} numberOfLines={1}>{insight.opponent.name}</Text></View>
              </View>
              <CompareBar label="Strength rating" left={insight.player.rating} right={insight.opponent.rating} format={(v) => String(v)} />
              <CompareBar label="Wins, last 5" left={winRate(insight.player.recent)} right={winRate(insight.opponent.recent)} format={(v) => `${Math.round(v * 100)}%`} />
              <CompareBar label="Share of sets won" left={setShare(insight.player.recent)} right={setShare(insight.opponent.recent)} format={(v) => `${Math.round(v * 100)}%`} />
            </View>
          )}

          {tab === 'Form' && (
            <View style={styles.gap}>
              <FormList card={insight.player} color={homeRed} />
              <FormList card={insight.opponent} color={awayBlue} />
            </View>
          )}

          {tab === 'Head to head' && (
            <View style={styles.gap}>
              {insight.h2h.length ? (
                insight.h2h.map((meeting) => (
                  <View key={meeting.date} style={styles.formRow}>
                    <Text style={styles.formDate}>{shortDate(meeting.date)}</Text>
                    <Text
                      style={[styles.formOpponent, { color: meeting.winner === insight.player.name ? homeRed : awayBlue, fontWeight: '700' }]}
                      numberOfLines={1}>
                      {meeting.winner} won
                    </Text>
                    <Text style={styles.formScore}>{meeting.score}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.empty}>No meetings between these two in the last three months.</Text>
              )}
              <Text style={styles.note}>
                Only the last 90 days of tour matches are used. Surface, injuries and fitness are not in the free data.
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
  meterValue: { fontSize: 17, fontWeight: '700' },
  tier: { borderRadius: 8, borderWidth: 1, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3 },
  track: { backgroundColor: PALETTE.surface, borderRadius: 4, height: 6, marginTop: 8, overflow: 'hidden' },
  fill: { borderRadius: 4, height: 6 },
  dropdown: { alignItems: 'center', backgroundColor: PALETTE.primarySoft, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, paddingHorizontal: 14, paddingVertical: 12 },
  dropdownOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  dropdownText: { color: PALETTE.primary, fontSize: 14, fontWeight: '700' },
  chevron: { color: PALETTE.primary, fontSize: 14 },
  panel: { borderColor: PALETTE.primarySoft, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, borderTopWidth: 0, borderWidth: 1, padding: 12 },
  tabs: { backgroundColor: PALETTE.surface, borderRadius: 12, flexDirection: 'row', gap: 2, marginBottom: 14, padding: 3 },
  tab: { alignItems: 'center', borderRadius: 9, flex: 1, paddingVertical: 8 },
  tabSelected: { backgroundColor: PALETTE.background, shadowColor: '#14212B', shadowOffset: { height: 1, width: 0 }, shadowOpacity: 0.08, shadowRadius: 3 },
  tabText: { color: PALETTE.muted, fontSize: 12, fontWeight: '600' },
  tabTextSelected: { color: PALETTE.ink },
  gap: { gap: 12 },
  verdict: { color: PALETTE.ink, fontSize: 15, fontWeight: '600', lineHeight: 22 },
  heading: { color: PALETTE.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 6, textTransform: 'uppercase' },
  body: { color: PALETTE.muted, flex: 1, fontSize: 14, lineHeight: 20 },
  bulletRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  bullet: { backgroundColor: PALETTE.primary, borderRadius: 3, height: 6, marginTop: 7, width: 6 },
  legend: { flexDirection: 'row', gap: 16 },
  legendItem: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 8 },
  legendLine: { borderRadius: 2, height: 4, width: 18 },
  legendText: { color: PALETTE.ink, flex: 1, fontSize: 12, fontWeight: '600' },
  compare: { gap: 6 },
  compareHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  compareLabel: { color: PALETTE.muted, fontSize: 12 },
  compareValue: { fontSize: 14, fontWeight: '700', minWidth: 40 },
  compareTrack: { borderRadius: 4, flexDirection: 'row', height: 8, overflow: 'hidden' },
  compareGap: { backgroundColor: PALETTE.background, width: 3 },
  block: { backgroundColor: PALETTE.surface, borderRadius: 14, gap: 8, padding: 12 },
  playerHead: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  dot: { borderRadius: 5, height: 10, width: 10 },
  playerName: { color: PALETTE.ink, flex: 1, fontSize: 14, fontWeight: '700' },
  rank: { color: PALETTE.faint, fontSize: 12, fontWeight: '600' },
  formRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  chip: { alignItems: 'center', borderRadius: 6, height: 22, justifyContent: 'center', width: 22 },
  chipText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  formOpponent: { color: PALETTE.ink, flex: 1, fontSize: 13 },
  formScore: { color: PALETTE.ink, fontSize: 12, fontWeight: '700' },
  formDate: { color: PALETTE.faint, fontSize: 11 },
  empty: { color: PALETTE.muted, fontSize: 13, lineHeight: 19 },
  note: { color: PALETTE.faint, fontSize: 12, lineHeight: 18 },
});
