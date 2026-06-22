const fs = require('fs');
const tournaments = JSON.parse(fs.readFileSync('public/tournaments.json', 'utf8')).tournaments;
const m = tournaments.find(t => t.name.includes("Mornington Peninsula Premier Junior Tour & Open"));
if (m) {
  console.log(JSON.stringify(m, null, 2));
} else {
  console.log("Not found!");
}
