const fs = require('fs');
const data = JSON.parse(fs.readFileSync('public/tournaments-for-players.json', 'utf8'));
const matches = data.tournaments.filter(x => x.joinedPlayers?.some(jp => jp.player.name.toLowerCase().includes('gavrilo')));
console.log(`Found ${matches.length} tournaments for Gavrilo:`);
matches.forEach(m => {
  console.log(`- Tournament: "${m.tournament.name}"`);
  console.log(`  Joined Players: `, m.joinedPlayers?.map(jp => jp.player.name));
});
