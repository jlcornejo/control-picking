import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { Text, TextInput, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Escala de fuente accesible (preferencia in-app).
 *
 * Muchos administradores de fundo son de tercera edad; esta preferencia agranda
 * TODO el texto de la app sin depender de los ajustes del sistema operativo.
 *
 * Implementación: se parchea una sola vez el render de `Text` y `TextInput` para
 * multiplicar el `fontSize` del estilo por el factor activo. El árbol se re-monta
 * (via key en el provider) cuando cambia la escala, igual que hace el branding.
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

let patched = false;

/**
 * Factor activo en un contenedor mutable, para que el render parcheado lo lea
 * sin depender de un closure (el provider lo actualiza antes de remontar).
 */
const factorRef = { current: 1 };

/**
 * Parchea Text/TextInput UNA sola vez para multiplicar el fontSize del estilo
 * por el factor activo y evitar doble escala con el ajuste del SO.
 */
function patchTextScaling() {
  if (patched) return;
  patched = true;

  for (const Component of [Text, TextInput] as any[]) {
    const defaults = Component.defaultProps || {};
    Component.defaultProps = {
      ...defaults,
      // No dejar que el SO escale ADEMÁS de nuestro factor (evita doble escala).
      allowFontScaling: false,
    };
    const origRender = Component.render;
    if (typeof origRender === 'function' && !origRender.__fontScalePatched) {
      const patchedRender = function (this: unknown, props: any, ref: unknown) {
        const flat = StyleSheet.flatten(props?.style) || {};
        const baseSize = typeof flat.fontSize === 'number' ? flat.fontSize : 14;
        const scaled = Math.round(baseSize * factorRef.current);
        const nextProps = { ...props, style: [props?.style, { fontSize: scaled }] };
        return origRender.call(this, nextProps, ref);
      };
      (patchedRender as any).__fontScalePatched = true;
      Component.render = patchedRender;
    }
  }
}

export function FontScaleProvider({ children }: { children: React.ReactNode }) {
  const [scale, setScaleState] = useState<FontScaleKey>('normal');
  const [loaded, setLoaded] = useState(false);

  // Aplicar el patch y cargar la preferencia persistida al montar.
  useEffect(() => {
    patchTextScaling();
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
          los Text ya montados vuelvan a pasar por el render parcheado. */}
      <React.Fragment key={`fs-${scale}`}>{children}</React.Fragment>
    </FontScaleContext.Provider>
  );
}

export function useFontScale() {
  return useContext(FontScaleContext);
}
