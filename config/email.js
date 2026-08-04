const nodemailer = require('nodemailer');
const emailQueue = require('../services/emailQueue');
const templates = require('../templates/emailTemplates');

// Create Nodemailer Transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/**
 * Internal async dispatcher that handles real SMTP delivery or simulation logging.
 */
const sendMailAsync = async ({ to, subject, html, taskName = 'email' }) => {
  const from = process.env.EMAIL_FROM || `DigiLocal Platform <${process.env.EMAIL_USER || 'no-reply@digilocal.in'}>`;

  if (!process.env.EMAIL_USER || process.env.EMAIL_USER === 'your_gmail@gmail.com') {
    return;
  }

  await transporter.sendMail({ from, to, subject, html });
};

/**
 * Queues an email for non-blocking background dispatch.
 */
const queueEmailDispatch = (to, subject, html, taskName) => {
  emailQueue.enqueue(() => sendMailAsync({ to, subject, html, taskName }), taskName);
};

/**
 * 1. Subscription Expiry Warning Email (Maintains 100% Backward Compatibility for cron.js)
 */
const sendSubscriptionExpiryEmail = async (vendor, daysLeft) => {
  const isExpired = daysLeft <= 0;
  const subject = isExpired
    ? `⚠️ DigiLocal Subscription Expired – ${vendor.store_name}`
    : `🔔 DigiLocal Subscription Expiring in ${daysLeft} Day${daysLeft === 1 ? '' : 's'} – ${vendor.store_name}`;

  const html = templates.subscriptionExpiryTemplate({
    vendor_name: vendor.vendor_name,
    store_name: vendor.store_name,
    end_date: vendor.end_date,
    daysLeft
  });

  queueEmailDispatch(vendor.email, subject, html, `subscription_expiry_${vendor.vendor_id}`);
};

/**
 * 2. OTP Security Email
 */
const sendOTPEmail = (toEmail, otp, name) => {
  const subject = `🔐 ${otp} is your DigiLocal Verification Code`;
  const html = templates.otpTemplate({ name, otp });
  queueEmailDispatch(toEmail, subject, html, `otp_${toEmail}`);
};

/**
 * 3. Welcome Email
 */
const sendWelcomeEmail = (toEmail, vendorName, storeName) => {
  const subject = `🎉 Welcome to DigiLocal Marketplace, ${storeName}!`;
  const html = templates.welcomeTemplate({ vendor_name: vendorName, store_name: storeName });
  queueEmailDispatch(toEmail, subject, html, `welcome_${storeName}`);
};

/**
 * 4. Renewal Receipt Email
 */
const sendRenewalEmail = (toEmail, vendorName, storeName, endDate, amount, transactionId) => {
  const subject = `✅ Subscription Renewed – ${storeName}`;
  const html = templates.renewalSuccessTemplate({ vendor_name: vendorName, store_name: storeName, end_date: endDate, amount, transaction_id: transactionId });
  queueEmailDispatch(toEmail, subject, html, `renewal_${storeName}`);
};

/**
 * 5. Order Invoice Email
 */
const sendOrderInvoiceEmail = (toEmail, customerName, orderId, totalAmount, items, storeName) => {
  const subject = `🧾 Receipt for Order #${orderId} – ${storeName}`;
  const html = templates.invoiceTemplate({ customer_name: customerName, order_id: orderId, total_amount: totalAmount, items, store_name: storeName });
  queueEmailDispatch(toEmail, subject, html, `invoice_${orderId}`);
};

/**
 * 6. Password Reset Success Email
 */
const sendPasswordResetSuccessEmail = (toEmail, name) => {
  const subject = `🔒 Your DigiLocal Password Was Changed`;
  const html = templates.passwordResetSuccessTemplate({ name });
  queueEmailDispatch(toEmail, subject, html, `password_reset_${toEmail}`);
};

/**
 * 7. Verification Email
 */
const sendVerificationEmail = (toEmail, name, verificationUrl) => {
  const subject = `✉️ Verify Your DigiLocal Account`;
  const html = templates.verificationTemplate({ name, verificationUrl });
  queueEmailDispatch(toEmail, subject, html, `verification_${toEmail}`);
};

module.exports = {
  transporter,
  sendSubscriptionExpiryEmail,
  sendOTPEmail,
  sendWelcomeEmail,
  sendRenewalEmail,
  sendOrderInvoiceEmail,
  sendPasswordResetSuccessEmail,
  sendVerificationEmail
};
