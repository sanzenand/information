// .github/actions/update-data/scrape.js
const fs = require('fs').promises;
const fetch = require('node-fetch');
const cheerio = require('cheerio');

async function fetchFunpay(){
  const url = process.env.FUNPAY_USER_URL;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }});
  const html = await res.text();
  const $ = cheerio.load(html);

  const reviews = [];

  // Примерная логика: ищем блоки отзывов — адаптируй под реальную структуру
  $('.feedback-list .feedback-item').each((i, el) => {
    const author = $(el).find('.buyer-name').text().trim();
    const rating = $(el).find('.rating-stars').attr('data-rating') || '';
    const text = $(el).find('.feedback-text').text().trim();
    const time = $(el).find('.date').text().trim();
    if(text) reviews.push({author, rating, text, time});
  });

  // fallback: если селектор выше не сработал — попытка найти по общим блокам
  if(reviews.length === 0){
    $('div').each((i, el) => {
      const t = $(el).text().trim();
      if(t.length>80 && t.toLowerCase().includes('отзыв')) {
        reviews.push({author: 'User', rating:'', text: t.slice(0,400), time: ''});
      }
    });
  }

  return reviews.slice(0,12);
}

async function fetchTG(){
  const url = process.env.TG_CHANNEL_URL;
  // Telegram не даёт нормального HTML-представления всех постов без API.
  // У нас можно попытаться получить веб-версию через t.me/some/1 etc.
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }});
  const html = await res.text();
  const $ = cheerio.load(html);

  const posts = [];

  // Ищем блоки постов (примерно)
  $('div.tgme_widget_message').each((i, el) => {
    const time = $(el).find('time').attr('datetime') || '';
    const text = $(el).find('.tgme_widget_message_text').text().trim();
    posts.push({time, text});
  });

  // Альтернатива: взять первые строки из страницы
  if(posts.length === 0){
    const candidate = $('.tgme_widget_message_text').first().text().trim();
    if(candidate) posts.push({time:'', text:candidate});
  }

  return posts.slice(0,12);
}

(async ()=>{
  try{
    const reviews = await fetchFunpay();
    const tg = await fetchTG();

    await fs.writeFile('reviews.json', JSON.stringify(reviews, null, 2));
    await fs.writeFile('tg_posts.json', JSON.stringify(tg, null, 2));

    console.log('Saved reviews.json and tg_posts.json');
  }catch(e){
    console.error('Error', e);
    process.exit(1);
  }
})();
