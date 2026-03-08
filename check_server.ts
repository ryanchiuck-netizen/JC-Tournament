import axios from 'axios';

async function check() {
  try {
    const res = await axios.get('http://localhost:3000/api/auth/url');
    console.log('Server is responding:', res.status, res.data);
  } catch (err: any) {
    console.error('Server is NOT responding:', err.message);
  }
}

check();
