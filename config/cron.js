const cron = require('node-cron');
const { query } = require('../db');
const { sendSubscriptionExpiryEmail } = require('./email');

/**
 * Starts the daily subscription expiry cron job.
 * Runs every day at 9:00 AM.
 * Emails all vendors whose subscription ends within 7 days (or has already expired).
 */
const startSubscriptionCron = () => {
    cron.schedule('0 9 * * *', async () => {
        console.log('[Cron] Running daily subscription expiry check...');
        try {
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];

            const result = await query(`
                SELECT v.vendor_id, v.vendor_name, v.store_name, v.email,
                       s.end_date, s.status as sub_status,
                       CAST(julianday(s.end_date) - julianday(?) AS INTEGER) as days_left
                FROM vendors v
                JOIN subscriptions s ON s.vendor_id = v.vendor_id
                WHERE s.status = 'ACTIVE'
                  AND s.end_date IS NOT NULL
                  AND CAST(julianday(s.end_date) - julianday(?) AS INTEGER) <= 7
            `, [todayStr, todayStr]);

            for (const vendor of (result.rows || [])) {
                await sendSubscriptionExpiryEmail(vendor, vendor.days_left);
            }

            console.log(`[Cron] Done. Emailed ${(result.rows || []).length} vendor(s).`);
        } catch (err) {
            console.error('[Cron] Error during subscription check:', err.message);
        }
    });

    console.log('[Cron] Subscription expiry check scheduled (daily at 9:00 AM).');
};

module.exports = { startSubscriptionCron };
