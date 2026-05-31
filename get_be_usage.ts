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
    
    // Look for where hH is rendered in the app
    const index = js.indexOf('hH');
    let pos = -1;
    let idx = 0;
    while ((pos = js.indexOf('hH', pos + 1)) !== -1) {
      idx++;
      console.log(`\nOccurrence ${idx} of hH:`);
      console.log(js.substring(pos - 300, pos + 800));
    }
  } catch (err) {
    console.error(err);
  }
}

run();
