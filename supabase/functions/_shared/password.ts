// supabase/functions/_shared/password.ts
//
// Generador de contraseñas temporales para usuarios de login (sección "Usuarios").
// La política de Auth del proyecto remoto es desconocida y puede exigir clases de
// caracteres; por eso el generador GARANTIZA por construcción al menos un carácter
// de cada clase (minúscula, mayúscula, dígito, símbolo). Alfabetos sin caracteres
// ambiguos (para dictado verbal admin -> usuario). CSPRNG siempre (nunca Math.random).

const LOWER = 'abcdefghijkmnpqrstuvwxyz'; // sin l, o
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin I, O
const DIGITS = '23456789'; // sin 0, 1
const SYMBOLS = '@#$%*+?';
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

/** Índice uniforme en [0, n) sin sesgo de módulo, usando CSPRNG. */
function randIndex(n: number): number {
  const max = Math.floor(0xffffffff / n) * n; // umbral de rechazo
  const buf = new Uint32Array(1);
  let x: number;
  do {
    crypto.getRandomValues(buf);
    x = buf[0]!;
  } while (x >= max);
  return x % n;
}

function pick(alphabet: string): string {
  return alphabet[randIndex(alphabet.length)]!;
}

/**
 * Contraseña temporal fuerte: longitud >= 12 (default 14), con al menos un
 * carácter de cada clase (minúscula, mayúscula, dígito, símbolo), alfabeto sin
 * caracteres ambiguos, mezclada con Fisher-Yates sobre CSPRNG.
 */
export function generateTempPassword(len = 14): string {
  if (len < 12) len = 12;
  const chars: string[] = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  for (let i = chars.length; i < len; i++) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    // Fisher-Yates
    const j = randIndex(i + 1);
    const tmp = chars[i]!;
    chars[i] = chars[j]!;
    chars[j] = tmp;
  }
  return chars.join('');
}
