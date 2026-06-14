const fs = require('fs');
const data = JSON.parse(fs.readFileSync('public/tournaments-for-players.json', 'utf8'));
console.log(data.updatedAt);
