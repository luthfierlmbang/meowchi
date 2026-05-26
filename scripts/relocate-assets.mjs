import { cpSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'Assets');
const dest = join(root, 'public', 'assets');

if (!existsSync(src)) {
  console.error('Assets/ folder not found at:', src);
  process.exit(1);
}

mkdirSync(dest, { recursive: true });

// Copy all subdirectories, filtering .DS_Store files
cpSync(src, dest, {
  recursive: true,
  filter: (source) => !source.endsWith('.DS_Store'),
});

console.log('✅ Assets relocated to public/assets/');
console.log('Canonical subdirs available:');
console.log('  Idle-Right/, Walking-Right/, Lift-Default/, Lift-Sleepy/');
console.log('  Stratch/, Eat/, Pup/, Sleep/, House/');
console.log('  Items/Fish-Toy.png, Items/Pasir-Kucing/, Items/Stratcher/');
console.log('  toy-action/');
