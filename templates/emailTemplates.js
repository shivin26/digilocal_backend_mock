/**
 * Production-Grade HTML Email Templates for DigiLocal Platform.
 * Feature-responsive layout, inline CSS styling, dark-navy branding, and clear CTA typography.
 */

const baseContainer = (title, headerColor, contentHtml) => `
<div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAF9F6; padding: 40px 15px; color: #0A1428; margin: 0;">
  <div style="max-width: 580px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; border: 1px solid #E0D5C3; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
    <!-- Header -->
    <div style="background-color: #0A1428; padding: 28px 32px; text-align: center;">
      <h1 style="color: #C5A880; font-size: 24px; font-weight: 700; margin: 0; letter-spacing: 3px;">DIGILOCAL</h1>
      <p style="color: #8AA0B8; font-size: 11px; margin: 6px 0 0; letter-spacing: 1.5px; text-transform: uppercase;">Local Marketplace Platform</p>
    </div>
    
    <!-- Body Content -->
    <div style="padding: 36px 32px;">
      <h2 style="color: ${headerColor}; font-size: 20px; font-weight: 600; margin: 0 0 16px;">${title}</h2>
      ${contentHtml}
      <hr style="border: none; border-top: 1px solid #F0E8DD; margin: 28px 0;" />
      <p style="font-size: 12px; color: #8AA0B8; text-align: center; margin: 0; line-height: 1.5;">
        This is an automated notification from DigiLocal Platform.<br />
        If you have questions, contact <a href="mailto:support@digilocal.in" style="color: #C5A880; text-decoration: none;">support@digilocal.in</a>
      </p>
    </div>
  </div>
</div>
`;

/**
 * 1. OTP Security Template
 */
function otpTemplate({ name, otp, ttlMinutes = 10 }) {
  const content = `
    <p style="font-size: 14px; line-height: 1.6; color: #444;">Hello <strong>${name || 'Valued User'}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #444;">Your One-Time Password (OTP) for account authentication is:</p>
    <div style="background-color: #FAF9F6; border: 2px dashed #C5A880; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
      <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #0A1428;">${otp}</span>
    </div>
    <p style="font-size: 13px; color: #666;">This OTP is valid for <strong>${ttlMinutes} minutes</strong>. Do not share this code with anyone.</p>
  `;
  return baseContainer('🔐 Account Verification Code', '#0A1428', content);
}

/**
 * 2. Welcome Email Template
 */
function welcomeTemplate({ vendor_name, store_name }) {
  const content = `
    <p style="font-size: 14px; line-height: 1.6; color: #444;">Dear <strong>${vendor_name}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #444;">Welcome to DigiLocal! Your store <strong>${store_name}</strong> has been successfully registered on our neighborhood marketplace platform.</p>
    <div style="background-color: #FAF9F6; border-radius: 10px; border: 1px solid #E0D5C3; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 10px; font-size: 14px; color: #0A1428;">Next Steps:</h3>
      <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #555; line-height: 1.7;">
        <li>Set up your business operating hours and store logo</li>
        <li>Add products and catalog pricing</li>
        <li>Receive customer orders directly from residents in your society</li>
      </ul>
    </div>
    <div style="text-align: center; margin: 28px 0;">
      <a href="http://localhost:3000" style="background-color: #0A1428; color: #C5A880; font-weight: bold; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-size: 14px; display: inline-block;">OPEN VENDOR DASHBOARD</a>
    </div>
  `;
  return baseContainer('🎉 Welcome to DigiLocal Marketplace!', '#0A1428', content);
}

/**
 * 3. Subscription Expiry Warning Template
 */
