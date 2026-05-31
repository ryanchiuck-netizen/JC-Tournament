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
    const hHIndex = js.indexOf('function hH()');
    if (hHIndex !== -1) {
      console.log("Found 'hH' component declaration at:", hHIndex);
      console.log(js.substring(hHIndex, hHIndex + 10000));
    } else {
      console.log("'hH' component declaration not found with exact signature 'function hH()'. Let's search for keywords 'cachedHistory'.");
      const cachedHistIdx = js.indexOf('cachedHistory');
      if (cachedHistIdx !== -1) {
        console.log("Found 'cachedHistory' at:", cachedHistIdx);
        console.log(js.substring(cachedHistIdx - 500, cachedHistIdx + 9500));
      }
    }
  } catch (err) {
    console.error(err);
  }
}

run();
