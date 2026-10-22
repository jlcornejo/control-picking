import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { parseWeight } from '../lib/scale/parse-weight';

/**
 * useBluetoothScale — Android-only Bluetooth Classic / SPP weight reader.
 *
 * Owns the native-module lifecycle for the LP7516C-type indicator and exposes a
 * small state machine to the register screen. It is INERT on iOS / Expo Go:
 * the native module is loaded lazily and only on Android, so the app never
 * crashes or links the module where it does not exist. All errors are caught and
 * surfaced as a Spanish `error` string — the hook never throws to the component,
 * so the manual kg input keeps working as the fallback at all times.
 */

// --- Tunable constants (documented) ---------------------------------------

/**
 * Advertising name of the specific scale paired in Android settings (PIN 1234).
 * Name-match is PRIMARY: a replacement unit keeps the same model name even if
 * its MAC differs.
 */
const SCALE_DEVICE_NAME = 'L261241';

/**
 * MAC of THIS physical unit, used only as a fallback if the name match fails.
 * Hardware-specific — may differ per scale, so it is secondary to the name.
 */
const SCALE_DEVICE_MAC = '0F:03:25:C2:02:01';

/** Max raw lines kept in memory (bounded ring buffer for the debug panel). */
const RAW_LOG_CAP = 200;

/**
 * When the frame has NO stability status (parser returns `stable === null`), a
 * reading is accepted once the same kg value repeats unchanged for this long.
 * Tune alongside the parser once the real frame is known.
 */
const STABLE_DEBOUNCE_MS = 500;

/** Longest line we forward to the parser (defense against a chatty stream). */
const MAX_LINE_LENGTH = 128;

// --- Public API ------------------------------------------------------------

export type ScaleStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface BtScaleDevice {
  address: string;
  name: string | null;
}

export interface UseBluetoothScale {
  /** false on iOS / Expo Go / module missing — actions are benign no-ops. */
  supported: boolean;
  status: ScaleStatus;
  lastWeightKg: number | null;
  lastStable: boolean | null;
  rawLog: string[];
  devices: BtScaleDevice[];
  error: string | null;
  refreshDevices: () => Promise<void>;
  /** Connect; with no address, find by name then fall back to the MAC. */
  connect: (address?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  clearLog: () => void;
}

// --- Native module (typed, lazy, Android-only) -----------------------------

/**
 * Type of the native module's default export, derived via `typeof import(...)`.
 * This is a TYPE-ONLY reference: it is erased at compile time and never emits a
 * runtime `require`, so iOS / Expo Go never touch the native module.
 */
type RNBluetoothClassic = typeof import('react-native-bluetooth-classic').default;

/** A connected device handle, narrowed to the members we actually use. */
interface BluetoothDeviceLike {
  address: string;
  name: string | null;
  disconnect: () => Promise<boolean>;
  onDataReceived: (listener: (event: { data: string }) => void) => { remove: () => void };
}

/**
 * Load the native module lazily. Returns null on iOS, or when the module is not
 * present (Expo Go / not prebuilt) — in which case the hook reports
 * `supported: false` and all actions are no-ops.
 */
function loadNative(): RNBluetoothClassic | null {
  if (Platform.OS !== 'android') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod: unknown = require('react-native-bluetooth-classic');
    if (mod && typeof mod === 'object' && 'default' in mod) {
      return (mod as { default: RNBluetoothClassic }).default;
    }
    return mod as RNBluetoothClassic;
  } catch {
    return null; // Expo Go / module not built into this binary
  }
}

// --- Type guards for untrusted native payloads -----------------------------

function isDataEvent(x: unknown): x is { data: string } {
  return typeof x === 'object' && x !== null && 'data' in x && typeof (x as { data: unknown }).data === 'string';
}

function toScaleDevice(x: unknown): BtScaleDevice | null {
  if (typeof x !== 'object' || x === null) return null;
  const rec = x as { address?: unknown; name?: unknown };
  if (typeof rec.address !== 'string') return null;
  return { address: rec.address, name: typeof rec.name === 'string' ? rec.name : null };
}

