const fs = require('fs');
const path = require('path');

const files = fs.readdirSync('public');
files.forEach(f => {
  if (f.endsWith('.json')) {
    const content = fs.readFileSync(path.join('public', f), 'utf8');
    const count = (content.match(/Lyu, Shawn/g) || []).length;
    const count2 = (content.match(/Shawn Lyu/g) || []).length;
    if (count > 0 || count2 > 0) {
      console.log(`File: public/${f} has ${count} "Lyu, Shawn" and ${count2} "Shawn Lyu"`);
    }
  }
});
