import fs from 'fs';
const data = JSON.parse(fs.readFileSync('public/tournaments.json', 'utf-8'));
const counts = data.tournaments.map(t => t.players ? t.players.length : -1);
console.log('Total tournaments:', counts.length);
console.log('Without players array (-1):', counts.filter(c => c === -1).length);
console.log('With empty players array (0):', counts.filter(c => c === 0).length);
console.log('With players (>0):', counts.filter(c => c > 0).length);
