// Génère les icônes PNG de l'application (monogramme D dans une maison) à partir d'un SVG. Usage : node scripts/make-icons.mjs
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const house = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#fbf7ee"/><g transform="translate(${pad} ${pad}) scale(${(48 - 2 * pad) / 48})"><path d="M24 3 3 20v25h42V20L24 3Z" fill="#0f6b4d"/><path d="M24 3 3 20h42L24 3Z" fill="#e9b44c"/><path d="M17 24h8a8 8 0 0 1 0 16h-8V24Zm4 4v8h4a4 4 0 0 0 0-8h-4Z" fill="#fbf7ee" fill-rule="evenodd"/></g></svg>`;
const out = [["icon-192.png", 192, 2], ["icon-512.png", 512, 2], ["icon-maskable-512.png", 512, 9], ["apple-touch-icon.png", 180, 4]];
for (const [name, size, pad] of out) await sharp(Buffer.from(house(pad))).resize(size, size).png().toFile(`public/icons/${name}`);
writeFileSync("public/icons/icon.svg", house(2));
console.log("icônes générées");
