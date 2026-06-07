import fs from 'fs';
const data = JSON.parse(fs.readFileSync('public/tournaments.json', 'utf-8'));
let toFetch = 0;
data.tournaments.forEach(tournament => {
    let isUpcomingOrRecent = false;
    if (tournament.dates) {
        const parts = tournament.dates.split(' to ');
        const endDateParts = parts[parts.length - 1].trim().split('/');
        if (endDateParts.length >= 3) {
            const endDate = new Date(parseInt(endDateParts[2]), parseInt(endDateParts[1]) - 1, parseInt(endDateParts[0]));
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 30);
            if (endDate >= cutoff) {
                isUpcomingOrRecent = true;
            }
        }
    }
    
    // BUT what about those that DON'T parse as >= 3 items in split('/')?
    // Wait... if they don't, isUpcomingOrRecent = false. Which means it skips.
    // Let me check my code logic directly.
    if (!tournament.players || tournament.players.length === 0) {
        if (isUpcomingOrRecent) {
            toFetch++;
        }
    }
});
console.log('To fetch:', toFetch);
