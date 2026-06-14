const fs = require('fs');
const data = JSON.parse(fs.readFileSync('public/tournaments-for-players.json', 'utf8'));
const matches = data.tournaments.filter(x => x.tournament.name.includes('2026 JDS CBC Metro Panania Tennis 10u Green Ball'));
matches.forEach(t => {
  console.log("Tournament:", t.tournament.name);
  if (t.joinedPlayers) t.joinedPlayers.forEach(jp => console.log(" - ", jp.player.name));
});
