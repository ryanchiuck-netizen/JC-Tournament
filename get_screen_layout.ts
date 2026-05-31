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
    const index = js.indexOf('View History');
    if (index !== -1) {
      console.log("Printing further around 'View History' button...");
      console.log(js.substring(index - 500, index + 8000));
    }
  } catch (err) {
    console.error(err);
  }
}

run();
