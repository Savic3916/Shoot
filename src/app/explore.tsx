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
          Sideline uses a free public score feed. No paid sports-data subscription or API token is
          needed. Match cards show an uncalibrated form estimate, not a bookmaker price.
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
            <Text style={styles.stepTitle}>Load selected competitions for free</Text>
            <Text style={styles.detail}>
              The app checks a list of major leagues and cups, including the UEFA Champions League.
              Coverage depends on the public feed and is not every match worldwide. The feed has
              fixtures and scores, but does not provide live bookmaker odds.
            </Text>
          </View>
        </View>
        <View style={styles.step}>
          <Text style={styles.number}>02</Text>
          <View style={styles.copy}>
            <Text style={styles.stepTitle}>Check recent completed scores</Text>
            <Text style={styles.detail}>
              For matches where the scoreboard includes recent W/D/L form, the app calculates
              double-chance estimates. The displayed decimal is the inverse of that uncalibrated
              estimate; it is not an available bookmaker quote or a promise of success.
            </Text>
          </View>
        </View>
        <View style={styles.step}>
          <Text style={styles.number}>03</Text>
          <View style={styles.copy}>
            <Text style={styles.stepTitle}>Show availability honestly</Text>
            <Text style={styles.detail}>
              This free feed does not provide reliable injuries, suspensions, player availability,
              or confirmed lineups. Those are explicitly marked unavailable rather than guessed.
            </Text>
          </View>
        </View>

        <View style={styles.setupCard}>
          <Text style={styles.setupKicker}>FREE DATA FEED</Text>
          <Text style={styles.setupTitle}>No subscription or token needed</Text>
          <Text style={styles.setupText}>
            Run npm start from the project folder. This starts the local free-feed server and Expo
            together. In the browser, open the local URL shown by Expo. For a physical phone, set
            EXPO_PUBLIC_API_URL in .env to your computer’s LAN IP and restart.
          </Text>
          <Text style={styles.securityNote}>
            The scoreboard source is an unofficial public JSON feed, not a guaranteed or endorsed
            API. It can change or become unavailable. Current bookmaker odds are not included.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>What this first model does not know</Text>
        <Text style={styles.body}>
          The model is not trained or back-tested. It uses recent team W/D/L form only. It does not
          have player stats, lineups, injuries, bookmaker odds, or a calibrated rating.
        </Text>
        <Text style={styles.body}>
          Predictions and accumulator chance figures are rough historical estimates, not calibrated
          probabilities. The combined chance multiplies leg estimates and assumes independence,
          which is not guaranteed. Do not stake money you cannot afford to lose.
        </Text>
        <Text style={styles.body}>
          No Flashscore scraping or paid data service is used. The free scoreboard feed can change
          without notice. No bet is safe or certain; do not treat model estimates as betting advice.
        </Text>
        <Text style={styles.footer}>
          Live bookmaker odds are not available from this free source. The decimal shown beside a
          model pick is calculated from form, not fetched from a bookmaker.
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
