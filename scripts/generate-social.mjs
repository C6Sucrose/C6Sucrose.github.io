import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../public/illustrations/social.svg', import.meta.url));
const destination = fileURLToPath(new URL('../public/illustrations/social.png', import.meta.url));
await sharp(source).resize(1200, 630).png().toFile(destination);
console.log('Generated original 1200×630 social preview.');
