const z = require('../utils/zod');

const addItemSchema = {
  body: z.object({
    item_name: z.string().trim().min(1, 'Item name is required'),
    price: z.coerce.number().positive('Item price must be a positive number'),
    description: z.string().trim().optional(),
    stock: z.coerce.number().min(0, 'Stock cannot be negative').optional(),
    category: z.string().trim().optional(),
    unit: z.string().trim().optional(),
    is_available: z.coerce.boolean().optional(),
    image_url: z.string().trim().optional()
  })
};

const updateSettingsSchema = {
  body: z.object({
    store_name: z.string().trim().min(1, 'Store name is required'),
    logo: z.string().trim().optional(),
    description: z.string().trim().optional(),
    phone_number: z.string().trim().optional(),
    gst_number: z.string().trim().optional(),
    opening_timing: z.string().trim().optional(),
    closing_timing: z.string().trim().optional(),
    min_order_value: z.coerce.number().min(0).optional(),
    max_quantity_limit: z.coerce.number().min(1).optional(),
    delivery_charge: z.coerce.number().min(0).optional(),
    gst_percentage: z.coerce.number().min(0).optional(),
    service_charge_percentage: z.coerce.number().min(0).optional()
  })
};

module.exports = {
  addItemSchema,
  updateSettingsSchema
};
