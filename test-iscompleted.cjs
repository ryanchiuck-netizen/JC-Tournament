const dates = "5/07/2026 to 8/07/2026";

const parseDateRange = (dates) => {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
  const parseSingleDate = (dateStr) => {
    const ddmmyyyyMatch = dateStr.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i);
    if (ddmmyyyyMatch) {
      const day = parseInt(ddmmyyyyMatch[1]);
      const monthIdx = months.findIndex(m => m.toLowerCase() === ddmmyyyyMatch[2].toLowerCase());
      const year = parseInt(ddmmyyyyMatch[3]);
      return new Date(year, monthIdx, day);
    }

    const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return new Date(isoMatch[0]);

    const revIsoMatch = dateStr.match(/(\d{2})-(\d{2})-(\d{4})/);
    if (revIsoMatch) {
      const [_, d, m, y] = revIsoMatch;
      return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    }

    const mmmddyyyyMatch = dateStr.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})/i);
    if (mmmddyyyyMatch) {
      const monthIdx = months.findIndex(m => m.toLowerCase() === mmmddyyyyMatch[1].toLowerCase());
      const day = parseInt(mmmddyyyyMatch[2]);
      const year = parseInt(mmmddyyyyMatch[3]);
      return new Date(year, monthIdx, day);
    }

    const slashMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (slashMatch) {
      const day = parseInt(slashMatch[1]);
      const month = parseInt(slashMatch[2]);
      const year = parseInt(slashMatch[3]);
      return new Date(year, month - 1, day);
    }

    return null;
  };

  if (dates.includes(" to ")) {
    const [startStr, endStr] = dates.split(" to ");
    const start = parseSingleDate(startStr);
    const end = parseSingleDate(endStr);
    if (start && end) return { start, end };
    if (start) return { start, end: start };
  }

  const single = parseSingleDate(dates);
  if (single) return { start: single, end: single };

  return null;
};

const isCompleted = (datesStr) => {
  const range = parseDateRange(datesStr);
  if (!range) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(range.end);
  end.setHours(23, 59, 59, 999);
  
  console.log("End Date:", end);
  console.log("Today Date:", today);
  return end < today;
};

console.log("isCompleted:", isCompleted(dates));
