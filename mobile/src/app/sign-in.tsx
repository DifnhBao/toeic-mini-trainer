import * as AppleAuthentication from 'expo-apple-authentication';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Google from 'expo-auth-session/providers/google';
import { Redirect, router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { palette, radius } from '@/constants/design';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';

WebBrowser.maybeCompleteAuthSession();

function BrowserGoogleSignInButton({ onError }: { onError: (message: string) => void }) {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const handledToken = useRef<string | null>(null);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    selectAccount: true,
  });

  useEffect(() => {
    const token =
      response?.type === 'success'
        ? response.params.id_token || response.authentication?.idToken
        : null;
    if (!token || token === handledToken.current) return;
    handledToken.current = token;
    setBusy(true);
    signInWithGoogle(token)
      .catch((error) => onError(error instanceof Error ? error.message : 'Đăng nhập thất bại.'))
      .finally(() => setBusy(false));
  }, [response, signInWithGoogle, onError]);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={!request || busy}
      onPress={() => {
        onError('');
        promptAsync().catch((error) =>
          onError(error instanceof Error ? error.message : 'Không thể mở Google.'),
        );
      }}
      style={({ pressed }) => [
        styles.oauthButton,
        pressed && styles.buttonPressed,
        (!request || busy) && styles.buttonDisabled,
      ]}>
      {busy ? <ActivityIndicator color={palette.ink} /> : <Text style={styles.googleMark}>G</Text>}
      <Text style={styles.oauthButtonText}>Tiếp tục với Google</Text>
    </Pressable>
  );
}

function AndroidGoogleSignInButton({ onError }: { onError: (message: string) => void }) {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const handlePress = async () => {
    if (busyRef.current) return;
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
    if (!webClientId) {
      onError('Thiếu Google Web Client ID cho bản Android này.');
      return;
    }

    busyRef.current = true;
    setBusy(true);
    onError('');
    try {
      // Loading only on press lets Expo Go show the explanatory notice below.
      const {
        GoogleOneTapSignIn,
        isCancelledResponse,
        isNoSavedCredentialFoundResponse,
        isSuccessResponse,
      } = await import('react-native-nitro-google-signin');

      GoogleOneTapSignIn.configure({ webClientId });
      await GoogleOneTapSignIn.checkPlayServices();
      let response = await GoogleOneTapSignIn.signIn();
      if (isNoSavedCredentialFoundResponse(response)) {
        response = await GoogleOneTapSignIn.createAccount();
      }
      if (isNoSavedCredentialFoundResponse(response)) {
        response = await GoogleOneTapSignIn.presentExplicitSignIn();
      }
      if (isCancelledResponse(response)) return;
      if (!isSuccessResponse(response) || !response.data.idToken) {
        onError('Không tìm thấy tài khoản Google trên thiết bị.');
        return;
      }
      await signInWithGoogle(response.data.idToken);
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === 'SIGN_IN_CANCELLED') return;
      if (code === 'PLAY_SERVICES_NOT_AVAILABLE') {
        onError('Hãy cài đặt hoặc cập nhật Google Play Services rồi thử lại.');
      } else if (code === 'DEVELOPER_ERROR') {
        onError('Cấu hình Google chưa khớp với package hoặc chứng chỉ ký của APK.');
      } else if (error instanceof ApiError) {
        onError(error.message);
      } else {
        onError('Đăng nhập Google thất bại. Kiểm tra cấu hình OAuth và thử lại.');
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.oauthButton,
        pressed && styles.buttonPressed,
        busy && styles.buttonDisabled,
      ]}>
      {busy ? <ActivityIndicator color={palette.ink} /> : <Text style={styles.googleMark}>G</Text>}
      <Text style={styles.oauthButtonText}>Tiếp tục với Google</Text>
    </Pressable>
  );
}