// --- Hook ------------------------------------------------------------------

export function useBluetoothScale(opts: { enabled: boolean }): UseBluetoothScale {
  const { enabled } = opts;

  const nativeRef = useRef<RNBluetoothClassic | null>(null);
  if (nativeRef.current === null && enabled && Platform.OS === 'android') {
    nativeRef.current = loadNative();
  }
  const supported = enabled && Platform.OS === 'android' && nativeRef.current !== null;

  const [status, setStatus] = useState<ScaleStatus>('idle');
  const [lastWeightKg, setLastWeightKg] = useState<number | null>(null);
  const [lastStable, setLastStable] = useState<boolean | null>(null);
  const [rawLog, setRawLog] = useState<string[]>([]);
  const [devices, setDevices] = useState<BtScaleDevice[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Mutable refs that must survive re-renders without re-subscribing.
  const mountedRef = useRef(true);
  const deviceRef = useRef<BluetoothDeviceLike | null>(null);
  const subscriptionRef = useRef<{ remove: () => void } | null>(null);
  const lineBufferRef = useRef('');
  // Debounce bookkeeping for status-less frames.
  const debounceValueRef = useRef<number | null>(null);
  const debounceSinceRef = useRef<number>(0);

  const safeSetError = useCallback((msg: string | null) => {
    if (mountedRef.current) setError(msg);
  }, []);

  const clearLog = useCallback(() => {
    if (!mountedRef.current) return;
    setRawLog([]);
  }, []);

  /** Push a raw line into the bounded ring buffer. */
  const pushRaw = useCallback((line: string) => {
    if (!mountedRef.current) return;
    setRawLog((prev) => {
      const next = prev.length >= RAW_LOG_CAP ? prev.slice(prev.length - RAW_LOG_CAP + 1) : prev.slice();
      next.push(line);
      return next;
    });
  }, []);

  /** Decide stability for a reading, applying the debounce for status-less frames. */
  const acceptStable = useCallback((kg: number, stable: boolean | null): boolean => {
    if (stable === true) return true;
    if (stable === false) return false;
    // stable === null: accept when the value is unchanged for STABLE_DEBOUNCE_MS.
    const now = Date.now();
    if (debounceValueRef.current === kg) {
      return now - debounceSinceRef.current >= STABLE_DEBOUNCE_MS;
    }
    debounceValueRef.current = kg;
    debounceSinceRef.current = now;
    return false;
  }, []);

  /** Feed a decoded chunk: buffer, split on CR/LF, parse each whole line. */
  const handleChunk = useCallback(
    (chunk: string) => {
      lineBufferRef.current += chunk;
      const parts = lineBufferRef.current.split(/\r\n|\n|\r/);
      // Keep the last (possibly partial) fragment in the buffer.
      lineBufferRef.current = parts.pop() ?? '';
      for (const line of parts) {
        if (line.length === 0) continue;
        const capped = line.length > MAX_LINE_LENGTH ? line.slice(0, MAX_LINE_LENGTH) : line;
        pushRaw(capped);
        const parsed = parseWeight(capped);
        if (parsed.kg !== null && mountedRef.current) {
          // acceptStable updates the debounce window; lastStable reflects it so
          // the UI can decide whether the reading has settled.
          const settled = acceptStable(parsed.kg, parsed.stable);
          setLastWeightKg(parsed.kg);
          setLastStable(parsed.stable === null ? settled : parsed.stable);
        }
      }
    },
    [pushRaw, acceptStable],
  );

  const teardownSubscription = useCallback(() => {
    if (subscriptionRef.current) {
      try {
        subscriptionRef.current.remove();
      } catch {
        // ignore: subscription already gone
      }
      subscriptionRef.current = null;
    }
    lineBufferRef.current = '';
  }, []);

  const disconnect = useCallback(async () => {
    teardownSubscription();
    const dev = deviceRef.current;
    deviceRef.current = null;
    if (dev) {
      try {
        await dev.disconnect();
      } catch {
        // ignore: best-effort disconnect
      }
    }
    if (mountedRef.current) setStatus('idle');
  }, [teardownSubscription]);

  /** Ask for BLUETOOTH_CONNECT on Android 12+ (no-op/true on older APIs). */
  const ensurePermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return false;
    // Older Android (< 12, API 31) does not expose BLUETOOTH_CONNECT at runtime.
    if (typeof Platform.Version === 'number' && Platform.Version < 31) return true;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  }, []);

  const refreshDevices = useCallback(async () => {
    const native = nativeRef.current;
    if (!supported || !native) {
      safeSetError('La lectura de balanza solo está disponible en Android.');
      return;
    }
    try {
      const ok = await ensurePermission();
      if (!ok) {
        if (mountedRef.current) setStatus('error');
        safeSetError('Permiso de Bluetooth denegado');
        return;
      }
      const bonded: unknown = await native.getBondedDevices();
      const list: BtScaleDevice[] = Array.isArray(bonded)
        ? bonded.map(toScaleDevice).filter((d): d is BtScaleDevice => d !== null)
        : [];
      if (mountedRef.current) setDevices(list);
      safeSetError(null);
    } catch {
      if (mountedRef.current) setStatus('error');
      safeSetError('Activa el Bluetooth y empareja la balanza');
    }
  }, [supported, ensurePermission, safeSetError]);

  const connect = useCallback(
    async (address?: string) => {
      const native = nativeRef.current;
      if (!supported || !native) {
        safeSetError('La lectura de balanza solo está disponible en Android.');
        return;
      }
      if (mountedRef.current) {
        setStatus('connecting');
        setError(null);
      }
      try {
        const ok = await ensurePermission();
        if (!ok) {
          if (mountedRef.current) setStatus('error');
          safeSetError('Permiso de Bluetooth denegado');
          return;
        }

        // Resolve the target address: explicit selection, else name match on the
        // bonded list, else the hardware MAC fallback.
        let target = address ?? null;
        if (!target) {
          const bonded: unknown = await native.getBondedDevices();
          const list: BtScaleDevice[] = Array.isArray(bonded)
            ? bonded.map(toScaleDevice).filter((d): d is BtScaleDevice => d !== null)
            : [];
          if (mountedRef.current) setDevices(list);
          const byName = list.find((d) => d.name === SCALE_DEVICE_NAME);
          target = byName?.address ?? (list.some((d) => d.address === SCALE_DEVICE_MAC) ? SCALE_DEVICE_MAC : null);
        }
        if (!target) {
          if (mountedRef.current) setStatus('error');
          safeSetError('Balanza no emparejada. Emparéjala en Ajustes (PIN 1234)');
          return;
        }

        const connected: unknown = await native.connectToDevice(target);
        const dev = connected as BluetoothDeviceLike;
        if (!dev || typeof dev.onDataReceived !== 'function') {
          if (mountedRef.current) setStatus('error');
          safeSetError('No se pudo conectar con la balanza');
          return;
        }

        deviceRef.current = dev;
        teardownSubscription();
        subscriptionRef.current = dev.onDataReceived((event: unknown) => {
          if (isDataEvent(event)) handleChunk(event.data);
        });

        if (mountedRef.current) {
          setStatus('connected');
          setError(null);
        }
      } catch {
        if (mountedRef.current) setStatus('error');
        safeSetError('No se pudo conectar con la balanza');
      }
    },
    [supported, ensurePermission, handleChunk, teardownSubscription, safeSetError],
  );

  // Cleanup on unmount: remove subscriptions and disconnect.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      teardownSubscription();
      const dev = deviceRef.current;
      deviceRef.current = null;
      if (dev) {
        void dev.disconnect().catch(() => undefined);
      }
    };
  }, [teardownSubscription]);

  return {
    supported,
    status,
    lastWeightKg,
    lastStable,
    rawLog,
    devices,
    error,
    refreshDevices,
    connect,
    disconnect,
    clearLog,
  };
}
