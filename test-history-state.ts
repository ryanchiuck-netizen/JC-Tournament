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
    
    const target = 'Historical Player Data';
    const index = js.indexOf(target);
    if (index !== -1) {
      console.log(`Found "${target}" at index ${index}`);
      // Find the start of the function by searching backwards for a typical React function start or similar
      // Let's print 4000 characters before the target
      console.log(js.substring(index - 4000, index));
    }
  } catch (err) {
    console.error(err);
  }
}

run();
