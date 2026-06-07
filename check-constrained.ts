import fs from 'fs';
const data = JSON.parse(fs.readFileSync('public/tournaments.json', 'utf-8'));
let toFetch = 0;
data.tournaments.forEach(tournament => {
    let isUpcomingOrRecent = false;
    if (tournament.dates) {
        const parts = tournament.dates.split(' to ');
        const endDateParts = parts[parts.length - 1].trim().split('/');
        const startDateParts = parts[0].trim().split('/');
        
        if (endDateParts.length >= 3 && startDateParts.length >= 3) {
            const endDate = new Date(parseInt(endDateParts[2]), parseInt(endDateParts[1]) - 1, parseInt(endDateParts[0]));
            const startDate = new Date(parseInt(startDateParts[2]), parseInt(startDateParts[1]) - 1, parseInt(startDateParts[0]));
            
            const cutoffStart = new Date();
            cutoffStart.setDate(cutoffStart.getDate() - 30);
            
            const cutoffEnd = new Date();
            cutoffEnd.setDate(cutoffEnd.getDate() + 45);
            
            if (endDate >= cutoffStart && startDate <= cutoffEnd) {
                isUpcomingOrRecent = true;
            }
        } else if (endDateParts.length >= 3) { // Single date
            const sameDate = new Date(parseInt(endDateParts[2]), parseInt(endDateParts[1]) - 1, parseInt(endDateParts[0]));
            const cutoffStart = new Date();
            cutoffStart.setDate(cutoffStart.getDate() - 30);
            const cutoffEnd = new Date();
            cutoffEnd.setDate(cutoffEnd.getDate() + 45);
            if (sameDate >= cutoffStart && sameDate <= cutoffEnd) {
                isUpcomingOrRecent = true;
            }
        }
    }
    
    if (isUpcomingOrRecent) {
        toFetch++;
    }
});
console.log('To fetch (constrained):', toFetch);
