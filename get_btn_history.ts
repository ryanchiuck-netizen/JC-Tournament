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
    
    // Search for occurrences of 'View History' or how it triggers hH
    const index = js.indexOf('View History');
    if (index !== -1) {
      console.log("Found 'View History' at index:", index);
      console.log(js.substring(index - 500, index + 500));
    } else {
      console.log("'View History' text not found directy.");
      const index2 = js.indexOf('History');
      if (index2 !== -1) {
        console.log("Found 'History' at index:", index2);
        console.log(js.substring(index2 - 500, index2 + 500));
      }
    }
  } catch (err) {
    console.error(err);
  }
}

run();
