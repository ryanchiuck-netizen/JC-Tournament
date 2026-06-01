import axios from "axios";
axios.post("http://localhost:3000/api/force-scrape", {}, {headers:{cookie:"user=1"}}).then(r => console.log(r.data)).catch(console.error);
