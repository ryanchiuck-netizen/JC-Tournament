import axios from 'axios';
async function test() {
  const url = 'https://ais-dev-4jh7gjo2ywbk55nnlrhsts-520673192334.asia-southeast1.run.app/';
  const r = await axios.get(url);
  console.log(r.status);
}
test();
