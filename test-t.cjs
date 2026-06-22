const fs = require('fs');
const data = JSON.parse(fs.readFileSync('public/tournaments-for-players.json', 'utf8'));
const matches = data.tournaments.filter(x => x.tournament.name.toLowerCase().includes('mornington'));
console.log(`Found ${matches.length} matches:`);
matches.forEach(m => {
  console.log(`- Name: "${m.tournament.name}"`);
  console.log(`  Joined Players: `, m.joinedPlayers?.map(jp => jp.player.name));
});
