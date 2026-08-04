const z = require('../utils/zod');

const registerSchema = {
  body: z.object({
    society_id: z.coerce.number().positive('Society ID must be a positive integer'),
    vendor_name: z.string().trim().min(2, 'Vendor name must be at least 2 characters'),
    email: z.string().trim().email('Valid email address is required'),
    password: z.string().min(6, 'Password must be at least 6 characters long'),
    store_name: z.string().trim().min(2, 'Store name must be at least 2 characters'),
    gst_number: z.string().trim().optional(),
    phone_number: z.string().trim().optional(),
    payment_method: z.string().trim().optional(),
    transaction_id: z.string().trim().optional()
  })
};

const loginSchema = {
  body: z.object({
    email: z.string().trim().email('Valid email address is required'),
    password: z.string().min(1, 'Password is required')
  })
};

const forgotPasswordSchema = {
  body: z.object({
    email: z.string().trim().email('Valid email address is required')
  })
};

const verifyOtpSchema = {
  body: z.object({
    email: z.string().trim().email('Valid email address is required'),
    otp: z.string().trim().min(6, 'OTP must be 6 digits').max(6, 'OTP must be 6 digits')
  })
};

const resetPasswordSchema = {
  body: z.object({
    email: z.string().trim().email('Valid email address is required'),
    otp: z.string().trim().min(6, 'OTP must be 6 digits').max(6, 'OTP must be 6 digits'),
    newPassword: z.string().min(6, 'New password must be at least 6 characters long')
  })
};

module.exports = {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  verifyOtpSchema,
  resetPasswordSchema
};
