import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { PALETTE } from '@/constants/palette';

const S_PATH = 'M82 40 C 70 22, 34 26, 38 47 C 42 66, 84 58, 82 79 C 80 98, 44 100, 31 83';

/** The Shoot mark: an "S" drawn as a shot curling into the ball, with three trailing dots. */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessibilityLabel="Shoot logo">
      <Defs>
        <LinearGradient id="shoot-bg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#14897A" />
          <Stop offset="1" stopColor="#093F37" />
        </LinearGradient>
      </Defs>
      <Rect width="120" height="120" rx="28" fill="url(#shoot-bg)" />
      <Path d={S_PATH} fill="none" stroke="#FFFFFF" strokeWidth={10} strokeLinecap="round" />
      <Circle cx="22" cy="90" r="3.2" fill="#FFFFFF" opacity={0.7} />
      <Circle cx="15" cy="96" r="2.4" fill="#FFFFFF" opacity={0.45} />
      <Circle cx="9.5" cy="101" r="1.7" fill="#FFFFFF" opacity={0.25} />
      <Circle cx="86" cy="36" r="11" fill="#F4B942" />
      <Path d="M86 29.5 L91.2 33.3 L89.2 39.4 L82.8 39.4 L80.8 33.3 Z" fill="#093F37" opacity={0.85} />
    </Svg>
  );
}

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <View style={styles.row}>
      <LogoMark size={size} />
      <View>
        <Text style={[styles.word, { fontSize: size * 0.56 }]}>Shoot</Text>
        <Text style={styles.tag}>SMARTER DAILY PICKS</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  word: { color: PALETTE.ink, fontWeight: '800', letterSpacing: -0.6 },
  tag: { color: PALETTE.faint, fontSize: 9, fontWeight: '700', letterSpacing: 1.4, marginTop: -1 },
});
