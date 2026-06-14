const fs = require('fs');
const data = JSON.parse(fs.readFileSync('public/tournaments-for-players.json', 'utf8'));
const t = data.tournaments.find(x => x.tournament.name.includes('2026 JDS CBC Metro Panania Tennis 10u Green Ball #2'));
console.log(JSON.stringify(t, null, 2));
