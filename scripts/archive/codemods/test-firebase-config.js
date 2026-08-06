import { readFileSync } from 'fs';
console.log(JSON.parse(readFileSync('./firebase-applet-config.json')));
