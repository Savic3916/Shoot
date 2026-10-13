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

export default function ModelScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>HOW THE SHORTLIST WORKS</Text>
        <Text style={styles.title}>Evidence in.{'\n'}Certainty out? Never.</Text>
        <Text style={styles.intro}>
          Sideline builds at most one daily accumulator from available licensed match data. It does
          not force a pick when the checks are not met.
        </Text>

        <View style={styles.warning}>
          <Text style={styles.warningTitle}>No football bet is always safe</Text>
          <Text style={styles.warningBody}>
            The 5.00 combined-price ceiling is a product target, not a 5.00 chance of winning. Every
            leg can lose; adding legs increases the ways an accumulator can fail.
          </Text>
        </View>

        <View style={styles.step}>
          <Text style={styles.number}>01</Text>
          <View style={styles.copy}>
            <Text style={styles.stepTitle}>Compare worldwide fixtures and prices</Text>
            <Text style={styles.detail}>
              The app requests all fixtures in the selected local date that are covered by your
              Sportmonks plan. Current bookmaker double-chance prices are grouped and de-vigged
              within the available market quotes.
            </Text>
          </View>
        </View>
        <View style={styles.step}>
          <Text style={styles.number}>02</Text>
          <View style={styles.copy}>
            <Text style={styles.stepTitle}>Check recent completed scores</Text>
            <Text style={styles.detail}>
              For fixtures with usable prices, the data server loads each team’s latest completed
              matches from the prior 90 days. The short-list requires at least four results for
              each team and weights observed form alongside market-implied probability.
              It requires bookmaker timestamps no older than six hours and skips a fixture when
              an unavailable player has a tracked recent goal or assist.
            </Text>
          </View>
        </View>
        <View style={styles.step}>
          <Text style={styles.number}>03</Text>
          <View style={styles.copy}>
            <Text style={styles.stepTitle}>Show availability honestly</Text>
            <Text style={styles.detail}>
              Reported injuries or suspensions and official lineups are displayed when supplied by
              the feed. An empty absence report does not mean every player is fit. Expected XIs are
              optional and require the matching provider add-on.
            </Text>
          </View>
        </View>

        <View style={styles.setupCard}>
          <Text style={styles.setupKicker}>CONNECT YOUR DATA FEED</Text>
          <Text style={styles.setupTitle}>Sportmonks account required</Text>
          <Text style={styles.setupText}>
            1. Choose a Sportmonks plan whose league coverage matches your needs. Their fixtures
            include leagues only within your subscription.{'\n'}
            2. Pre-match prices need the separate Odds add-on (listed at €14–€69 depending on base
            plan when researched); confirm the plan’s bookmaker and
            market coverage before purchase.{'\n'}
            3. Create a token, copy .env.example to .env, and set SPORTMONKS_API_TOKEN.{'\n'}
            4. Expected lineups need the provider’s Expected Lineups add-on; only then set
            SPORTMONKS_EXPECTED_LINEUPS=true.{'\n'}
            5. Start the data server with npm run server. Start Expo separately with npx expo start.
            On a phone, set EXPO_PUBLIC_API_URL to your computer’s LAN address.
          </Text>
          <Text style={styles.securityNote}>
            Keep the provider token in the server’s .env, not in an EXPO_PUBLIC variable or the
            mobile app bundle. The included server is for local development, not public deployment.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>What this first model does not know</Text>
        <Text style={styles.body}>
          It is not trained or back-tested for accuracy. Historical player goals, assists, minutes,
          and ratings from recent lineups are displayed. It does not calculate a calibrated
          player-strength score, quantify lineup importance, travel, tactics, suspensions outside
          the provider’s report, or later odds movements. Recent contributors reported unavailable
          are excluded rather than assigned a guessed impact score.
        </Text>
        <Text style={styles.body}>
          Predictions and accumulator chance figures are rough historical estimates, not calibrated
          probabilities. The combined chance multiplies leg estimates and assumes independence,
          which is not guaranteed. Do not stake money you cannot afford to lose.
        </Text>
        <Text style={styles.body}>
          No Flashscore scraping is used. Flashscore’s terms restrict copying or extracting
          substantial database content without permission. This app uses the selected licensed
          provider feed instead.
        </Text>
        <Text style={styles.footer}>
          Demo mode uses fictional clubs and no odds. It will never present sample data as today’s
          real pick.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: COLORS.background, flex: 1 },
  content: { alignSelf: 'center', maxWidth: 560, paddingBottom: 42, paddingHorizontal: 22, paddingTop: 28, width: '100%' },
  kicker: { color: COLORS.green, fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  title: { color: COLORS.text, fontSize: 32, fontWeight: '800', letterSpacing: -1.2, lineHeight: 39, marginTop: 12 },
  intro: { color: COLORS.muted, fontSize: 12, lineHeight: 19, marginTop: 12 },
  warning: { backgroundColor: '#231F15', borderColor: '#54462B', borderRadius: 16, borderWidth: 1, marginTop: 22, padding: 15 },
  warningTitle: { color: COLORS.amber, fontSize: 12, fontWeight: '800' },
  warningBody: { color: '#B4A98E', fontSize: 10, lineHeight: 16, marginTop: 6 },
  step: { borderBottomColor: COLORS.border, borderBottomWidth: 1, flexDirection: 'row', gap: 13, paddingVertical: 16 },
  number: { color: COLORS.green, fontSize: 10, fontWeight: '900', paddingTop: 2, width: 22 },
  copy: { flex: 1, gap: 5 },
  stepTitle: { color: COLORS.text, fontSize: 12, fontWeight: '800' },
  detail: { color: COLORS.muted, fontSize: 10, lineHeight: 16 },
  setupCard: { backgroundColor: COLORS.card, borderColor: COLORS.border, borderRadius: 18, borderWidth: 1, marginTop: 23, padding: 16 },
  setupKicker: { color: COLORS.green, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  setupTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800', marginTop: 8 },
  setupText: { color: COLORS.muted, fontSize: 10, lineHeight: 17, marginTop: 10 },
  securityNote: { borderTopColor: COLORS.border, borderTopWidth: 1, color: COLORS.amber, fontSize: 9, lineHeight: 15, marginTop: 12, paddingTop: 10 },
  sectionTitle: { color: COLORS.text, fontSize: 13, fontWeight: '800', marginTop: 23 },
  body: { color: COLORS.muted, fontSize: 10, lineHeight: 16, marginTop: 8 },
  footer: { color: COLORS.muted, fontSize: 9, fontStyle: 'italic', lineHeight: 14, marginTop: 19 },
});