function subscriptionExpiryTemplate({ vendor_name, store_name, end_date, daysLeft }) {
  const isExpired = daysLeft <= 0;
  const headerColor = isExpired ? '#B91C1C' : '#B78103';
  const content = `
    <p style="font-size: 14px; line-height: 1.6; color: #444;">Dear <strong>${vendor_name}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #444;">
      ${isExpired
        ? `Your DigiLocal annual subscription for <strong>${store_name}</strong> has <span style="color: #B91C1C; font-weight: bold;">expired</span>. Your store is currently hidden from local residents.`
        : `Your DigiLocal annual subscription for <strong>${store_name}</strong> will expire in <strong style="color: #B78103;">${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong> on <strong>${end_date}</strong>.`
      }
    </p>
    <div style="background-color: #FAF9F6; border-radius: 10px; border: 1px solid #E0D5C3; padding: 16px 20px; margin: 20px 0; font-size: 13px;">
      <table width="100%" cellpadding="6" style="border-collapse: collapse;">
        <tr><td style="color: #787F8C;">Store Name:</td><td style="font-weight: bold;">${store_name}</td></tr>
        <tr><td style="color: #787F8C;">Expiry Date:</td><td style="font-weight: bold; color: ${headerColor};">${end_date || 'N/A'}</td></tr>
        <tr><td style="color: #787F8C;">Renewal Cost:</td><td style="font-weight: bold;">₹2,999 / year</td></tr>
      </table>
    </div>
    <div style="text-align: center; margin: 28px 0;">
      <a href="http://localhost:3000" style="background-color: #0A1428; color: #C5A880; font-weight: bold; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-size: 14px; display: inline-block;">RENEW SUBSCRIPTION NOW</a>
    </div>
  `;
  return baseContainer(isExpired ? '⚠️ Subscription Expired' : `🔔 Subscription Expiring in ${daysLeft} Day(s)`, headerColor, content);
}

/**
 * 4. Subscription Renewal Success Template
 */
function renewalSuccessTemplate({ vendor_name, store_name, end_date, amount = 2999.00, transaction_id }) {
  const content = `
    <p style="font-size: 14px; line-height: 1.6; color: #444;">Dear <strong>${vendor_name}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #444;">Your subscription for <strong>${store_name}</strong> has been successfully renewed for 1 full year!</p>
    <div style="background-color: #FAF9F6; border-radius: 10px; border: 1px solid #E0D5C3; padding: 18px 20px; margin: 20px 0; font-size: 13px;">
      <table width="100%" cellpadding="6" style="border-collapse: collapse;">
        <tr><td style="color: #787F8C;">Store Name:</td><td style="font-weight: bold;">${store_name}</td></tr>
        <tr><td style="color: #787F8C;">Active Until:</td><td style="font-weight: bold; color: #166534;">${end_date}</td></tr>
        <tr><td style="color: #787F8C;">Amount Paid:</td><td style="font-weight: bold;">₹${amount.toFixed(2)}</td></tr>
        <tr><td style="color: #787F8C;">Transaction Reference:</td><td style="font-family: monospace; font-size: 12px;">${transaction_id}</td></tr>
      </table>
    </div>
  `;
  return baseContainer('✅ Subscription Renewed Successfully', '#166534', content);
}

/**
 * 5. Customer Order Invoice Template
 */
function invoiceTemplate({ customer_name, order_id, total_amount, items = [], store_name }) {
  const itemRows = items.map(item => `
    <tr>
      <td style="padding: 8px 0; font-size: 13px; color: #333;">${item.item_name} (x${item.quantity})</td>
      <td style="padding: 8px 0; font-size: 13px; color: #333; text-align: right;">₹${(item.unit_price * item.quantity).toFixed(2)}</td>
    </tr>
  `).join('');

  const content = `
    <p style="font-size: 14px; line-height: 1.6; color: #444;">Dear <strong>${customer_name}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #444;">Thank you for your order at <strong>${store_name}</strong>. Here is your order receipt:</p>
    <div style="background-color: #FAF9F6; border-radius: 10px; border: 1px solid #E0D5C3; padding: 20px; margin: 20px 0;">
      <h4 style="margin: 0 0 12px; font-size: 14px; color: #0A1428;">Order #${order_id} Receipt</h4>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
        ${itemRows}
        <tr><td colspan="2" style="border-top: 1px solid #E0D5C3; padding-top: 10px;"></td></tr>
        <tr>
          <td style="font-size: 14px; font-weight: bold; color: #0A1428;">Total Paid:</td>
          <td style="font-size: 14px; font-weight: bold; color: #166534; text-align: right;">₹${total_amount.toFixed(2)}</td>
        </tr>
      </table>
    </div>
  `;
  return baseContainer(`🧾 Order Receipt #${order_id}`, '#0A1428', content);
}

/**
 * 6. Password Reset Success Template
 */
function passwordResetSuccessTemplate({ name }) {
  const content = `
    <p style="font-size: 14px; line-height: 1.6; color: #444;">Hello <strong>${name || 'Valued User'}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #444;">Your password for DigiLocal account has been changed successfully.</p>
    <p style="font-size: 13px; color: #888;">If you did not perform this password reset, please contact security support immediately.</p>
  `;
  return baseContainer('🔒 Password Changed Successfully', '#0A1428', content);
}

/**
 * 7. Account Email Verification Template
 */
function verificationTemplate({ name, verificationUrl }) {
  const content = `
    <p style="font-size: 14px; line-height: 1.6; color: #444;">Hello <strong>${name}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #444;">Please click the button below to verify your email address and activate your account:</p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${verificationUrl}" style="background-color: #0A1428; color: #C5A880; font-weight: bold; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-size: 14px; display: inline-block;">VERIFY EMAIL ADDRESS</a>
    </div>
  `;
  return baseContainer('✉️ Verify Your Email Address', '#0A1428', content);
}

module.exports = {
  otpTemplate,
  welcomeTemplate,
  subscriptionExpiryTemplate,
  renewalSuccessTemplate,
  invoiceTemplate,
  passwordResetSuccessTemplate,
  verificationTemplate
};
