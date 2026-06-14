const axios = require('axios');
(async () => {
  try {
    const res = await axios.get('http://localhost:3000/api/tournaments-for-players?refresh=true', {
      headers: {
        cookie: 'auth=true',
        'jc-auth-token': 'jc-tennis-admin'
      },
      timeout: 300000 // 5 minutes
    });
    console.log("Refreshed. Status:", res.status);
  } catch (err) {
    console.error("Error refreshing:");
    console.error(err.message);
  }
})();
