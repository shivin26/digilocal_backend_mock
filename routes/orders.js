const express = require('express');
const router = express.Router();
const orderService = require('../services/orderService');
const { validateRequest } = require('../middleware/validate');
const { createOrderSchema, updateOrderStatusSchema } = require('../schemas/orderSchema');
const { authenticateToken, requireVendor } = require('../middleware/auth');

// POST /api/orders - Customer places an order
router.post('/', validateRequest(createOrderSchema), async (req, res) => {
    try {
        const orderResult = await orderService.createOrder(req.body);

        res.status(201).json({
            message: 'Order placed successfully',
            order_id: orderResult.order_id,
            total_amount: orderResult.total_amount,
            status: orderResult.status
        });
    } catch (err) {
        console.error('[Order API Error]:', err.message);
        res.status(400).json({ error: err.message || 'Failed to place order' });
    }
});

// GET /api/orders/:orderId - Check order status
router.get('/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const result = await orderService.getOrderDetails(orderId);

        if (!result) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.status(200).json({
            order: result.order,
            items: result.items
        });
    } catch (err) {
        console.error('[Order Fetch Error]:', err.message);
        res.status(500).json({ error: 'Failed to fetch order details' });
    }
});

// PUT /api/orders/:orderId/status - Update order status (from vendor panel)
router.put('/:orderId/status', authenticateToken, requireVendor, validateRequest(updateOrderStatusSchema), async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;

        const result = await orderService.updateOrderStatus(orderId, status);

        res.status(200).json({
            message: 'Order status updated',
            status: result.status
        });
    } catch (err) {
        console.error('[Order Status Update Error]:', err.message);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

module.exports = router;
