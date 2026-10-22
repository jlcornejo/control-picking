import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Escala de fuente accesible (preferencia in-app).
 *
 * Muchos administradores de fundo son de tercera edad; esta preferencia agranda
 * el texto de la app sin depender de los ajustes del sistema operativo.
 *
 * Mecanismo (context-only): el provider expone el factor activo por contexto.
 * Los componentes `AppText`/`AppTextInput` (src/components/AppText.tsx) leen ese
 * factor y escalan su propio `fontSize`. No se parchean los módulos internos de
 * React Native ni se remonta el árbol: el cambio de factor re-renderiza a los
 * consumidores del contexto.
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

export function FontScaleProvider({ children }: { children: React.ReactNode }) {
  const [scale, setScaleState] = useState<FontScaleKey>('normal');
  const [loaded, setLoaded] = useState(false);

  // Cargar la preferencia persistida al montar.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v && v in FONT_SCALES) {
        setScaleState(v as FontScaleKey);
      }
      setLoaded(true);
    });
  }, []);

  const setScale = useCallback((s: FontScaleKey) => {
    setScaleState(s);
    AsyncStorage.setItem(STORAGE_KEY, s);
  }, []);

  const factor = FONT_SCALES[scale];

  return (
    <FontScaleContext.Provider value={{ scale, factor, setScale, loaded }}>
      {children}
    </FontScaleContext.Provider>
  );
}

export function useFontScale() {
  return useContext(FontScaleContext);
}
