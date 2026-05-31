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
    const url = 'https://jc-tournament-planner-569341375821.us-west1.run.app/api/player-snapshots';
    console.log("Fetching from reference app API:", url);
    const text = await fetchUrl(url);
    console.log("Response text length:", text.length);
    console.log("Preview (first 1000 chars):");
    console.log(text.substring(0, 1500));
    console.log("\nPreview (last 1000 chars):");
    console.log(text.substring(text.length - 1000));
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

run();
