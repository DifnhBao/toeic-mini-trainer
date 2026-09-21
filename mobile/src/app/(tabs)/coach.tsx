import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palette, radius } from '@/constants/design';

export default function CoachScreen() {
  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.mark}><Text style={styles.markText}>✦</Text></View>
        <Text style={styles.title}>Giáo viên TOEIC luôn sẵn sàng</Text>
        <Text style={styles.copy}>
          Hỏi về ngữ pháp, từ vựng, chiến thuật từng Part hoặc yêu cầu giải thích một câu sai.
        </Text>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>SẮP ĐƯỢC NỐI Ở GIAI ĐOẠN 4</Text>
          <Text style={styles.cardText}>Lịch sử hội thoại, gợi ý theo điểm yếu và giải thích có ngữ cảnh.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  content: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  mark: { width: 64, height: 64, borderRadius: 22, backgroundColor: palette.primarySoft, alignItems: 'center', justifyContent: 'center' },
  markText: { color: palette.primary, fontSize: 28 },
  title: { color: palette.ink, fontSize: 26, lineHeight: 32, fontWeight: '800', textAlign: 'center', marginTop: 18 },
  copy: { color: palette.muted, fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 10 },
  card: { marginTop: 24, width: '100%', padding: 18, backgroundColor: palette.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: palette.line },
  cardLabel: { color: palette.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  cardText: { color: palette.ink, fontSize: 14, lineHeight: 21, marginTop: 7 },
});
