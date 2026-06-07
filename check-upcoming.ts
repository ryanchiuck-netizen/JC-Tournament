import fs from 'fs';
const data = JSON.parse(fs.readFileSync('public/tournaments.json', 'utf-8'));
let upcomingCount = 0;
data.tournaments.forEach(tournament => {
    if (tournament.dates) {
        const parts = tournament.dates.split(' to ');
        const endDateParts = parts[parts.length - 1].trim().split('/');
        if (endDateParts.length >= 3) {
        const endDate = new Date(parseInt(endDateParts[2]), parseInt(endDateParts[1]) - 1, parseInt(endDateParts[0]));
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        if (endDate >= cutoff) {
            if (!tournament.players || tournament.players.length === 0) {
               upcomingCount++;
            }
        }
        }
    }
});
console.log('Upcoming/recent with 0 players:', upcomingCount);
