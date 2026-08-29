import { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, StyleSheet, Animated, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/hooks/useAuth';
import { colors, radius, spacing, font } from '../src/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const router = useRouter();

  // Entrance animations
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const cardTranslateY = useRef(new Animated.Value(30)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1, friction: 6, tension: 40, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(cardOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(cardTranslateY, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  async function handleLogin() {
    if (!email.trim() || !password) { Alert.alert('Error', 'Ingrese email y contraseña'); return; }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      router.replace('/(tabs)/production');
    } catch { Alert.alert('Error', 'Credenciales inválidas'); }
    finally { setLoading(false); }
  }

  return (
    <LinearGradient
      colors={['#064e3b', '#047857', '#059669']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={s.gradient}
    >
      {/* Decorative circles */}
      <View style={s.circle1} />
      <View style={s.circle2} />
      <View style={s.circle3} />

      <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.content}>
          {/* Logo */}
          <Animated.View style={[s.logo, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
            <View style={s.logoCircle}>
              <Text style={s.logoEmoji}>🌿</Text>
            </View>
            <Text style={s.title}>Fundo360</Text>
            <Text style={s.subtitle}>Gestión integral de campo</Text>
          </Animated.View>

          {/* Form */}
          <Animated.View style={[s.card, { opacity: cardOpacity, transform: [{ translateY: cardTranslateY }] }]}>
            <View style={s.inputGroup}>
              <Text style={s.label}>Email</Text>
              <TextInput
                style={s.input}
                placeholder="correo@ejemplo.cl"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                returnKeyType="next"
              />
            </View>

            <View style={s.inputGroup}>
              <Text style={s.label}>Contraseña</Text>
              <View style={s.passwordRow}>
                <TextInput
                  style={s.passwordInput}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  onSubmitEditing={handleLogin}
                  returnKeyType="go"
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={s.eyeBtn} activeOpacity={0.7}>
                  <Text style={s.eyeText}>{showPassword ? '🙈' : '👁️'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={[s.btn, loading && { opacity: 0.6 }]} onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
              <Text style={s.btnText}>{loading ? 'Ingresando...' : 'Ingresar'}</Text>
            </TouchableOpacity>
          </Animated.View>

          <Animated.Text style={[s.version, { opacity: cardOpacity }]}>v0.1.0</Animated.Text>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  circle1: { position: 'absolute', width: width * 0.8, height: width * 0.8, borderRadius: width * 0.4, backgroundColor: 'rgba(16, 185, 129, 0.12)', top: -width * 0.2, right: -width * 0.2 },
  circle2: { position: 'absolute', width: width * 0.6, height: width * 0.6, borderRadius: width * 0.3, backgroundColor: 'rgba(5, 150, 105, 0.1)', bottom: -width * 0.1, left: -width * 0.15 },
  circle3: { position: 'absolute', width: width * 0.3, height: width * 0.3, borderRadius: width * 0.15, backgroundColor: 'rgba(255, 255, 255, 0.04)', top: '40%', left: '10%' },
  logo: { alignItems: 'center', marginBottom: 36 },
  logoCircle: { width: 80, height: 80, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  logoEmoji: { fontSize: 38 },
  title: { fontSize: 28, fontWeight: font.bold, color: colors.textWhite, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  card: { backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: radius.xxl, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.15, shadowRadius: 32, elevation: 12 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: font.medium, color: colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colors.text },
  passwordRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md },
  passwordInput: { flex: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colors.text },
  eyeBtn: { paddingHorizontal: 14 },
  eyeText: { fontSize: 18 },
  btn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 16, alignItems: 'center', marginTop: 8, shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  btnText: { color: colors.textWhite, fontSize: 16, fontWeight: font.semibold },
  version: { textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 28 },
});
