import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { colors, radius, font } from '../src/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Cambio de contraseña forzado en el primer inicio de sesión.
 * El admin de un cliente creado por el super-admin llega aquí antes de poder
 * usar la app. Al completar, el backend limpia workers.must_change_password.
 */
export default function ChangePasswordScreen() {
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit() {
    setErrorMsg(null);
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setErrorMsg(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
      return;
    }
    if (newPassword !== confirm) {
      setErrorMsg('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('auth/change-password', {
        method: 'POST',
        body: { new_password: newPassword },
      });
      if (error || data?.success === false) {
        setErrorMsg(data?.error?.message || 'No se pudo actualizar la contraseña');
        return;
      }
      // Refrescar la sesión para que el JWT/estado quede consistente y entrar.
      await supabase.auth.refreshSession();
      router.replace('/(tabs)/production');
    } catch (e: any) {
      setErrorMsg(e?.message || 'No se pudo actualizar la contraseña');
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={['#064e3b', '#047857', '#059669']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.gradient}>
      <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.content}>
          <View style={s.header}>
            <Text style={s.title}>Cambia tu contraseña</Text>
            <Text style={s.subtitle}>Por seguridad, define una nueva contraseña antes de continuar.</Text>
          </View>

          <View style={s.card}>
            <View style={s.inputGroup}>
              <Text style={s.label}>Nueva contraseña</Text>
              <TextInput
                style={s.input}
                placeholder="Mínimo 8 caracteres"
                placeholderTextColor={colors.textMuted}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>
            <View style={s.inputGroup}>
              <Text style={s.label}>Confirmar contraseña</Text>
              <TextInput
                style={s.input}
                placeholder="Repite la contraseña"
                placeholderTextColor={colors.textMuted}
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                autoCapitalize="none"
                onSubmitEditing={handleSubmit}
                returnKeyType="go"
              />
            </View>

            {errorMsg ? (
              <View style={s.errorBox}>
                <Text style={s.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            <TouchableOpacity style={[s.btn, loading && { opacity: 0.6 }]} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
              <Text style={s.btnText}>{loading ? 'Guardando...' : 'Guardar y continuar'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  header: { alignItems: 'center', marginBottom: 28 },
  title: { fontSize: 24, fontWeight: font.bold, color: colors.textWhite, letterSpacing: -0.5, textAlign: 'center' },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 8, textAlign: 'center' },
  card: { backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: radius.xxl, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.15, shadowRadius: 32, elevation: 12 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: font.medium, color: colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colors.text },
  errorBox: { backgroundColor: colors.redBg, borderWidth: 1, borderColor: '#fecaca', borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 12 },
  errorText: { color: colors.red, fontSize: 13, fontWeight: font.medium, textAlign: 'center' },
  btn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 16, alignItems: 'center', marginTop: 8, shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  btnText: { color: colors.textWhite, fontSize: 16, fontWeight: font.semibold },
});
