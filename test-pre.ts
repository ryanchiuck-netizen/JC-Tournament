import axios from 'axios';
async function run() {
  try {
     const url = 'https://ais-pre-4jh7gjo2ywbk55nnlrhsts-520673192334.asia-southeast1.run.app/';
     const res = await axios.get(url);
     console.log("Pre Root Status:", res.status);
  } catch(e) {
     console.log("Pre Root Error:", e.message);
  }
}
run();
