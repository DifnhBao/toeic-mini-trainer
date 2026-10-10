import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette, radius } from '@/constants/design';
import { useAuth } from '@/providers/auth-provider';
import type { CoachTurn } from '@/types/learning';
import { formatCoachText } from '@/lib/coach-text';

const FOCUS_OPTIONS = ['Tổng hợp', 'Ngữ pháp', 'Từ vựng', 'Chiến thuật'] as const;

const SUGGESTED_QUESTIONS = [
  'Phân biệt Past Simple và Present Perfect',
  'Chiến thuật làm Part 3 khi chỉ nghe được một lần?',
  'Cách loại đáp án nhiễu trong Part 5',
];

export default function CoachScreen() {
  const { authorizedFetch } = useAuth();
  const [messages, setMessages] = useState<CoachTurn[]>([]);
  const [input, setInput] = useState('');
  const [focus, setFocus] = useState<(typeof FOCUS_OPTIONS)[number]>('Tổng hợp');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const send = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || sending) return;

    setError('');
    setInput('');
    // Chỉ giữ lại tối đa 10 lượt gần nhất cho ngữ cảnh, khớp giới hạn server.
    const history = [...messages, { role: 'user' as const, content: trimmed }].slice(-10);
    setMessages(history);
    setSending(true);

    try {
      const response = await authorizedFetch<{ answer: string }>('/api/v1/ai/coach', {
        method: 'POST',
        body: JSON.stringify({
          part: focus,
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
      });
      setMessages((current) => [...current, { role: 'assistant', content: response.answer }]);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Không gửi được câu hỏi.');
      setInput(trimmed);
    } finally {
      setSending(false);
    }
  };

  const chatData = [...messages].reverse();
  if (sending) chatData.unshift({ role: 'assistant', content: '' });

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.title}>AI Coach</Text>
          <Text style={styles.copy}>Hỏi ngữ pháp, từ vựng hay chiến thuật TOEIC như hỏi giáo viên.</Text>
          <View style={styles.focusRow}>
            {FOCUS_OPTIONS.map((option) => (
              <Pressable
                key={option}
                onPress={() => setFocus(option)}
                style={[styles.focusChip, focus === option && styles.focusChipActive]}
              >
                <Text style={[styles.focusChipText, focus === option && styles.focusChipTextActive]}>
                  {option}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <FlatList
          inverted
          data={chatData}
          keyExtractor={(item, index) => `${messages.length - index}-${item.role}`}
          contentContainerStyle={styles.chatContent}
          renderItem={({ item }) => (
            <View style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.coachBubble]}>
              {item.content ? (
                <Text selectable style={item.role === 'user' ? styles.userText : styles.coachText}>
                  {item.role === 'assistant' ? formatCoachText(item.content) : item.content}
                </Text>
              ) : (
                <ActivityIndicator color={palette.primary} />
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.mark}><Text style={styles.markText}>✦</Text></View>
              <Text style={styles.emptyTitle}>Hỏi bất cứ điều gì về TOEIC</Text>
              <Text style={styles.emptyCopy}>
                Lịch sử hội thoại chỉ tồn tại trong phiên này và không được lưu trên máy chủ.
              </Text>
              {SUGGESTED_QUESTIONS.map((question) => (
                <Pressable key={question} onPress={() => send(question)} style={styles.suggestion}>
                  <Text style={styles.suggestionText}>{question}</Text>
                </Pressable>
              ))}
            </View>
          }
        />

        {!!error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Nhập câu hỏi cho AI Coach…"
            placeholderTextColor={palette.muted}
            multiline
            style={styles.input}
            editable={!sending}
          />
          <Pressable
            onPress={() => send(input)}
            disabled={sending || !input.trim()}
            style={[styles.sendButton, (sending || !input.trim()) && styles.sendButtonDisabled]}
          >
            {sending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.sendButtonText}>Gửi</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  flex: { flex: 1 },
  header: { padding: 18, paddingBottom: 10, backgroundColor: palette.surface, borderBottomWidth: 1, borderBottomColor: palette.line },
  title: { color: palette.ink, fontSize: 24, fontWeight: '800' },
  copy: { color: palette.muted, fontSize: 13, marginTop: 4 },
  focusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  focusChip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: palette.canvas, borderWidth: 1, borderColor: palette.line },
  focusChipActive: { backgroundColor: palette.primarySoft, borderColor: palette.primary },
  focusChipText: { color: palette.muted, fontSize: 12, fontWeight: '700' },
  focusChipTextActive: { color: palette.primaryDark },
  chatContent: { padding: 18, gap: 10 },
  bubble: { maxWidth: '86%', borderRadius: radius.medium, padding: 12 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: palette.primary, borderBottomRightRadius: radius.small },
  coachBubble: { alignSelf: 'flex-start', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderBottomLeftRadius: radius.small },
  userText: { color: '#FFFFFF', fontSize: 14, lineHeight: 21 },
  coachText: { color: palette.ink, fontSize: 14, lineHeight: 21 },
  empty: { alignItems: 'center', paddingVertical: 28, transform: [{ scaleY: -1 }] },
  mark: { width: 56, height: 56, borderRadius: 20, backgroundColor: palette.primarySoft, alignItems: 'center', justifyContent: 'center' },
  markText: { color: palette.primary, fontSize: 24 },
  emptyTitle: { color: palette.ink, fontSize: 20, fontWeight: '800', marginTop: 14, textAlign: 'center' },
  emptyCopy: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: 'center' },
  suggestion: { marginTop: 10, padding: 12, backgroundColor: palette.surface, borderRadius: radius.small, borderWidth: 1, borderColor: palette.line, alignSelf: 'stretch' },
  suggestionText: { color: palette.primaryDark, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  error: { color: palette.danger, fontSize: 12, paddingHorizontal: 18, paddingBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, backgroundColor: palette.surface, borderTopWidth: 1, borderTopColor: palette.line },
  input: { flex: 1, minHeight: 46, maxHeight: 120, borderRadius: radius.medium, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.canvas, paddingHorizontal: 14, paddingVertical: 12, color: palette.ink, fontSize: 14, textAlignVertical: 'center' },
  sendButton: { minHeight: 46, paddingHorizontal: 18, borderRadius: radius.medium, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center' },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: { color: '#FFFFFF', fontWeight: '800' },
});
