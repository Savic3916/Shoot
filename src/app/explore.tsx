import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLORS = {
  background: '#09120D',
  card: '#111D17',
  border: '#29362F',
  muted: '#829087',
  text: '#F4F7F4',
  green: '#B8F36B',
  amber: '#F2C875',
};

const steps = [
  {
    number: '01',
    title: 'Start with recent form',
    detail:
      'The model takes each side’s eight most recent completed league matches before kick-off. It looks at results and goals for/against, not future scores.',
  },
  {
    number: '02',
    title: 'Add head-to-head context',
    detail:
      'Up to five earlier meetings are included with less weight than recent form. A small prior smooths estimates so a short streak cannot produce a 100% prediction.',
  },
  {
    number: '03',
    title: 'Show chance and fair odds',
    detail:
      'Each estimated chance is converted to decimal fair odds with 1 ÷ probability. These are model outputs—not live bookmaker prices and not calibrated forecasts.',
  },
];

export default function ModelScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>BEHIND THE NUMBERS</Text>
        <Text style={styles.title}>A clear model.{'\n'}No magic claims.</Text>
        <Text style={styles.intro}>
          Five historical-rate estimates per fixture. They describe what happened in the data;
          football stays uncertain.
        </Text>

        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>What the odds mean</Text>
          <Text style={styles.noticeBody}>
            A 2.00 fair-odds estimate corresponds to a 50% model probability. It does not predict a
            guaranteed return, account for bookmaker margin, or tell you what to bet.
          </Text>
        </View>

        {steps.map((step) => (
          <View key={step.number} style={styles.step}>
            <Text style={styles.stepNumber}>{step.number}</Text>
            <View style={styles.stepCopy}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepDetail}>{step.detail}</Text>
            </View>
          </View>
        ))}

        <View style={styles.setupCard}>
          <Text style={styles.setupKicker}>CONNECT REAL FIXTURES</Text>
          <Text style={styles.setupTitle}>Switch off demo mode</Text>
          <Text style={styles.setupText}>
            1. Create an account at football-data.org and get an API token.{'\n'}
            2. Copy .env.example to .env, then set FOOTBALL_DATA_API_KEY to your token.{'\n'}
            3. Set EXPO_PUBLIC_API_URL to your computer’s LAN address and port 4000 (for example,
            http://192.168.1.20:4000) if running on a phone.{'\n'}
            4. Start the API with npm run server and the app with npx expo start.
          </Text>
          <Text style={styles.securityNote}>
            The provider token stays on the server and is never bundled into the app. Do not deploy
            this development server as-is to the public internet.
          </Text>
        </View>

        <Text style={styles.sourceTitle}>Data & limitations</Text>
        <Text style={styles.sourceText}>
          Match schedules and completed results come from football-data.org. The selected
          competitions are limited to leagues available to your API plan. Data coverage, history
          depth, and request limits depend on that plan.
        </Text>
        <Text style={styles.sourceText}>
          Scraping third-party score sites is intentionally not used: it may violate site terms,
          break without notice, or provide data without permission. Use a licensed feed and check
          its current terms before release.
        </Text>
        <Text style={styles.footer}>
          Sample mode uses fictional clubs and generated example scores. Do not treat demo fixtures
          as real-world information.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: COLORS.background, flex: 1 },
  content: { alignSelf: 'center', maxWidth: 560, paddingBottom: 42, paddingHorizontal: 22, paddingTop: 29, width: '100%' },
  kicker: { color: COLORS.green, fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  title: { color: COLORS.text, fontSize: 34, fontWeight: '800', letterSpacing: -1.2, lineHeight: 40, marginTop: 12 },
  intro: { color: COLORS.muted, fontSize: 13, lineHeight: 20, marginTop: 12 },
  notice: { backgroundColor: '#231F15', borderColor: '#54462B', borderRadius: 17, borderWidth: 1, marginTop: 25, padding: 16 },
  noticeTitle: { color: COLORS.amber, fontSize: 12, fontWeight: '800' },
  noticeBody: { color: '#B4A98E', fontSize: 11, lineHeight: 17, marginTop: 7 },
  step: { borderBottomColor: COLORS.border, borderBottomWidth: 1, flexDirection: 'row', gap: 14, paddingVertical: 18 },
  stepNumber: { color: COLORS.green, fontSize: 11, fontWeight: '900', paddingTop: 1, width: 22 },
  stepCopy: { flex: 1, gap: 6 },
  stepTitle: { color: COLORS.text, fontSize: 13, fontWeight: '800' },
  stepDetail: { color: COLORS.muted, fontSize: 11, lineHeight: 17 },
  setupCard: { backgroundColor: COLORS.card, borderColor: COLORS.border, borderRadius: 20, borderWidth: 1, marginTop: 26, padding: 18 },
  setupKicker: { color: COLORS.green, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  setupTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800', marginTop: 8 },
  setupText: { color: COLORS.muted, fontSize: 11, lineHeight: 19, marginTop: 12 },
  securityNote: { borderTopColor: COLORS.border, borderTopWidth: 1, color: COLORS.amber, fontSize: 10, lineHeight: 16, marginTop: 14, paddingTop: 12 },
  sourceTitle: { color: COLORS.text, fontSize: 13, fontWeight: '800', marginTop: 27 },
  sourceText: { color: COLORS.muted, fontSize: 11, lineHeight: 17, marginTop: 9 },
  footer: { color: COLORS.muted, fontSize: 10, fontStyle: 'italic', lineHeight: 15, marginTop: 21 },
});
