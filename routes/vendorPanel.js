const express = require('express');
const router = express.Router();
const vendorService = require('../services/vendorService');
const { query } = require('../db');
const { authenticateToken, requireVendorOwner } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validate');
const { addItemSchema, updateSettingsSchema } = require('../schemas/vendorSchema');

// GET /api/vendorPanel/:vendorId - Full vendor dashboard data
router.get('/:vendorId', authenticateToken, requireVendorOwner, async (req, res) => {
    try {
        const { vendorId } = req.params;
        const dashboardData = await vendorService.getVendorDashboard(vendorId);

        if (!dashboardData) {
            return res.status(404).json({ error: 'Vendor not found' });
        }

        res.status(200).json(dashboardData);
    } catch (err) {
        console.error('Error fetching vendor panel:', err);
        res.status(500).json({ error: 'Failed to fetch vendor panel data' });
    }
});

// POST /api/vendorPanel/:vendorId/items - Add item
router.post('/:vendorId/items', authenticateToken, requireVendorOwner, validateRequest(addItemSchema), async (req, res) => {
    try {
        const { vendorId } = req.params;
        const { item_name, description, price, stock, category, unit, is_available, image_url } = req.body;

        const avail = (is_available === false || is_available === 0) ? 0 : 1;
        const defaultImg = image_url || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=300&auto=format&fit=crop&q=80';

        const result = await query(
            `INSERT INTO items (vendor_id, item_name, description, price, stock, category, unit, is_available, image_url) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [vendorId, item_name, description || '', price, stock || 50, category || 'General', unit || 'piece', avail, defaultImg]
        );

        res.status(201).json({ message: 'Item added successfully', item_id: result.insertId });
    } catch (err) {
        console.error('Error adding item:', err);
        res.status(500).json({ error: 'Failed to add item' });
    }
});

// PUT /api/vendorPanel/:vendorId/items/:itemId - Edit item or toggle availability
router.put('/:vendorId/items/:itemId', authenticateToken, requireVendorOwner, async (req, res) => {
    try {
        const { vendorId, itemId } = req.params;
        const { item_name, description, price, stock, category, unit, is_available, image_url } = req.body;

        if (is_available !== undefined && item_name === undefined) {
            const availVal = (is_available === true || is_available === 1) ? 1 : 0;
            await query(`UPDATE items SET is_available = ? WHERE item_id = ? AND vendor_id = ?`, [availVal, itemId, vendorId]);
            return res.status(200).json({ message: 'Availability status updated successfully' });
        }

        const availVal = (is_available === true || is_available === 1) ? 1 : 0;
        await query(
            `UPDATE items 
             SET item_name = ?, description = ?, price = ?, stock = ?, category = ?, unit = ?, is_available = ?, image_url = ?
             WHERE item_id = ? AND vendor_id = ?`,
            [item_name, description, price, stock, category, unit, availVal, image_url, itemId, vendorId]
        );

        res.status(200).json({ message: 'Item updated successfully' });
    } catch (err) {
        console.error('Error updating item:', err);
        res.status(500).json({ error: 'Failed to update item' });
    }
});

// DELETE /api/vendorPanel/:vendorId/items/:itemId - Delete item
router.delete('/:vendorId/items/:itemId', authenticateToken, requireVendorOwner, async (req, res) => {
    try {
        const { vendorId, itemId } = req.params;
        await query(`DELETE FROM items WHERE item_id = ? AND vendor_id = ?`, [itemId, vendorId]);
        res.status(200).json({ message: 'Item deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete item' });
    }
});

// PUT /api/vendorPanel/:vendorId/settings - Update store settings
router.put('/:vendorId/settings', authenticateToken, requireVendorOwner, validateRequest(updateSettingsSchema), async (req, res) => {
    try {
        const { vendorId } = req.params;
        const result = await vendorService.updateStoreSettings(vendorId, req.body);
        res.status(200).json({ message: 'Store settings updated successfully', logo: result.logo });
    } catch (err) {
        console.error('Error updating settings:', err);
        res.status(500).json({ error: 'Failed to update store settings' });
    }
});

// POST /api/vendorPanel/:vendorId/renew - Renew vendor subscription
router.post('/:vendorId/renew', authenticateToken, requireVendorOwner, async (req, res) => {
    try {
        const { vendorId } = req.params;
        const { payment_method, transaction_id } = req.body;

        const result = await vendorService.renewSubscription(vendorId, payment_method, transaction_id);

        res.status(200).json({
            message: 'Subscription renewed successfully for 1 year!',
            start_date: result.startDateStr,
            end_date: result.endDateStr
        });
    } catch (err) {
        console.error('Error renewing subscription:', err);
        res.status(500).json({ error: err.message || 'Failed to renew subscription' });
    }
});

module.exports = router;
