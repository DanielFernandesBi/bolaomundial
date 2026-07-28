// Script simples para gerar ícones placeholder do PWA
// Execute: node scripts/generate-icons.js

const fs = require('fs');
const path = require('path');

// Criar um SVG simples com troféu (placeholder)
const createIconSVG = (size) => {
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#EAB308"/>
  <g transform="translate(${size/2}, ${size/2})">
    <!-- Base do troféu -->
    <rect x="-${size*0.15}" y="${size*0.25}" width="${size*0.3}" height="${size*0.1}" fill="#000"/>
    <!-- Corpo do troféu -->
    <path d="M -${size*0.2} ${size*0.25} L -${size*0.15} -${size*0.2} L ${size*0.15} -${size*0.2} L ${size*0.2} ${size*0.25} Z" fill="#000"/>
    <!-- Alças -->
    <path d="M -${size*0.2} -${size*0.1} Q -${size*0.3} -${size*0.2} -${size*0.2} -${size*0.3}" stroke="#000" stroke-width="${size*0.03}" fill="none"/>
    <path d="M ${size*0.2} -${size*0.1} Q ${size*0.3} -${size*0.2} ${size*0.2} -${size*0.3}" stroke="#000" stroke-width="${size*0.03}" fill="none"/>
    <!-- Estrela no topo -->
    <polygon points="0,-${size*0.35} ${size*0.05},-${size*0.25} ${size*0.15},-${size*0.25} ${size*0.06},-${size*0.15} ${size*0.1},-${size*0.05} 0,-${size*0.1} -${size*0.1},-${size*0.05} -${size*0.06},-${size*0.15} -${size*0.15},-${size*0.25} -${size*0.05},-${size*0.25}" fill="#000"/>
  </g>
</svg>`;
};

// Criar diretório public se não existir
const publicDir = path.join(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Gerar ícones SVG (serão convertidos para PNG depois, mas SVG funciona como placeholder)
const icon192 = createIconSVG(192);
const icon512 = createIconSVG(512);

fs.writeFileSync(path.join(publicDir, 'icon-192x192.svg'), icon192);
fs.writeFileSync(path.join(publicDir, 'icon-512x512.svg'), icon512);

console.log('Ícones SVG gerados!');
console.log('Nota: Para produção, converta os SVGs para PNG usando uma ferramenta online ou imagem real.');

