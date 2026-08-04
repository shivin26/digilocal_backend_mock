const z = require('../utils/zod');

const orderItemSchema = z.object({
  item_id: z.coerce.number().positive('Item ID must be a positive integer'),
  quantity: z.coerce.number().min(1, 'Quantity must be at least 1'),
  unit_price: z.coerce.number().min(0, 'Unit price must be a valid number')
});

const createOrderSchema = {
  body: z.object({
    customer_name: z.string().trim().min(2, 'Customer name must be at least 2 characters'),
    phone_number: z.string().trim().min(5, 'Phone number is required'),
    address: z.string().trim().min(3, 'Address is required'),
    vendor_id: z.coerce.number().positive('Vendor ID is required'),
    items: z.array(orderItemSchema).min(1, 'Order must contain at least one item')
  })
};

const updateOrderStatusSchema = {
  body: z.object({
    status: z.enum(['PLACED', 'ACCEPTED', 'COMPLETED', 'CANCELLED'], 'Invalid order status value')
  })
};

module.exports = {
  createOrderSchema,
  updateOrderStatusSchema
};
