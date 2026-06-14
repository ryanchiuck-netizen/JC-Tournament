const fs = require('fs');
const tournaments = JSON.parse(fs.readFileSync('public/tournaments.json', 'utf8')).tournaments;
tournaments.forEach(t => {
  if (t.players && t.players.some(p => p.includes("Novkovic"))) {
    console.log(t.name);
  }
});
