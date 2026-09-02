// Genera los assets de icono/splash de Fundo360 a partir de un SVG de hoja.
// Uso: node scripts/generate-icons.mjs
// Requiere: sharp (ya disponible en node_modules del monorepo)
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = resolve(__dirname, '../assets');
mkdirSync(assetsDir, { recursive: true });

const GREEN_DARK = '#166534';
const GREEN_LIGHT = '#4caf50';

// Silueta de hoja con nervadura (estilo Ionicons "leaf"), viewBox 0 0 512 512.
const leafBody = `M96 416 C96 288 176 128 416 96 C400 320 288 400 160 400 Z`;
const leafVein = `M160 400 C224 336 288 304 352 288`;

// SVG del logo: hoja blanca, opcionalmente sobre cuadro con gradiente verde.
function logoSvg({ size = 1024, withBackground = true, leafScale = 0.5 } = {}) {
  const s = size;
  const scale = (s * leafScale) / 512;
  const tx = s / 2 - (512 * scale) / 2;
  const ty = s / 2 - (512 * scale) / 2;
  const bg = withBackground
    ? `<rect x="0" y="0" width="${s}" height="${s}" rx="${s * 0.22}" fill="url(#g)"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${GREEN_DARK}"/>
      <stop offset="1" stop-color="${GREEN_LIGHT}"/>
    </linearGradient>
  </defs>
  ${bg}
  <g transform="translate(${tx} ${ty}) scale(${scale})" stroke="#ffffff" stroke-width="30" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="${leafBody}" fill="#ffffff" fill-opacity="0.14"/>
    <path d="${leafVein}"/>
  </g>
</svg>`;
}

async function render(svg, outfile, size) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(resolve(assetsDir, outfile));
  console.log('written', outfile, size + 'x' + size);
}

const jobs = [
  { svg: logoSvg({ size: 1024, withBackground: true, leafScale: 0.5 }), out: 'icon.png', size: 1024 },
  { svg: logoSvg({ size: 1024, withBackground: false, leafScale: 0.38 }), out: 'adaptive-icon.png', size: 1024 },
  { svg: logoSvg({ size: 1024, withBackground: false, leafScale: 0.4 }), out: 'splash-icon.png', size: 1024 },
  { svg: logoSvg({ size: 256, withBackground: true, leafScale: 0.5 }), out: 'favicon.png', size: 256 },
];

for (const j of jobs) {
  await render(j.svg, j.out, j.size);
}
console.log('Done. Assets en', assetsDir);
