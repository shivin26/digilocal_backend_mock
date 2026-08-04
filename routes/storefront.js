const { query } = require('../db');
const express = require('express');
const router = express.Router();

// GET /api/societies/:societyId/vendors - List ACTIVE vendors in a society
router.get('/societies/:societyId/vendors', async (req, res) => {
    try {
        const { societyId } = req.params;
        const { search } = req.query;

        let sql = `SELECT v.vendor_id, v.society_id, v.vendor_name, v.gst_number, v.phone_number, v.email,
                          v.store_name, v.logo, v.description, v.status, s.society_name 
                   FROM vendors v
                   JOIN societies s ON v.society_id = s.society_id
                   WHERE v.society_id = ? AND v.status = 'ACTIVE'`;
        const params = [societyId];

        if (search) {
            sql += ` AND (LOWER(v.store_name) LIKE ? OR LOWER(v.vendor_name) LIKE ? OR LOWER(v.description) LIKE ?)`;
            params.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`);
        }
        sql += ` ORDER BY v.store_name ASC`;

        const result = await query(sql, params);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error fetching vendors:', err);
        res.status(500).json({ error: 'DB query failed: Unable to fetch vendors' });
    }
});

// GET /api/vendors/:vendorId - Vendor storefront details & items
router.get('/vendors/:vendorId', async (req, res) => {
    try {
        const { vendorId } = req.params;
        const vendorResult = await query(
            `SELECT v.*, s.society_name, s.location 
             FROM vendors v 
             JOIN societies s ON v.society_id = s.society_id 
             WHERE v.vendor_id = ?`,
            [vendorId]
        );

        if (vendorResult.rows.length === 0)
            return res.status(404).json({ error: 'Vendor not found' });

        const vendor = vendorResult.rows[0];
        delete vendor.password;

        const itemsResult = await query(
            `SELECT * FROM items WHERE vendor_id = ? ORDER BY category ASC, item_name ASC`,
            [vendorId]
        );

        res.status(200).json({ vendor, items: itemsResult.rows });
    } catch (err) {
        console.error('Error fetching vendor storefront:', err);
        res.status(500).json({ error: 'DB query failed' });
    }
});

module.exports = router;
