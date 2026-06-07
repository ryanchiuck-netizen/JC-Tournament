import axios from "axios";

async function run() {
  try {
    const devUrl = "https://ais-dev-4jh7gjo2ywbk55nnlrhsts-520673192334.asia-southeast1.run.app/";
    console.log("Fetching root URL:", devUrl);
    const res = await axios.get(devUrl);
    console.log("Success! Status:", res.status);
    
    const apiDevUrl = "https://ais-dev-4jh7gjo2ywbk55nnlrhsts-520673192334.asia-southeast1.run.app/api/player-watch?name=jordan+chiu";
    const resApi = await axios.get(apiDevUrl);
    console.log("API Status:", resApi.status);
  } catch (error: any) {
    if (error.response) {
      console.error("Error Status:", error.response.status);
    } else {
      console.error("Error Message:", error.message);
    }
  }
}

run();
