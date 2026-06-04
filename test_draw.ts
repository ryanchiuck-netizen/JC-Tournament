import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const drawUrl = 'https://tournaments.tennis.com.au/sport/event.aspx?id=BE903BBF-1DFF-475D-A5F5-1A68B8D7C25B&event=13';
  try {
    const res = await axios.get(drawUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 10000
    });
    
    const $ = cheerio.load(res.data);
    console.log('Page Title:', $('title').text().trim());
    console.log('--- Headings ---');
    $('h1, h2, h3, h4, h5, h6').each((_, el) => {
      console.log(`${el.name}: "${$(el).text().trim()}"`);
    });
    
    console.log('\n--- Media Titles ---');
    $('.media__title, .media__subheading').each((_, el) => {
      console.log(`Class: ${$(el).attr('class')} | Text: "${$(el).text().trim()}"`);
    });

    console.log('\n--- Candidate draw names ---');
    let drawNameCandidate = $("h2").first().text().trim() || $(".media__title").first().text().trim();
    console.log('Basic drawNameCandidate:', drawNameCandidate);
    
    const titleText = $('title').text().trim();
    if (titleText.includes(' - Draws - ')) {
      console.log('Parsed draw name from Title:', titleText.split(' - Draws - ')[1]);
    } else if (titleText.includes(' - Draw - ')) {
      console.log('Parsed draw name from Title (singular):', titleText.split(' - Draw - ')[1]);
    }
  } catch (err) {
    console.error(err);
  }
}
run();
