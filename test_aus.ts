function parseDeadline(deadlineStr: string, tournamentYear: number) {
  const match = deadlineStr.match(/[A-Za-z]{3}\s+(\d{1,2})\s+([A-Za-z]{3})/);
  if (match) {
    const day = parseInt(match[1], 10);
    const monthStr = match[2];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months.indexOf(monthStr);
    if (month !== -1) {
      let year = tournamentYear;
      // If tournament is in Jan/Feb but deadline is in Nov/Dec, subtract 1 from year
      if (month >= 10) { // Nov or Dec
        // We don't have tournament month here, but we can assume if it's Nov/Dec and tournament is early next year.
        // Actually, let's just use the current year if we are scraping now, but we are scraping for 2026.
        // Let's pass the tournament month.
      }
      return `${day}/${month + 1}/${year}`;
    }
  }
  return null;
}
console.log(parseDeadline("Mon 2 Mar 11:59 PM (GMT +11:00)", 2026));
console.log(parseDeadline("Fri 20 Feb 11:59 PM (GMT +08:00)", 2026));
