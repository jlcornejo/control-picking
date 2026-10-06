import { useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { colors, font } from '../constants/theme';

interface PhotoCaptureProps {
  /** Se llama con el uri local de la foto tomada. El llamador decide subirla. */
  onCapture: (uri: string) => void;
  onClose: () => void;
}

/**
 * Captura una foto de respaldo con la cámara trasera. Reusa el mismo módulo
 * nativo (expo-camera) que el escáner QR, por lo que NO requiere recompilar la
 * app (OTA-friendly). Tras disparar, muestra una previsualización para
 * confirmar o repetir antes de devolver el uri al llamador.
 */
export function PhotoCapture({ onCapture, onClose }: PhotoCaptureProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!permission?.granted) requestPermission();
  }, [permission]);

  if (!permission) {
    return (
      <View style={s.container}>
        <Text style={s.message}>Cargando cámara...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={s.container}>
        <View style={s.permissionBox}>
          <Ionicons name="camera-outline" size={48} color={colors.textMuted} style={{ marginBottom: 16 }} />
          <Text style={s.permissionTitle}>Acceso a cámara</Text>
          <Text style={s.permissionText}>
            Se necesita acceso a la cámara para tomar la foto de respaldo del registro.
          </Text>
          <TouchableOpacity style={s.permissionBtn} onPress={requestPermission} activeOpacity={0.8}>
            <Text style={s.permissionBtnText}>Permitir acceso</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
            <Text style={s.cancelBtnText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  async function takePhoto() {
    if (busy || !cameraRef.current) return;
    setBusy(true);
    try {
      // quality moderada: suficiente para evidencia, archivos livianos para subir
      // en terreno con conectividad limitada.
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6, skipProcessing: true });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (photo?.uri) setPreview(photo.uri);
    } finally {
      setBusy(false);
    }
  }

  function confirm() {
    if (preview) onCapture(preview);
  }

  // Previsualización: confirmar o repetir.
  if (preview) {
    return (
      <View style={s.container}>
        <Image source={{ uri: preview }} style={StyleSheet.absoluteFillObject} resizeMode="contain" />
        <View style={s.previewBar}>
          <TouchableOpacity style={[s.retakeBtn, s.btnRow]} onPress={() => setPreview(null)} activeOpacity={0.85}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={s.retakeBtnText}>Repetir</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.confirmBtn, s.btnRow]} onPress={confirm} activeOpacity={0.85}>
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={s.confirmBtnText}>Usar foto</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="back" />
      <View style={s.overlay}>
        <View style={s.topBar}>
          <TouchableOpacity style={s.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={s.bottomBar}>
          <Text style={s.hint}>Toma la foto de respaldo del registro</Text>
          <TouchableOpacity style={s.shutter} onPress={takePhoto} disabled={busy} activeOpacity={0.8}>
            <View style={s.shutterInner} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  message: { color: '#fff', textAlign: 'center', marginTop: 100, fontSize: 16 },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  topBar: { paddingTop: 60, paddingRight: 20, alignItems: 'flex-end' },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: '#fff', fontSize: 20, fontWeight: '600' },
  bottomBar: { alignItems: 'center', paddingBottom: 48, gap: 20 },
  hint: { color: '#fff', fontSize: 15, fontWeight: '500', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  shutter: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.3)', borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#fff' },
  previewBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 12, padding: 20, paddingBottom: 40, backgroundColor: 'rgba(0,0,0,0.6)' },
  btnRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  retakeBtn: { flex: 1, borderWidth: 1, borderColor: '#fff', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  retakeBtnText: { color: '#fff', fontSize: 16, fontWeight: font.semibold },
  confirmBtn: { flex: 2, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: font.semibold },
  permissionBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#f8fafc' },
  permissionTitle: { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 8 },
  permissionText: { fontSize: 15, color: '#6b7280', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  permissionBtn: { width: '100%', backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  permissionBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  cancelBtn: { marginTop: 12, paddingVertical: 12 },
  cancelBtnText: { color: '#6b7280', fontSize: 15 },
});
