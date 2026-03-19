const cron = require('node-cron');
const { Posts, Config, Keywords } = require('./database');
const { createGBPPost, isAuthenticated } = require('./google');
const { generateAndQueuePost } = require('./ai');

let schedulerRunning = false;

// Run every 5 minutes — checks if any posts are due
function startScheduler() {
  if (schedulerRunning) return;
  schedulerRunning = true;

  console.log('[Scheduler] Started — checking every 5 minutes for due posts');

  // Check for due posts every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    await processDuePosts();
  });

  // Generate new posts in advance (every Mon/Wed/Fri at 6am — 3hrs before posting)
  // This ensures we always have content queued
  cron.schedule('0 6 * * 1,3,5', async () => {
    await ensureQueueHasContent();
  });

  // Initial queue check on startup
  setTimeout(async () => {
    await ensureQueueHasContent();
  }, 5000);
}

// Publish any posts that are due right now
async function processDuePosts() {
  if (!isAuthenticated()) return;

  const locationName = Config.get('gbp_location');
  if (!locationName) return;

  const businessInfo = Config.get('business_info');

  const duePost = Posts.getDue();
  if (!duePost) return;

  console.log(`[Scheduler] Publishing post #${duePost.id}: "${duePost.title}"`);

  try {
    const result = await createGBPPost({
      locationName,
      title: duePost.title,
      body: duePost.body,
      ctaType: 'LEARN_MORE',
      ctaUrl: duePost.cta_url || businessInfo?.website,
    });

    Posts.markPosted(duePost.id, result.name || 'posted');
    console.log(`[Scheduler] ✓ Post #${duePost.id} published successfully`);

    // Immediately queue the next post
    await ensureQueueHasContent();
  } catch (err) {
    console.error(`[Scheduler] ✗ Post #${duePost.id} failed:`, err.message);
    Posts.markFailed(duePost.id, err.message);
  }
}

// Make sure there's always content in the queue
async function ensureQueueHasContent() {
  if (!isAuthenticated()) return;

  const kwCount = Keywords.count();
  if (kwCount === 0) {
    console.log('[Scheduler] No keywords yet — skipping queue fill');
    return;
  }

  const pending = Posts.getPending();
  const TARGET_QUEUE = 3; // Always keep 3 posts queued ahead

  if (pending.length < TARGET_QUEUE) {
    const needed = TARGET_QUEUE - pending.length;
    console.log(`[Scheduler] Queue has ${pending.length} posts, generating ${needed} more...`);

    for (let i = 0; i < needed; i++) {
      try {
        await generateAndQueuePost();
        // Small delay between generations
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        console.error('[Scheduler] Failed to generate post:', err.message);
        break;
      }
    }
  }
}

// Manually trigger post generation (for API/UI)
async function triggerGeneration() {
  return await generateAndQueuePost();
}

// Manually trigger immediate publish of next pending post (for testing)
async function triggerPublish() {
  const locationName = Config.get('gbp_location');
  if (!locationName) throw new Error('No GBP location selected');

  const pending = Posts.getPending();
  if (!pending.length) throw new Error('No pending posts in queue');

  const post = pending[0];
  const businessInfo = Config.get('business_info');

  const result = await createGBPPost({
    locationName,
    title: post.title,
    body: post.body,
    ctaType: 'LEARN_MORE',
    ctaUrl: post.cta_url || businessInfo?.website,
  });

  Posts.markPosted(post.id, result.name || 'posted');
  return post;
}

module.exports = { startScheduler, processDuePosts, ensureQueueHasContent, triggerGeneration, triggerPublish };
