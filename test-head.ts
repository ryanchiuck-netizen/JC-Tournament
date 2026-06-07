import axios from "axios";

async function run() {
  try {
    const url = "https://ais-pre-4jh7gjo2ywbk55nnlrhsts-520673192334.asia-southeast1.run.app/api/player-watch?name=jordan+chiu";
    console.log("Fetching headers from:", url);
    const res = await axios.head(url);
    console.log("Success! Headers:", res.headers);
  } catch (error: any) {
    if (error.response) {
      console.error("Error Status:", error.response.status);
      console.error("Error Headers:", error.response.headers);
    } else {
      console.error("Error Message:", error.message);
    }
  }
}

run();
