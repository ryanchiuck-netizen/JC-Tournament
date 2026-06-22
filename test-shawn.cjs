const fs = require('fs');
const tournaments = JSON.parse(fs.readFileSync('public/tournaments.json', 'utf8')).tournaments;
tournaments.forEach(t => {
  if (t.players) {
    const hasShawn = t.players.some(p => p.toLowerCase().includes('shawn') && p.toLowerCase().includes('lyu'));
    if (hasShawn) {
      console.log(`Match standard: "${t.name}"`);
    }
  }
});
