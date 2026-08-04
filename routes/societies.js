const { query } = require('../db');
const express = require('express');
const router = express.Router();
const memoryCache = require('../utils/cache');
const { authenticateToken, requireVendor } = require('../middleware/auth');

// GET /api/societies - List all societies (searchable & cached)
router.get('/', async (req, res) => {
    try {
        const { search } = req.query;
        const cacheKey = `societies_${search || 'all'}`;
        const cachedResult = memoryCache.get(cacheKey);

        if (cachedResult) {
            return res.status(200).json(cachedResult);
        }

        let sql = `
            SELECT s.*, 
                   COUNT(DISTINCT CASE WHEN v.status = 'ACTIVE' THEN v.vendor_id END) as vendor_count
            FROM societies s
            LEFT JOIN vendors v ON s.society_id = v.society_id AND v.status = 'ACTIVE'
        `;
        const params = [];
        if (search) {
            const q = `%${search.toLowerCase()}%`;
            sql += `
                WHERE LOWER(s.society_name) LIKE ?
                   OR LOWER(s.location) LIKE ?
                   OR s.society_id IN (
                       SELECT DISTINCT society_id FROM vendors
                       WHERE status = 'ACTIVE'
                         AND (LOWER(store_name) LIKE ? OR LOWER(vendor_name) LIKE ?)
                   )
            `;
            params.push(q, q, q, q);
        }
        sql += ` GROUP BY s.society_id ORDER BY s.society_name ASC`;
        const result = await query(sql, params);

        const societies = result.rows;
        if (search && societies.length > 0) {
            const q = `%${search.toLowerCase()}%`;
            for (const soc of societies) {
                const shopRes = await query(`
                    SELECT store_name FROM vendors
                    WHERE society_id = ? AND status = 'ACTIVE'
                      AND (LOWER(store_name) LIKE ? OR LOWER(vendor_name) LIKE ?)
                    LIMIT 3
                `, [soc.society_id, q, q]);
                soc.matched_shops = shopRes.rows.map(r => r.store_name);
            }
        }

        memoryCache.set(cacheKey, societies, 30000); // 30-second TTL
        res.status(200).json(societies);
    } catch (err) {
        console.error('Error fetching societies:', err);
        res.status(500).json({ error: 'DB query failed: Unable to fetch societies' });
    }
});

// GET /api/societies/:societyId - Get single society details
router.get('/:societyId', async (req, res) => {
    try {
        const { societyId } = req.params;
        const result = await query(`SELECT * FROM societies WHERE society_id = ?`, [societyId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Society not found' });
        res.status(200).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'DB query failed' });
    }
});

// POST /api/societies - Admin, vendor can add society
router.post('/', authenticateToken, requireVendor, async (req, res) => {
    try {
        console.log('[Create Society Request] Received payload:', req.body);
        const { society_name, location } = req.body;
        if (!society_name || !location)
            return res.status(400).json({ error: 'Society name and location are required' });
        const result = await query(
            `INSERT INTO societies (society_name, location) VALUES (?, ?)`,
            [society_name, location]
        );
        memoryCache.clear(); // Invalidate cached society lists
        res.status(201).json({ message: 'Society created successfully', society_id: result.insertId });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create society' });
    }
});

module.exports = router;
