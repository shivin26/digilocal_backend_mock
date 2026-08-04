const { query } = require('../db');
const express = require('express');
const router = express.Router();
const {
  hashPassword,
  comparePassword,
  generateTokens,
  revokeToken,
  generateOTP,
  verifyOTP
} = require('../utils/auth');
const {
  loginBruteForceGuard,
  recordFailedAttempt,
  resetFailedAttempts
} = require('../middleware/security');
const { validateRequest } = require('../middleware/validate');
const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  verifyOtpSchema,
  resetPasswordSchema
} = require('../schemas/authSchema');

// POST /api/vendors/register
router.post('/register', validateRequest(registerSchema), async (req, res) => {
    try {
        const { society_id, vendor_name, gst_number, phone_number, email, password, store_name, payment_method, transaction_id } = req.body;

        const existing = await query(`SELECT vendor_id FROM vendors WHERE email = ?`, [email]);
        if (existing.rows.length > 0)
            return res.status(400).json({ error: 'An account with this email address already exists. If you are already registered as a vendor, you can log in directly as a user with your existing credentials.' });

        const hashedPassword = await hashPassword(password);
        const defaultLogo = 'https://images.unsplash.com/photo-1534723452862-4c874018d66d?w=200&auto=format&fit=crop&q=80';
        const defaultDesc = `Welcome to ${store_name}! Sourced with quality for DigiLocal residents.`;

        const vendorRes = await query(
            `INSERT INTO vendors (society_id, vendor_name, gst_number, phone_number, email, password, store_name, logo, description, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
            [society_id, vendor_name, gst_number || '', phone_number || '', email, hashedPassword, store_name, defaultLogo, defaultDesc]
        );
        const vendor_id = vendorRes.insertId;

        const subRes = await query(
            `INSERT INTO subscriptions (vendor_id, start_date, end_date, status) VALUES (?, NULL, NULL, 'PENDING')`,
            [vendor_id]
        );
        const subscription_id = subRes.insertId;

        const txnId = transaction_id || `RAZORPAY_${Date.now()}_${vendor_id}`;
        const payMethod = payment_method || 'Razorpay (UPI)';
        await query(
            `INSERT INTO payments (subscription_id, vendor_id, amount, payment_method, transaction_id, status) VALUES (?, ?, 2999.00, ?, ?, 'SUCCESS')`,
            [subscription_id, vendor_id, payMethod, txnId]
        );

        const newVendorRes = await query(`SELECT * FROM vendors WHERE vendor_id = ?`, [vendor_id]);
        const newVendor = newVendorRes.rows[0] || { vendor_id, store_name, email, status: 'PENDING' };
        delete newVendor.password;

        const tokens = generateTokens(newVendor);

        res.status(201).json({
            message: 'Vendor registration & payment submitted successfully!',
            vendor_id,
            vendor: newVendor,
            status: 'PENDING',
            token: tokens.accessToken,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken
        });
    } catch (err) {
        console.error('Error registering vendor:', err);
        res.status(500).json({ error: 'Failed to process vendor registration' });
    }
});

// POST /api/vendors/login
router.post('/login', loginBruteForceGuard, validateRequest(loginSchema), async (req, res) => {
    try {
        const { email, password } = req.body;

        const vendorRes = await query(`SELECT * FROM vendors WHERE email = ?`, [email]);
        if (vendorRes.rows.length === 0) {
            recordFailedAttempt(email);
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const vendor = vendorRes.rows[0];

        const passwordMatch = await comparePassword(password, vendor.password);
        if (!passwordMatch.matches) {
            recordFailedAttempt(email);
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        if (passwordMatch.needsRehash) {
            const upgradedHash = await hashPassword(password);
            await query(`UPDATE vendors SET password = ? WHERE vendor_id = ?`, [upgradedHash, vendor.vendor_id]);
        }

        resetFailedAttempts(email);

        if (vendor.status === 'REJECTED') {
            return res.status(403).json({
                error: `Access Denied: Your vendor application was rejected by DigiLocal Admin.`,
                status: vendor.status
            });
        }

        delete vendor.password;
        const tokens = generateTokens(vendor);

        res.status(200).json({
            message: 'Login successful',
            vendor,
            token: tokens.accessToken,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken
        });
    } catch (err) {
        console.error('Error during vendor login:', err);
        res.status(500).json({ error: 'Vendor login failed' });
    }
});

// POST /api/vendors/user-login or /api/users/login - Allows Vendor to log in as a User/Customer
const handleUserLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        const vendorRes = await query(`SELECT * FROM vendors WHERE email = ?`, [email]);
        if (vendorRes.rows.length === 0) {
            recordFailedAttempt(email);
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const vendor = vendorRes.rows[0];

        const passwordMatch = await comparePassword(password, vendor.password);
        if (!passwordMatch.matches) {
            recordFailedAttempt(email);
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        resetFailedAttempts(email);

        delete vendor.password;
        const tokens = generateTokens({ ...vendor, role: 'user' }, 'user');

        res.status(200).json({
            message: 'User login successful (Vendor acting as User)',
            user: {
                id: vendor.vendor_id,
                vendor_id: vendor.vendor_id,
                name: vendor.vendor_name,
                email: vendor.email,
                phone_number: vendor.phone_number,
                role: 'user'
            },
            role: 'user',
            token: tokens.accessToken,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken
        });
    } catch (err) {
        console.error('Error during user login:', err);
        res.status(500).json({ error: 'User login failed' });
    }
};

router.post('/user-login', loginBruteForceGuard, validateRequest(loginSchema), handleUserLogin);
router.post('/login-as-user', loginBruteForceGuard, validateRequest(loginSchema), handleUserLogin);

// POST /api/users/user-register - User signup check (prevents duplicate vendor signup)
router.post('/user-register', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email address is required' });
        }

        const existingVendor = await query(`SELECT vendor_id FROM vendors WHERE email = ?`, [email]);
        if (existingVendor.rows.length > 0) {
            return res.status(400).json({
                error: 'An account with this email address already exists as a vendor. You do not need to sign up again—you can log in directly as a user using your existing vendor credentials.',
                alreadyRegisteredAsVendor: true
            });
        }

        res.status(200).json({ message: 'Email address available for user registration' });
    } catch (err) {
        console.error('Error verifying user registration email:', err);
        res.status(500).json({ error: 'Failed to verify email address' });
    }
});

// POST /api/vendors/refresh
router.post('/refresh', (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token is required' });

    const { verifyJwt, generateTokens: genT } = require('../utils/auth');
    const authConfig = require('../config/auth');

    const payload = verifyJwt(refreshToken, authConfig.jwt.refreshTokenSecret);
    if (!payload || payload.type !== 'refresh') {
        return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const tokens = genT({ vendor_id: payload.id, id: payload.id });
    res.status(200).json({
        message: 'Access token refreshed successfully',
        accessToken: tokens.accessToken,
        token: tokens.accessToken
    });
});

// POST /api/vendors/logout
router.post('/logout', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.split(' ')[1] : req.body?.refreshToken;
    if (token) revokeToken(token);
    res.status(200).json({ message: 'Logout successful, tokens revoked' });
});

// POST /api/vendors/forgot-password
router.post('/forgot-password', validateRequest(forgotPasswordSchema), async (req, res) => {
    try {
        const { email } = req.body;
        const vendorRes = await query(`SELECT vendor_id, vendor_name, email FROM vendors WHERE email = ?`, [email]);
        if (vendorRes.rows.length === 0) {
            return res.status(200).json({ message: 'If an account exists with this email, an OTP has been sent.' });
        }

        const otp = generateOTP(email);

        res.status(200).json({
            message: 'OTP sent successfully to registered email address',
            simulationOtp: process.env.NODE_ENV !== 'production' ? otp : undefined
        });
    } catch (err) {
        console.error('Error sending OTP:', err);
        res.status(500).json({ error: 'Failed to process forgot password request' });
    }
});

// POST /api/vendors/verify-otp
router.post('/verify-otp', validateRequest(verifyOtpSchema), (req, res) => {
    const { email, otp } = req.body;
    const result = verifyOTP(email, otp);
    if (!result.valid) {
        return res.status(400).json({ error: result.reason });
    }
    res.status(200).json({ message: 'OTP verified successfully. You may now reset your password.' });
});

// POST /api/vendors/reset-password
router.post('/reset-password', validateRequest(resetPasswordSchema), async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        const verifyResult = verifyOTP(email, otp);
        if (!verifyResult.valid) {
            return res.status(400).json({ error: verifyResult.reason });
        }

        const newHash = await hashPassword(newPassword);
        await query(`UPDATE vendors SET password = ? WHERE email = ?`, [newHash, email]);

        resetFailedAttempts(email);
        res.status(200).json({ message: 'Password reset successfully! You can now log in with your new password.' });
    } catch (err) {
        console.error('Error resetting password:', err);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

module.exports = router;
