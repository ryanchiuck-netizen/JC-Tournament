import axios from "axios";

async function run() {
  try {
    const url = "https://ais-pre-4jh7gjo2ywbk55nnlrhsts-520673192334.asia-southeast1.run.app/";
    console.log("Fetching root URL:", url);
    const res = await axios.head(url);
    console.log("Success! Status:", res.status);
  } catch (error: any) {
    if (error.response) {
      console.error("Error Status:", error.response.status);
    } else {
      console.error("Error Message:", error.message);
    }
  }
}

run();
