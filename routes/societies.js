const { query } = require('../db');
const express = require('express');
const router = express.Router();
const memoryCache = require('../utils/cache');
const { authenticateToken, requireVendor } = require('../middleware/auth');

/**
 * A1. List Housing Societies (with Search & Filter)
 * GET /api/societies
 */
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    const cacheKey = `societies_${search || 'all'}`;
    const cachedResult = memoryCache.get(cacheKey);

    if (cachedResult) {
      return res.status(200).json(cachedResult);
    }

    let sql = `
      SELECT s.society_id, 
             s.society_name, 
             s.location, 
             COALESCE(s.pincode, '201310') as pincode, 
             COALESCE(s.total_flats, 850) as total_flats,
             COUNT(DISTINCT CASE WHEN v.status = 'ACTIVE' THEN v.vendor_id END) as vendor_count,
             COALESCE(s.image_url, 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800') as image_url,
             COALESCE(s.banner_image, 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1200') as banner_image
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

    const societies = result.rows.map(soc => ({
      society_id: Number(soc.society_id),
      society_name: soc.society_name,
      location: soc.location,
      pincode: String(soc.pincode || '201310'),
      total_flats: Number(soc.total_flats || 850),
      vendor_count: Number(soc.vendor_count || 0),
      image_url: soc.image_url,
      banner_image: soc.banner_image
    }));

    memoryCache.set(cacheKey, societies, 30000);
    res.status(200).json(societies);
  } catch (err) {
    console.error('Error fetching societies:', err);
    res.status(500).json({ error: 'DB query failed: Unable to fetch societies' });
  }
});

/**
 * A2. Get Society Details by ID
 * GET /api/societies/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(`SELECT * FROM societies WHERE society_id = ?`, [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Society ID not found' });

    const soc = result.rows[0];
    res.status(200).json({
      society_id: Number(soc.society_id),
      society_name: soc.society_name,
      location: soc.location,
      pincode: String(soc.pincode || '201310'),
      total_flats: Number(soc.total_flats || 850),
      rwa_phone: soc.rwa_phone || '9876543210',
      image_url: soc.image_url || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800'
    });
  } catch (err) {
    console.error('Error fetching society details:', err);
    res.status(500).json({ error: 'DB query failed' });
  }
});

/**
 * A3. Request / Onboard Unlisted Society
 * POST /api/societies
 */
router.post('/', async (req, res) => {
  try {
    const { society_name, location, pincode, total_flats, rwa_phone } = req.body;
    if (!society_name || !location) {
      return res.status(400).json({ error: 'Society name and location are required' });
    }

    const trimmedName = society_name.trim();

    const existing = await query(
      `SELECT society_id FROM societies WHERE LOWER(TRIM(society_name)) = LOWER(?)`,
      [trimmedName]
    );

    if (existing.rows && existing.rows.length > 0) {
      return res.status(400).json({
        error: `A society named "${trimmedName}" already exists. Please choose a different name.`
      });
    }

    const result = await query(
      `INSERT INTO societies (society_name, location, pincode, total_flats, rwa_phone, image_url, banner_image) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        trimmedName,
        location.trim(),
        pincode || '201301',
        total_flats || 450,
        rwa_phone || '9876500000',
        'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800',
        'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1200'
      ]
    );
    memoryCache.clear();

    const newId = Number(result.insertId);

    res.status(201).json({
      message: 'Society onboarding request created successfully',
      society_id: newId,
      society: {
        society_id: newId,
        society_name: trimmedName,
        location: location.trim(),
        status: 'APPROVED'
      }
    });
  } catch (err) {
    console.error('Error creating society:', err);
    res.status(500).json({ error: 'Failed to create society' });
  }
});

/**
 * C1. Fetch Approved Vendors for a Housing Society
 * GET /api/societies/:id/vendors
 */
router.get('/:id/vendors', async (req, res) => {
  try {
    const { id } = req.params;
    const { search } = req.query;

    let sql = `SELECT * FROM vendors WHERE society_id = ? AND status = 'ACTIVE'`;
    const params = [id];

    if (search) {
      sql += ` AND (LOWER(store_name) LIKE ? OR LOWER(vendor_name) LIKE ? OR LOWER(description) LIKE ?)`;
      const q = `%${search.toLowerCase()}%`;
      params.push(q, q, q);
    }
    sql += ` ORDER BY vendor_id ASC`;

    const result = await query(sql, params);
    const vendors = result.rows.map(v => ({
      vendor_id: Number(v.vendor_id),
      store_name: v.store_name,
      vendor_name: v.vendor_name,
      email: v.email,
      phone_number: v.phone_number,
      gst_number: v.gst_number || '07AAACR12341Z5',
      opening_time: v.opening_time || v.opening_timing || '08:00 AM',
      closing_time: v.closing_time || v.closing_timing || '10:00 PM',
      logo: v.logo || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=200',
      description: v.description || 'Quality goods & daily essentials delivered within society via WhatsApp.',
      society_id: Number(v.society_id)
    }));

    res.status(200).json(vendors);
  } catch (err) {
    console.error('Error fetching vendors for society:', err);
    res.status(500).json({ error: 'Failed to fetch vendors for society' });
  }
});

module.exports = router;
