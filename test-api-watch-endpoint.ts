import axios from "axios";

async function run() {
  try {
    const url = "http://localhost:3000/api/player-watch?name=jordan+chiu";
    console.log("Fetching from:", url);
    const res = await axios.get(url);
    console.log("Success! Response:", res.data);
  } catch (error: any) {
    if (error.response) {
      console.error("Error Response Data:", error.response.data);
      console.error("Error Status:", error.response.status);
    } else {
      console.error("Error Message:", error.message);
    }
  }
}

run();
