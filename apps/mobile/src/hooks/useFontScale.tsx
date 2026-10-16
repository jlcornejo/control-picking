import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Escala de fuente accesible (preferencia in-app).
 *
 * Muchos administradores de fundo son de tercera edad; esta preferencia agranda
 * TODO el texto de la app sin depender de los ajustes del sistema operativo.
 *
 * Implementación (RN 0.81 / React 19): se envuelve UNA sola vez el componente
 * `Text`/`TextInput` que exporta React Native, reemplazando el `.default` de sus
 * módulos internos. El `index.js` de RN expone `Text`/`TextInput` como getters
 * que hacen `require('./Libraries/.../X').default` en cada lectura, por lo que
 * todas las pantallas que hacen `import { Text } from 'react-native'` empiezan a
 * resolver nuestro wrapper sin tocar ni un solo archivo de pantalla.
 *
 * El wrapper multiplica el `fontSize` del estilo por el factor activo (leído de
 * un ref mutable). El árbol se re-monta (via key en el provider) al cambiar la
 * escala, igual que hace el branding, para que los Text ya montados vuelvan a
 * renderizar con el nuevo factor.
 */

export type FontScaleKey = 'normal' | 'grande' | 'extra';

export const FONT_SCALES: Record<FontScaleKey, number> = {
  normal: 1,
  grande: 1.15,
  extra: 1.3,
};

export const FONT_SCALE_LABELS: Record<FontScaleKey, string> = {
  normal: 'Normal',
  grande: 'Grande',
  extra: 'Extra grande',
};

const STORAGE_KEY = 'fundo360.font_scale.v1';

interface FontScaleContextValue {
  scale: FontScaleKey;
  factor: number;
  setScale: (s: FontScaleKey) => void;
  loaded: boolean;
}

const FontScaleContext = createContext<FontScaleContextValue>({
  scale: 'normal',
  factor: 1,
  setScale: () => {},
  loaded: false,
});

let installed = false;

/**
 * Factor activo en un contenedor mutable, para que el wrapper lo lea en cada
 * render sin depender de un closure (el provider lo actualiza antes de remontar).
 */
const factorRef = { current: 1 };

/**
 * Crea un wrapper que renderiza el componente original con el `fontSize` del
 * estilo multiplicado por el factor activo. Pasa `allowFontScaling={false}` como
 * PROP (no via defaultProps, ignorado en React 19) para que el factor in-app sea
 * independiente del ajuste del SO y no haya doble escala.
 */
function makeScaledComponent(Original: React.ComponentType<any>): React.ComponentType<any> {
  const Wrapped = React.forwardRef<unknown, any>((props, ref) => {
    const flat = StyleSheet.flatten(props?.style) || {};
    const base = typeof flat.fontSize === 'number' ? flat.fontSize : 14;
    const scaled = Math.round(base * factorRef.current);
    // El fontSize va al final del array para ganar al estilo original.
    const scaledStyle = [props?.style, { fontSize: scaled }];
    return React.createElement(Original, {
      ...props,
      ref,
      allowFontScaling: false,
      style: scaledStyle,
    });
  });
  (Wrapped as any).__fontScaleWrapped = true;
  Wrapped.displayName = (Original as any).displayName || (Original as any).name || 'Text';
  return Wrapped as unknown as React.ComponentType<any>;
}

/**
 * Reemplaza UNA sola vez el `.default` de los módulos internos de Text/TextInput
 * por su versión escalada. Idempotente (tag `__fontScaleWrapped`) para que Fast
 * Refresh no componga el factor. Crash-safe: si un path interno no resuelve, se
 * ignora (el texto simplemente queda en factor 1), nunca se cae la app.
 */
function installFontScaleOverride() {
  if (installed) return;
  installed = true;

  const targets = [
    'react-native/Libraries/Text/Text',
    'react-native/Libraries/Components/TextInput/TextInput',
  ];

  for (const path of targets) {
    try {
      // El require dinámico es intencional: hay que alcanzar el módulo interno
      // de RN para intercambiar su `.default` en runtime (ver doc arriba).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(path);
      const Original = mod?.default;
      if (!Original || (Original as any).__fontScaleWrapped) continue;
      mod.default = makeScaledComponent(Original);
    } catch {
      // Path interno no resoluble en esta versión de RN: no instalar, no crashear.
    }
  }
}

export function FontScaleProvider({ children }: { children: React.ReactNode }) {
  const [scale, setScaleState] = useState<FontScaleKey>('normal');
  const [loaded, setLoaded] = useState(false);

  // Instalar el override y cargar la preferencia persistida al montar.
  useEffect(() => {
    installFontScaleOverride();
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v && v in FONT_SCALES) {
        setScaleState(v as FontScaleKey);
        factorRef.current = FONT_SCALES[v as FontScaleKey];
      }
      setLoaded(true);
    });
  }, []);

  const setScale = useCallback((s: FontScaleKey) => {
    factorRef.current = FONT_SCALES[s];
    setScaleState(s);
    AsyncStorage.setItem(STORAGE_KEY, s);
  }, []);

  const factor = FONT_SCALES[scale];

  return (
    <FontScaleContext.Provider value={{ scale, factor, setScale, loaded }}>
      {/* La key fuerza el remonte del subárbol cuando cambia la escala, para que
          los Text ya montados vuelvan a renderizar a través del wrapper con el
          nuevo factor. */}
      <React.Fragment key={`fs-${scale}`}>{children}</React.Fragment>
    </FontScaleContext.Provider>
  );
}

export function useFontScale() {
  return useContext(FontScaleContext);
}
