const axios = require('axios');
(async () => {
  const url = "https://tournaments.tennis.com.au/tournament/5B2F0DF6-9A96-414C-B1C9-1615410E4582/Players/GetPlayersContent";
  const res = await axios.get(url, { headers: { "X-Requested-With": "XMLHttpRequest", "User-Agent": "Mozilla/5.0" } });
  const lines = res.data.split('\n');
  const idx = lines.findIndex(l => l.includes('Novkovic'));
  console.log(lines.slice(idx - 5, idx + 5).join('\n'));
})();