export default function SignInScreen() {
  const { user, signInWithApple, sessionRestoreError, retrySession, logoutError, logout } = useAuth();
  const [errorMessage, setErrorMessage] = useState('');
  const [appleBusy, setAppleBusy] = useState(false);
  const hasGoogleConfig = Boolean(
    Platform.select({
      android: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      default: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    }),
  );
  const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  const canUseGoogle = hasGoogleConfig && !isExpoGo;

  if (user) return <Redirect href="/(tabs)" />;

  const handleApple = async () => {
    setErrorMessage('');
    setAppleBusy(true);
    try {
      const state = Crypto.randomUUID();
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        state,
      });
      if (credential.state !== state || !credential.identityToken) {
        throw new Error('Phản hồi Apple không hợp lệ.');
      }
      const name = credential.fullName
        ? AppleAuthentication.formatFullName(credential.fullName)
        : undefined;
      await signInWithApple(credential.identityToken, name || undefined);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== 'ERR_REQUEST_CANCELED') {
        setErrorMessage(error instanceof Error ? error.message : 'Đăng nhập Apple thất bại.');
      }
    } finally {
      setAppleBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>T</Text>
        </View>
        <Text style={styles.eyebrow}>TOEIC MINI TRAINER</Text>
        <Text style={styles.title}>Mỗi ngày một bài ngắn, tiến bộ thật.</Text>
        <Text style={styles.subtitle}>
          Luyện đủ 7 part, nghe audio theo nhóm câu và nhận giải thích từ AI như một giáo viên.
        </Text>

        <View style={styles.authCard}>
          <Text style={styles.cardTitle}>Bắt đầu học</Text>
          <Text style={styles.cardCaption}>Tài khoản giúp đồng bộ lịch sử và bảo vệ tiến độ.</Text>

          {logoutError && (
            <View style={styles.configNotice}>
              <Text style={styles.configNoticeText}>
                {logoutError === 'local'
                  ? 'Chưa xóa được phiên trên thiết bị. Hãy thử đăng xuất lại trước khi đóng ứng dụng.'
                  : 'Đã đăng xuất trên thiết bị, nhưng máy chủ chưa xác nhận thu hồi phiên. Hãy thử lại khi có mạng.'}
              </Text>
              <Pressable accessibilityRole="button" onPress={() => void logout()}>
                <Text style={styles.retryText}>Thử đăng xuất lại</Text>
              </Pressable>
            </View>
          )}

          {sessionRestoreError && (
            <View style={styles.configNotice}>
              <Text style={styles.configNoticeText}>
                Chưa thể khôi phục phiên vì kết nối hoặc máy chủ tạm thời gặp lỗi. Phiên của bạn vẫn được giữ trên thiết bị.
              </Text>
              <Pressable accessibilityRole="button" onPress={() => void retrySession()}>
                <Text style={styles.retryText}>Thử kết nối lại</Text>
              </Pressable>
            </View>
          )}

          {canUseGoogle ? (
            Platform.OS === 'android' ? (
              <AndroidGoogleSignInButton onError={setErrorMessage} />
            ) : (
              <BrowserGoogleSignInButton onError={setErrorMessage} />
            )
          ) : (
            <View style={styles.configNotice}>
              <Text style={styles.configNoticeText}>
                {isExpoGo
                  ? 'Đăng nhập Google cần Development Build của ứng dụng. Expo Go chỉ dùng để xem trước giao diện.'
                  : 'Cần cấu hình Google Client ID trong file .env.local rồi khởi động lại Metro.'}
              </Text>
            </View>
          )}

          {Platform.OS === 'ios' && (
            <View style={appleBusy && styles.buttonDisabled}>
              {appleBusy ? (
                <View style={styles.appleLoading}>
                  <ActivityIndicator color="#FFFFFF" />
                </View>
              ) : (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={radius.small}
                  style={styles.appleButton}
                  onPress={handleApple}
                />
              )}
            </View>
          )}

          {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
          <Text style={styles.privacyText}>
            Ứng dụng không lưu mật khẩu Google/Apple. Token làm mới được mã hóa trong Keychain hoặc
            Android Keystore.
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/guest')} style={styles.configNotice}>
          <Text style={styles.retryText}>Học thử 10 câu không cần đăng nhập →</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  brandMark: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  brandMarkText: { color: '#FFFFFF', fontSize: 28, fontWeight: '800' },
  eyebrow: { color: palette.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: palette.ink, fontSize: 32, lineHeight: 38, fontWeight: '800' },
  subtitle: { color: palette.muted, fontSize: 16, lineHeight: 24, marginBottom: 10 },
  authCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.large,
    padding: 20,
    borderWidth: 1,
    borderColor: palette.line,
    gap: 12,
  },
  cardTitle: { color: palette.ink, fontSize: 20, fontWeight: '700' },
  cardCaption: { color: palette.muted, fontSize: 14, lineHeight: 20, marginBottom: 4 },
  oauthButton: {
    height: 50,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  googleMark: { fontSize: 18, color: '#4285F4', fontWeight: '800' },
  oauthButtonText: { color: palette.ink, fontSize: 16, fontWeight: '600' },
  buttonPressed: { opacity: 0.75 },
  buttonDisabled: { opacity: 0.55 },
  appleButton: { width: '100%', height: 50 },
  appleLoading: {
    height: 50,
    borderRadius: radius.small,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  configNotice: { padding: 12, borderRadius: radius.small, backgroundColor: '#FFF6E5' },
  configNoticeText: { color: '#7A4D00', fontSize: 13, lineHeight: 18 },
  retryText: { color: palette.primary, fontSize: 14, fontWeight: '700', marginTop: 8 },
  errorText: { color: palette.danger, fontSize: 13, lineHeight: 18 },
  privacyText: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
});
