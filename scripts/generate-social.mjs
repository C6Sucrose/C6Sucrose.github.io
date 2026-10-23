import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
const source = fileURLToPath(new URL('../public/illustrations/social.svg',import.meta.url));
const destination = fileURLToPath(new URL('../public/illustrations/social.png',import.meta.url));
const result = await sharp(source).resize(1200,630).png().toFile(destination);
if (result.width !== 1200 || result.height !== 630) throw new Error('Unexpected social preview dimensions');
console.log(`Generated Transmission social preview: ${result.width}×${result.height}.`);
