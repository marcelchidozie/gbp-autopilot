const axios = require('axios');
const { Config, Keywords } = require('./database');

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

async function callClaude(prompt, systemPrompt = '') {
  const systemText = systemPrompt || 'You are an expert local SEO content writer for Google Business Profile.';
  const res = await axios.post(
    `${GEMINI_API}?key=${process.env.GEMINI_API_KEY}`,
    {
      contents: [
        {
          parts: [
            { text: `${systemText}\n\n${prompt}` }
          ]
        }
      ],
      generationConfig: {
        maxOutputTokens: 1200,
        temperature: 0.7,
      }
    },
    { headers: { 'Content-Type': 'application/json' } }
  );
  return res.data.candidates[0].content.parts[0].text;
}

// Generate local SEO keywords for the business
async function generateKeywords() {
  const businessInfo = Config.get('business_info');
  if (!businessInfo) throw new Error('Business info not configured yet.');

  const prompt = `Generate 20 high-intent local SEO keywords for Google Business Profile posts for this business:

Business Name: ${businessInfo.name}
Business Type / Category: ${businessInfo.category}
Location: ${businessInfo.location}
Services Offered: ${businessInfo.services}
Target Audience: ${businessInfo.audience}
Unique Selling Points: ${businessInfo.usp}

Requirements:
- Include location-specific keywords (city, neighborhood, region)
- Mix of short-tail and long-tail keywords
- Focus on buyer-intent phrases (people ready to hire/buy)
- Include "near me" variations
- Relevant to the specific services listed

Return ONLY a valid JSON array of 20 keyword strings. No explanation, no markdown backticks. Example format:
["keyword one", "keyword two", "keyword three"]`;

  const raw = await callClaude(prompt);
  const clean = raw.replace(/```json|```/g, '').trim();
  const keywords = JSON.parse(clean);
  Keywords.addMany(keywords);
  return keywords;
}

// Generate a single blog post for GBP
async function generatePost(keyword) {
  const businessInfo = Config.get('business_info');
  const contentStyle = Config.get('content_style');
  if (!businessInfo) throw new Error('Business info not configured.');

  const styleGuide = contentStyle ? `
CONTENT STYLE GUIDELINES (follow these exactly):
${contentStyle.guidelines}

Tone: ${contentStyle.tone}
Post length: ${contentStyle.wordCount || 150} words approximately
Include CTA: ${contentStyle.includeCta ? 'Yes' : 'No'}
CTA URL: ${businessInfo.website || ''}
` : '';

  const prompt = `Write a Google Business Profile post for this business:

Business: ${businessInfo.name}
Category: ${businessInfo.category}
Location: ${businessInfo.location}
Services: ${businessInfo.services}
Website: ${businessInfo.website || 'N/A'}
Target Keyword: "${keyword}"

${styleGuide}

The post should:
- Naturally include the target keyword
- Be written for local SEO (mention location)
- Be engaging and useful to potential customers
- Feel authentic, not spammy
- Be optimized for Google Business Profile (not a full article — a short impactful update)

Return ONLY a valid JSON object with these exact fields:
{
  "title": "Catchy headline under 10 words",
  "body": "The post body text",
  "cta_text": "Call-to-action button text (4-6 words)",
  "image_prompt": "A detailed image generation prompt describing the ideal photo for this post (be specific about setting, mood, style)"
}

No markdown, no explanation. Just the raw JSON.`;

  const raw = await callClaude(prompt);
  const clean = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// Generate the next scheduled post and add to queue
async function generateAndQueuePost() {
  const kwRow = Keywords.getLeastUsed();
  if (!kwRow) throw new Error('No keywords available. Please generate keywords first.');

  console.log(`[AI] Generating post for keyword: "${kwRow.keyword}"`);
  const post = await generatePost(kwRow.keyword);

  // Calculate next posting slot (Mon/Wed/Fri at configured hour)
  const scheduledFor = getNextPostingTime();
  const businessInfo = Config.get('business_info');

  const { Posts, Keywords: KW } = require('./database');
  Posts.add({
    status: 'pending',
    keyword: kwRow.keyword,
    title: post.title,
    body: post.body,
    cta_text: post.cta_text,
    cta_url: businessInfo?.website || '',
    image_prompt: post.image_prompt,
    scheduled_for: scheduledFor,
  });

  KW.markUsed(kwRow.id);
  console.log(`[AI] Post queued for: ${scheduledFor}`);
  return post;
}

// Get next Mon/Wed/Fri posting time
function getNextPostingTime() {
  const postHour = parseInt(process.env.POST_HOUR || '9');
  const postMin = parseInt(process.env.POST_MINUTE || '0');
  const postDays = (process.env.POST_DAYS || '1,3,5').split(',').map(Number);

  const now = new Date();
  const d = new Date(now);
  d.setSeconds(0);
  d.setMilliseconds(0);

  // Find next valid day
  for (let i = 1; i <= 14; i++) {
    d.setDate(now.getDate() + i);
    const dow = d.getDay(); // 0=Sun,1=Mon...
    // Convert to ISO weekday (1=Mon...7=Sun)
    const isoDay = dow === 0 ? 7 : dow;
    if (postDays.includes(isoDay)) {
      d.setHours(postHour, postMin, 0, 0);
      return d.toISOString().replace('T', ' ').substring(0, 19);
    }
  }
  return new Date(now.getTime() + 86400000).toISOString().replace('T', ' ').substring(0, 19);
}

module.exports = { generateKeywords, generatePost, generateAndQueuePost };
