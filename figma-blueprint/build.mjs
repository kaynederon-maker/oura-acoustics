import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const data = {
  live: 'https://kaynederon-maker.github.io/oura-acoustics/',
  base: 'https://raw.githubusercontent.com/kaynederon-maker/oura-acoustics/redesign',
  hotspots: JSON.parse(readFileSync(here('./shots/hotspots.json'), 'utf8')),
};
const src = readFileSync(here('./src/blueprint.js'), 'utf8').replace('__DATA__', JSON.stringify(data));
writeFileSync(here('./code.js'), src);
writeFileSync(here('./manifest.json'), `${JSON.stringify({
  name: 'Oura Blueprint v3',
  id: 'oura-blueprint-v3',
  api: '1.0.0',
  main: 'code.js',
  editorType: ['figma'],
  documentAccess: 'dynamic-page',
  networkAccess: { allowedDomains: ['https://raw.githubusercontent.com'], reasoning: 'Loads the prototype screenshots from the project repository.' },
}, null, 2)}\n`);
console.log('code.js', src.length, 'bytes');
