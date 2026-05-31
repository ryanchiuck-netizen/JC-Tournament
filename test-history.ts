import http from 'https';

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => { resolve(data); });
    }).on('error', reject);
  });
}

async function run() {
  try {
    const js = await fetchUrl('https://jc-tournament-planner-569341375821.us-west1.run.app/assets/index-DEfQqT3F.js');
    
    const terms = ["Historical Player Data", "snapshot", "SELECT DATE", "saved_players", "notifications_history"];
    for (const term of terms) {
      const index = js.indexOf(term);
      if (index !== -1) {
        console.log(`\nFound term "${term}" at index ${index}:`);
        console.log(js.substring(index - 500, index + 3500));
      } else {
        console.log(`\nTerm "${term}" not found.`);
      }
    }
  } catch (err) {
    console.error(err);
  }
}

run();
