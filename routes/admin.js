const { query } = require('../db');
const express = require('express');
const router = express.Router();
const memoryCache = require('../utils/cache');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// GET /api/admin/vendors - All vendors with payment/subscription info (N+1 Optimized & Paginated)
router.get('/vendors', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { search, page = 1, limit = 50 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
        const offset = (pageNum - 1) * limitNum;

        let sql = `
            SELECT v.vendor_id, v.society_id, v.vendor_name, v.gst_number, v.phone_number, v.email, 
                   v.store_name, v.logo, v.description, v.status, v.created_at as vendor_created_at,
                   s.society_name, s.location,
                   sub.subscription_id, sub.start_date, sub.end_date, sub.status as subscription_status
            FROM vendors v
            JOIN societies s ON v.society_id = s.society_id
            LEFT JOIN subscriptions sub ON v.vendor_id = sub.vendor_id
        `;
        const params = [];
        if (search) {
            sql += ` WHERE LOWER(v.vendor_name) LIKE ? OR LOWER(s.society_name) LIKE ? OR LOWER(v.store_name) LIKE ?`;
            const q = `%${search.toLowerCase()}%`;
            params.push(q, q, q);
        }
        sql += ` ORDER BY v.vendor_id DESC LIMIT ${limitNum} OFFSET ${offset}`;

        const result = await query(sql, params);
        const vendors = result.rows;

        // Batch fetch all payments in a single query (Eliminates N+1 loop bottleneck)
        if (vendors.length > 0) {
            const vendorIds = vendors.map(v => v.vendor_id);
            const placeholders = vendorIds.map(() => '?').join(',');
            const payRes = await query(`SELECT * FROM payments WHERE vendor_id IN (${placeholders}) ORDER BY payment_id DESC`, vendorIds);

            const paymentMap = new Map();
            payRes.rows.forEach(p => {
                if (!paymentMap.has(p.vendor_id)) paymentMap.set(p.vendor_id, []);
                paymentMap.get(p.vendor_id).push(p);
            });

            for (let vendor of vendors) {
                vendor.payments = paymentMap.get(vendor.vendor_id) || [];
                vendor.package_placement = 'Standard Annual Vendor Subscription (1 Year)';
            }
        }

        res.status(200).json(vendors);
    } catch (err) {
        console.error('Error fetching admin vendors:', err);
        res.status(500).json({ error: 'Failed to fetch vendors for admin' });
    }
});

// GET /api/admin/requests - Pending vendor requests
router.get('/requests', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await query(`
            SELECT v.*, s.society_name, s.location, p.payment_method, p.transaction_id, p.amount as paid_amount
            FROM vendors v
            JOIN societies s ON v.society_id = s.society_id
            LEFT JOIN payments p ON v.vendor_id = p.vendor_id
            WHERE v.status = 'PENDING'
            ORDER BY v.vendor_id DESC
        `);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error fetching vendor requests:', err);
        res.status(500).json({ error: 'Failed to fetch vendor requests' });
    }
});

// POST /api/admin/requests/:vendorId/approve - Approve vendor request
router.post('/requests/:vendorId/approve', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { vendorId } = req.params;

        const today = new Date();
        const nextYear = new Date();
        nextYear.setFullYear(today.getFullYear() + 1);

        const startDateStr = today.toISOString().split('T')[0];
        const endDateStr = nextYear.toISOString().split('T')[0];

        await query(`UPDATE vendors SET status = 'ACTIVE' WHERE vendor_id = ?`, [vendorId]);

        const subCheck = await query(`SELECT subscription_id FROM subscriptions WHERE vendor_id = ?`, [vendorId]);
        if (subCheck.rows.length > 0) {
            await query(
                `UPDATE subscriptions SET status = 'ACTIVE', start_date = ?, end_date = ?, updated_at = CURRENT_TIMESTAMP WHERE vendor_id = ?`,
                [startDateStr, endDateStr, vendorId]
            );
        } else {
            await query(
                `INSERT INTO subscriptions (vendor_id, start_date, end_date, status) VALUES (?, ?, ?, 'ACTIVE')`,
                [vendorId, startDateStr, endDateStr]
            );
        }

        memoryCache.clear(); // Invalidate cached lists

        res.status(200).json({
            message: 'Vendor request approved successfully! Vendor is now active with 1-Year Subscription.',
            vendor_id: vendorId,
            start_date: startDateStr,
            end_date: endDateStr
        });
    } catch (err) {
        console.error('Error approving vendor request:', err);
        res.status(500).json({ error: 'Failed to approve vendor request' });
    }
});

// POST /api/admin/requests/:vendorId/reject - Reject vendor request
router.post('/requests/:vendorId/reject', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { vendorId } = req.params;
        await query(`UPDATE vendors SET status = 'REJECTED' WHERE vendor_id = ?`, [vendorId]);
        await query(`UPDATE subscriptions SET status = 'CANCELLED' WHERE vendor_id = ?`, [vendorId]);
        memoryCache.clear();
        res.status(200).json({ message: 'Vendor request rejected', vendor_id: vendorId });
    } catch (err) {
        res.status(500).json({ error: 'Failed to reject vendor request' });
    }
});

// GET /api/admin/config - Get platform config (logo + name) - Cached
router.get('/config', async (req, res) => {
    try {
        const cacheKey = 'admin_config';
        const cachedConfig = memoryCache.get(cacheKey);
        if (cachedConfig) {
            return res.status(200).json(cachedConfig);
        }

        const result = await query(`SELECT config_key, config_value FROM platform_config`);
        const config = { platform_logo: 'https://imgh.in/host/ucila6', platform_name: 'DigiLocal' };
        (result.rows || []).forEach(row => { config[row.config_key] = row.config_value; });

        memoryCache.set(cacheKey, config, 120000); // 2-minute cache
        res.status(200).json(config);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch platform config' });
    }
});

// PUT & POST /api/admin/config - Update platform config
const handleUpdateConfig = async (req, res) => {
    try {
        const { platform_logo, platform_name } = req.body;
        if (platform_logo) {
            const check = await query(`SELECT * FROM platform_config WHERE config_key = 'platform_logo'`);
            if (check.rows.length === 0)
                await query(`INSERT INTO platform_config (config_key, config_value) VALUES ('platform_logo', ?)`, [platform_logo]);
            else
                await query(`UPDATE platform_config SET config_value = ? WHERE config_key = 'platform_logo'`, [platform_logo]);
        }
        if (platform_name) {
            const check = await query(`SELECT * FROM platform_config WHERE config_key = 'platform_name'`);
            if (check.rows.length === 0)
                await query(`INSERT INTO platform_config (config_key, config_value) VALUES ('platform_name', ?)`, [platform_name]);
            else
                await query(`UPDATE platform_config SET config_value = ? WHERE config_key = 'platform_name'`, [platform_name]);
        }
        memoryCache.del('admin_config');
        res.status(200).json({ message: 'Platform configuration updated successfully', platform_logo, platform_name });
    } catch (err) {
        console.error('Error updating config:', err);
        res.status(500).json({ error: 'Failed to update platform configuration' });
    }
};

router.put('/config', authenticateToken, requireAdmin, handleUpdateConfig);
router.post('/config', authenticateToken, requireAdmin, handleUpdateConfig);
router.put('/logo', authenticateToken, requireAdmin, handleUpdateConfig);
router.post('/logo', authenticateToken, requireAdmin, handleUpdateConfig);

module.exports = router;
