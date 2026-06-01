const { exec } = require("child_process");
exec("pkill -f tsx", (err) => console.log(err));
