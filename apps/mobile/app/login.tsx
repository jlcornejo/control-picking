import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/hooks/useAuth';
import { colors, radius, spacing, font } from '../src/constants/theme';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const router = useRouter();

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
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.content}>
        {/* Logo */}
        <View style={s.logo}>
          <View style={s.logoCircle}>
            <Text style={s.logoEmoji}>🌿</Text>
          </View>
          <Text style={s.title}>Control de Picking</Text>
          <Text style={s.subtitle}>Gestión inteligente de cosecha</Text>
        </View>

        {/* Form */}
        <View style={s.card}>
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
        </View>

        <Text style={s.version}>v0.1.0</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  logo: { alignItems: 'center', marginBottom: 36 },
  logoCircle: { width: 72, height: 72, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  logoEmoji: { fontSize: 36 },
  title: { fontSize: 26, fontWeight: font.bold, color: colors.textWhite, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  card: { backgroundColor: colors.card, borderRadius: radius.xxl, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.12, shadowRadius: 28, elevation: 10 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: font.medium, color: colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colors.text },
  passwordRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md },
  passwordInput: { flex: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colors.text },
  eyeBtn: { paddingHorizontal: 14 },
  eyeText: { fontSize: 18 },
  btn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  btnText: { color: colors.textWhite, fontSize: 16, fontWeight: font.semibold },
  version: { textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 28 },
});
