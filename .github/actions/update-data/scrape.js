// .github/actions/update-data/scrape.js
const fs = require('fs').promises;
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const FUNPAY_USER_URL = process.env.FUNPAY_USER_URL || 'https://funpay.com/users/11006828/';
const TG_CHANNEL_WEB = process.env.TG_CHANNEL_WEB || 'https://t.me/s/sanzenand_fp';

async function fetchHTML(url, opts = {}) {
  const headers = Object.assign({
    'User-Agent': 'Mozilla/5.0 (compatible; Bot/1.0; +https://github.com)',
    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
  }, opts.headers || {});
  const res = await fetch(url, { headers, timeout: 30000 });
  if (!res.ok) throw new Error(`Fetch failed ${url} status ${res.status}`);
  return await res.text();
}

function cleanText(s) {
  if (!s) return '';
  return s.replace(/\s+/g, ' ').trim();
}

async function parseFunpay(html) {
  const $ = cheerio.load(html);
  const reviews = [];

  // Try common selectors used on marketplace feedback blocks (best-effort)
  // 1) Newer FunPay layout (attempt)
  $('.feedbacks__item, .feedback-item, .review, .feedback').each((i, el) => {
    const $el = $(el);
    const author = cleanText($el.find('.feedbacks__name, .buyer-name, .feedback-user, .user-name').text()) || '';
    const text = cleanText($el.find('.feedbacks__text, .feedback-text, .review-text, .feedback-body').text()) || cleanText($el.text());
    let rating = '';
    const star = $el.find('.rating, .stars, .rating-stars').attr('data-rating') || $el.find('.rating-stars').text();
    if (star) rating = cleanText(star);
    const time = cleanText($el.find('.feedbacks__date, .date, .time').text()) || '';
    if (text && text.length > 3) {
      reviews.push({ author: author || 'Пользователь', rating, text, time });
    }
  });

  // 2) If none found, look for blocks containing 'Отзыв' or typical short texts
  if (reviews.length === 0) {
    $('div, p, li').each((i, el) => {
      const t = cleanText($(el).text());
      if (t.length > 60 && /отзыв|review|спасибо|рекомендую/i.test(t)) {
        reviews.push({ author: 'Пользователь', rating: '', text: t.slice(0, 1000), time: '' });
      }
    });
  }

  // 3) Limit results
  return reviews.slice(0, 50);
}

async function parseTelegram(html) {
  const $ = cheerio.load(html);
  const posts = [];

  $('.tgme_widget_message_wrap, .tgme_widget_message').each((i, el) => {
    const $el = $(el);
    const time = $el.find('time').attr('datetime') || cleanText($el.find('.tgme_widget_message_date').text()) || '';
    const text = cleanText($el.find('.tgme_widget_message_text').text()) || '';
    const link = ($el.find('.tgme_widget_message_date a').attr('href') || '').trim();
    const id = link.split('/').pop() || String(i + 1);
    if (text || link) posts.push({ id, time, text, link });
  });

  // Fallback: find any message text blocks
  if (posts.length === 0) {
    $('.tgme_widget_message_text').each((i, el) => {
      const t = cleanText($(el).text());
      if (t) posts.push({ id: String(i + 1), time: '', text: t, link: '' });
    });
  }

  return posts.slice(0, 50);
}

(async () => {
  try {
    console.log('Fetching FunPay page:', FUNPAY_USER_URL);
    let funpayHtml = '';
    try {
      funpayHtml = await fetchHTML(FUNPAY_USER_URL);
    } catch (e) {
      console.error('FunPay fetch failed:', e.message);
    }
    const reviews = funpayHtml ? await parseFunpay(funpayHtml) : [];
    await fs.writeFile('reviews.json', JSON.stringify(reviews, null, 2), 'utf8');
    console.log('Saved reviews.json, count:', reviews.length);

    console.log('Fetching Telegram channel (web):', TG_CHANNEL_WEB);
    let tgHtml = '';
    try {
      tgHtml = await fetchHTML(TG_CHANNEL_WEB);
    } catch (e) {
      console.error('Telegram fetch failed:', e.message);
    }
    const tg_posts = tgHtml ? await parseTelegram(tgHtml) : [];
    await fs.writeFile('tg_posts.json', JSON.stringify(tg_posts, null, 2), 'utf8');
    console.log('Saved tg_posts.json, count:', tg_posts.length);

    process.exit(0);
  } catch (err) {
    console.error('Fatal error in scraper:', err);
    // write empty arrays to avoid breaking site
    try {
      await fs.writeFile('reviews.json', JSON.stringify([], null, 2), 'utf8');
      await fs.writeFile('tg_posts.json', JSON.stringify([], null, 2), 'utf8');
    } catch (e) { /* ignore */ }
    process.exit(1);
  }
})();
