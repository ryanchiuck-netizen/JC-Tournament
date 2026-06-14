const fs = require('fs');
const data = JSON.parse(fs.readFileSync('public/saved-players.json', 'utf8'));
const gavs = data.filter(p => p.name === 'Gavrilo Novkovic');
console.log('Count:', gavs.length);
console.log('Sources:', gavs.map(g => g.source));
