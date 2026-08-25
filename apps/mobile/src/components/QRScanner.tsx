import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

interface QRScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

const { width } = Dimensions.get('window');
const SCAN_SIZE = width * 0.7;

export function QRScanner({ onScan, onClose }: QRScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
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
          <Text style={{ fontSize: 48, marginBottom: 16 }}>📷</Text>
          <Text style={s.permissionTitle}>Acceso a cámara</Text>
          <Text style={s.permissionText}>
            Se necesita acceso a la cámara para escanear los badges QR de los trabajadores.
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

  function handleBarCodeScanned({ data }: { data: string }) {
    if (scanned) return;
    setScanned(true);
    onScan(data);
  }

  return (
    <View style={s.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      {/* Overlay */}
      <View style={s.overlay}>
        {/* Top */}
        <View style={s.overlayTop}>
          <TouchableOpacity style={s.closeBtn} onPress={onClose}>
            <Text style={s.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Middle with scan window */}
        <View style={s.overlayMiddle}>
          <View style={s.overlaySide} />
          <View style={s.scanWindow}>
            {/* Corner markers */}
            <View style={[s.corner, s.cornerTL]} />
            <View style={[s.corner, s.cornerTR]} />
            <View style={[s.corner, s.cornerBL]} />
            <View style={[s.corner, s.cornerBR]} />
          </View>
          <View style={s.overlaySide} />
        </View>

        {/* Bottom */}
        <View style={s.overlayBottom}>
          <Text style={s.scanText}>Apunta al Badge QR del trabajador</Text>
          {scanned && (
            <TouchableOpacity style={s.rescanBtn} onPress={() => setScanned(false)}>
              <Text style={s.rescanBtnText}>Escanear de nuevo</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  message: { color: '#fff', textAlign: 'center', marginTop: 100, fontSize: 16 },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  overlayTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-start', alignItems: 'flex-end', paddingTop: 60, paddingRight: 20 },
  overlayMiddle: { flexDirection: 'row' },
  overlaySide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  scanWindow: { width: SCAN_SIZE, height: SCAN_SIZE, position: 'relative' },
  overlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', paddingTop: 32 },
  scanText: { color: '#fff', fontSize: 15, fontWeight: '500' },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: '#fff', fontSize: 20, fontWeight: '600' },
  rescanBtn: { marginTop: 16, backgroundColor: '#1b5e20', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  rescanBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: '#4caf50' },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 4 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 4 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 4 },
  permissionBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#f8fafc' },
  permissionTitle: { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 8 },
  permissionText: { fontSize: 15, color: '#6b7280', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  permissionBtn: { width: '100%', backgroundColor: '#1b5e20', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  permissionBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  cancelBtn: { marginTop: 12, paddingVertical: 12 },
  cancelBtnText: { color: '#6b7280', fontSize: 15 },
});
