import React from 'react';
import { Text, TextInput, StyleSheet } from 'react-native';
import type { TextProps, TextStyle, TextInputProps } from 'react-native';
import { useFontScale } from '../hooks/useFontScale';

/**
 * AppText / AppTextInput — texto escalable por preferencia in-app.
 *
 * Muchos administradores de fundo son de tercera edad; la escala de fuente
 * in-app agranda el texto sin depender del ajuste del SO. Estos componentes
 * leen el factor activo del contexto FontScale y escalan ÚNICAMENTE el
 * `fontSize` presente en su PROPIO estilo.
 *
 * Regla de Text anidado (React Native):
 * RN aplica `fontSize` solo desde el Text con estilo más externo; un Text
 * anidado sin `fontSize` propio hereda el tamaño (ya escalado) del padre.
 * Como AppText escala solo el `fontSize` presente en su propio estilo y NO
 * inyecta nada cuando está ausente, el texto anidado se escala exactamente una
 * vez en ambos casos:
 *   - hijo sin `fontSize` propio: hereda el tamaño ya escalado del padre.
 *   - hijo con `fontSize` propio: se escala a sí mismo una sola vez.
 * No hay doble aplicación.
 *
 * Se pasa `allowFontScaling={false}` al componente RN subyacente para que el
 * ajuste de fuente del SO no vuelva a escalar encima del factor in-app.
 */

export type { TextProps, TextStyle, TextInputProps } from 'react-native';

/**
 * Escala el `fontSize` propio del estilo por el factor activo. Si el estilo no
 * trae un `fontSize` numérico, devuelve el estilo sin tocar (deja que la
 * herencia/los defaults de RN manden).
 */
function scaleStyle(
  style: TextProps['style'] | TextInputProps['style'],
  factor: number,
): TextProps['style'] | TextInputProps['style'] {
  const flat = (StyleSheet.flatten(style) || {}) as TextStyle;
  if (typeof flat.fontSize !== 'number') return style;
  return [style, { fontSize: Math.round(flat.fontSize * factor) }];
}

export const AppText = React.forwardRef<Text, TextProps>((props, ref) => {
  const { factor } = useFontScale();
  const { style, ...rest } = props;
  return <Text ref={ref} allowFontScaling={false} style={scaleStyle(style, factor)} {...rest} />;
});
AppText.displayName = 'AppText';

export const AppTextInput = React.forwardRef<TextInput, TextInputProps>((props, ref) => {
  const { factor } = useFontScale();
  const { style, ...rest } = props;
  return (
    <TextInput
      ref={ref}
      allowFontScaling={false}
      style={scaleStyle(style, factor) as TextInputProps['style']}
      {...rest}
    />
  );
});
AppTextInput.displayName = 'AppTextInput';
