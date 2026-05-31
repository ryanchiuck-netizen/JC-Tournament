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
    
    // Let's find all occurrences of /api/ in the code near "Historical Player Data" or generally
    let pos = 0;
    while ((pos = js.indexOf('/api/', pos)) !== -1) {
      console.log(`\nFound /api/ at index ${pos}:`);
      console.log(js.substring(pos - 100, pos + 200));
      pos += 5;
    }
  } catch (err) {
    console.error(err);
  }
}

run();
