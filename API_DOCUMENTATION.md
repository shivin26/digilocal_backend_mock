# 📚 DigiLocal Platform Complete API Documentation

Consolidated, production-grade API Reference manual covering every RESTful endpoint, request structure (`req.body`), header specifications, and HTTP status code responses.

---

## 📑 Table of Contents

1. [Vendor Authentication APIs](#1-vendor-authentication-apis)
2. [Storefront & Public Directory APIs](#2-storefront--public-directory-apis)
3. [Customer Orders APIs](#3-customer-orders-apis)
4. [Vendor Dashboard & Catalog APIs](#4-vendor-dashboard--catalog-apis)
5. [Admin Portal APIs](#5-admin-portal-apis)
6. [Health & Observability APIs](#6-health--observability-apis)
7. [API Documentation Endpoints](#7-api-documentation-endpoints)

---

## 1. Vendor Authentication APIs

### 1.1 Vendor Registration
- **Title**: Register New Vendor Account & Subscription
- **Endpoint**: `POST /api/vendors/register`
- **Auth Required**: None (Public)
- **Request Headers**: `Content-Type: application/json`
- **Request Body (`req.body`)**:
```json
{
  "society_id": 1,
  "vendor_name": "Rajesh Sharma",
  "email": "freshmart@gmail.com",
  "password": "vendorPassword123",
  "store_name": "FreshMart Grocery & Organic",
  "phone_number": "9876543210",
  "gst_number": "07AAACR12341Z5",
  "payment_method": "Razorpay (UPI)",
  "transaction_id": "RAZORPAY_TXN_991823"
}
```
- **Status Codes & Responses**:
  - `201 Created` - Account registered successfully
  ```json
  {
    "message": "Vendor registration & payment submitted successfully!",
    "vendor_id": 1,
    "vendor": {
      "vendor_id": 1,
      "society_id": 1,
      "vendor_name": "Rajesh Sharma",
      "store_name": "FreshMart Grocery & Organic",
      "email": "freshmart@gmail.com",
      "status": "PENDING"
    },
    "status": "PENDING",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```
  - `400 Bad Request` - Missing required fields or duplicate email
  ```json
  {
    "error": "An account with this email address already exists"
  }
  ```

---

### 1.2 Vendor Login
- **Title**: Authenticate Vendor & Issue Tokens
- **Endpoint**: `POST /api/vendors/login`
- **Auth Required**: None (Public - Protected by Brute-Force Guard)
- **Request Body (`req.body`)**:
```json
{
  "email": "freshmart@gmail.com",
  "password": "vendorPassword123"
}
```
- **Status Codes & Responses**:
  - `200 OK` - Authentication successful
  ```json
  {
    "message": "Login successful",
    "vendor": {
      "vendor_id": 1,
      "vendor_name": "Rajesh Sharma",
      "store_name": "FreshMart Grocery & Organic",
      "email": "freshmart@gmail.com",
      "status": "ACTIVE"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```
  - `401 Unauthorized` - Invalid email or password
  ```json
  {
    "error": "Invalid email or password"
  }
  ```
  - `403 Forbidden` - Vendor application rejected
  ```json
  {
    "error": "Access Denied: Your vendor application was rejected by DigiLocal Admin.",
    "status": "REJECTED"
  }
  ```
  - `429 Too Many Requests` - Account temporarily locked due to repeated failed logins
  ```json
  {
    "error": "Account temporarily locked due to repeated failed login attempts. Please try again in 15 minute(s).",
    "isLocked": true
  }
  ```

---

### 1.3 Refresh Access Token
- **Title**: Refresh Expired Access Token
- **Endpoint**: `POST /api/vendors/refresh`
- **Request Body (`req.body`)**:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```
- **Status Codes & Responses**:
  - `200 OK` - New access token issued
  ```json
  {
    "message": "Access token refreshed successfully",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```
  - `401 Unauthorized` - Invalid or expired refresh token
  ```json
  {
    "error": "Invalid or expired refresh token"
  }
  ```

---

### 1.4 Vendor Logout
- **Title**: Logout & Revoke Tokens
- **Endpoint**: `POST /api/vendors/logout`
- **Request Headers**: `Authorization: Bearer <accessToken>`
- **Request Body (`req.body`)**:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```
- **Status Codes & Responses**:
  - `200 OK` - Tokens blacklisted
  ```json
  {
    "message": "Logout successful, tokens revoked"
  }
  ```

---

### 1.5 Request Password Reset OTP
- **Title**: Send 6-Digit OTP for Password Reset
- **Endpoint**: `POST /api/vendors/forgot-password`
- **Request Body (`req.body`)**:
```json
{
  "email": "freshmart@gmail.com"
}
```
- **Status Codes & Responses**:
  - `200 OK` - OTP sent
  ```json
  {
    "message": "OTP sent successfully to registered email address",
    "simulationOtp": "849201"
  }
  ```

---

### 1.6 Verify Password Reset OTP
- **Title**: Verify 6-Digit Security OTP
- **Endpoint**: `POST /api/vendors/verify-otp`
- **Request Body (`req.body`)**:
```json
{
  "email": "freshmart@gmail.com",
  "otp": "849201"
}
```
- **Status Codes & Responses**:
  - `200 OK` - OTP verified
  ```json
  {
    "message": "OTP verified successfully. You may now reset your password."
  }
  ```
  - `400 Bad Request` - Invalid or expired OTP
  ```json
  {
    "error": "Invalid OTP"
  }
  ```

---

### 1.7 Reset Password
- **Title**: Complete Password Reset
- **Endpoint**: `POST /api/vendors/reset-password`
- **Request Body (`req.body`)**:
```json
{
  "email": "freshmart@gmail.com",
  "otp": "849201",
  "newPassword": "NewStrongPassword123"
}
```
- **Status Codes & Responses**:
  - `200 OK` - Password updated
  ```json
  {
    "message": "Password reset successfully! You can now log in with your new password."
  }
  ```

---

## 2. Storefront & Public Directory APIs

### 2.1 List All Societies
- **Title**: Search & List Active Societies
- **Endpoint**: `GET /api/societies`
- **Query Params**: `?search=Greenwood`
- **Status Codes & Responses**:
  - `200 OK` - Returns societies list
  ```json
  [
    {
      "society_id": 1,
      "society_name": "Greenwood Residency",
      "location": "Block A, Sector 62, Noida",
      "public_id": "GW4K2",
      "vendor_count": 2
    }
  ]
  ```

---

### 2.2 Get Single Society Details
- **Title**: Get Details of a Society
- **Endpoint**: `GET /api/societies/:societyId`
- **Status Codes & Responses**:
  - `200 OK` - Society details
  ```json
  {
    "society_id": 1,
    "society_name": "Greenwood Residency",
    "location": "Block A, Sector 62, Noida",
    "public_id": "GW4K2"
  }
  ```
  - `404 Not Found` - Invalid society ID

---

### 2.3 List Active Vendors in Society
- **Title**: Storefront Listing of Active Vendors
- **Endpoint**: `GET /api/societies/:societyId/vendors`
- **Query Params**: `?search=grocery`
- **Status Codes & Responses**:
  - `200 OK` - Active vendor list
  ```json
  [
    {
      "vendor_id": 1,
      "society_id": 1,
      "vendor_name": "Rajesh Sharma",
      "store_name": "FreshMart Grocery & Organic",
      "logo": "https://images.unsplash.com/photo-1542838132...",
      "status": "ACTIVE",
      "society_name": "Greenwood Residency"
    }
  ]
  ```

---

### 2.4 Get Vendor Storefront & Menu Items
- **Title**: Vendor Storefront Catalog & Details
- **Endpoint**: `GET /api/vendors/:vendorId`
- **Status Codes & Responses**:
  - `200 OK` - Vendor info and items
  ```json
  {
    "vendor": {
      "vendor_id": 1,
      "store_name": "FreshMart Grocery & Organic",
      "opening_timing": "08:00 AM",
      "closing_timing": "10:00 PM",
      "delivery_charge": 0.00,
      "min_order_value": 0.00
    },
    "items": [
      {
        "item_id": 1,
        "vendor_id": 1,
        "item_name": "Farm Fresh Organic Milk (1L)",
        "price": 68.00,
        "stock": 50,
        "category": "Dairy",
        "is_available": 1
      }
    ]
  }
  ```

---

### 2.5 QR Code Shop Redirect Link
- **Title**: QR Code Direct Link Redirect
- **Endpoint**: `GET /shop/:vendorId`
- **Status Codes & Responses**:
  - `302 Found` - Redirects to Frontend SPA route `/{societyId}/{vendorId}`
  - `404 Not Found` - Shop not found

---

## 3. Customer Orders APIs

### 3.1 Place Customer Order
- **Title**: Create Order with Server-Side Price Calculation & Stock Deduction
- **Endpoint**: `POST /api/orders`
- **Request Body (`req.body`)**:
```json
{
  "customer_name": "Rahul Verma",
  "phone_number": "9898989898",
  "address": "Flat 402, Tower B, Greenwood Residency",
  "vendor_id": 1,
  "items": [
    { "item_id": 1, "quantity": 1, "unit_price": 68.00 },
    { "item_id": 2, "quantity": 1, "unit_price": 240.00 }
  ]
}
```
- **Status Codes & Responses**:
  - `201 Created` - Order placed
  ```json
  {
    "message": "Order placed successfully",
    "order_id": 1,
    "total_amount": 308.00,
    "status": "PLACED"
  }
  ```
  - `400 Bad Request` - Out of stock or invalid items
  ```json
  {
    "error": "Insufficient stock for 'Fresh Alphonso Mangoes (1kg)'. Available: 0, Requested: 1"
  }
  ```

---

### 3.2 Check Order Status & Details
- **Title**: Get Order Status and Receipt
- **Endpoint**: `GET /api/orders/:orderId`
- **Status Codes & Responses**:
  - `200 OK` - Order details and line items
  ```json
  {
    "order": {
      "order_id": 1,
      "vendor_id": 1,
      "customer_id": 1,
      "status": "PLACED",
      "total_amount": 308.00,
      "store_name": "FreshMart Grocery & Organic",
      "customer_name": "Rahul Verma"
    },
    "items": [
      {
        "order_id": 1,
        "item_id": 1,
        "quantity": 1,
        "unit_price": 68.00,
        "item_total": 68.00,
        "item_name": "Farm Fresh Organic Milk (1L)"
      }
    ]
  }
  ```

---

### 3.3 Update Order Status
- **Title**: Update Order Status (Vendor Panel)
- **Endpoint**: `PUT /api/orders/:orderId/status`
- **Request Body (`req.body`)**:
```json
{
  "status": "ACCEPTED"
}
```
- **Status Codes & Responses**:
  - `200 OK` - Status updated
  ```json
  {
    "message": "Order status updated",
    "status": "ACCEPTED"
  }
  ```

---

## 4. Vendor Dashboard & Catalog APIs

### 4.1 Get Vendor Dashboard Data
- **Title**: Complete Vendor Dashboard Data
- **Endpoint**: `GET /api/vendorPanel/:vendorId`
- **Request Headers**: `Authorization: Bearer <accessToken>`
- **Status Codes & Responses**:
  - `200 OK` - Vendor dashboard data
  ```json
  {
    "vendor": { "vendor_id": 1, "store_name": "FreshMart Grocery & Organic" },
    "items": [],
    "orders": [],
    "subscription": { "status": "ACTIVE", "end_date": "2027-07-31" },
    "payments": []
  }
  ```
  - `403 Forbidden` - IDOR Protection: User does not own this vendor store

---

### 4.2 Add Menu Item
- **Title**: Add New Store Item
- **Endpoint**: `POST /api/vendorPanel/:vendorId/items`
- **Request Headers**: `Authorization: Bearer <accessToken>`
- **Request Body (`req.body`)**:
```json
{
  "item_name": "Belgian Chocolate Truffle Cake",
  "description": "Rich 500g dark chocolate cake.",
  "price": 550.00,
  "stock": 15,
  "category": "Cakes",
  "unit": "500g",
  "is_available": 1,
  "image_url": "https://images.unsplash.com/photo-1578985545062..."
}
```
- **Status Codes & Responses**:
  - `201 Created` - Item added
  ```json
  {
    "message": "Item added successfully",
    "item_id": 6
  }
  ```

---

### 4.3 Edit Item or Toggle Availability
- **Title**: Edit Item Details or Toggle Availability
- **Endpoint**: `PUT /api/vendorPanel/:vendorId/items/:itemId`
- **Request Headers**: `Authorization: Bearer <accessToken>`
- **Request Body (`req.body`)**:
```json
{
  "is_available": 0
}
```
- **Status Codes & Responses**:
  - `200 OK` - Item updated
  ```json
  {
    "message": "Availability status updated successfully"
  }
  ```

---

### 4.4 Delete Menu Item
- **Title**: Delete Store Item
- **Endpoint**: `DELETE /api/vendorPanel/:vendorId/items/:itemId`
- **Request Headers**: `Authorization: Bearer <accessToken>`
- **Status Codes & Responses**:
  - `200 OK` - Item deleted
  ```json
  {
    "message": "Item deleted successfully"
  }
  ```

---

### 4.5 Update Store Settings
- **Title**: Update Vendor Profile, Business Hours & GST
- **Endpoint**: `PUT /api/vendorPanel/:vendorId/settings`
- **Request Headers**: `Authorization: Bearer <accessToken>`
- **Request Body (`req.body`)**:
```json
{
  "store_name": "FreshMart Grocery & Organic",
  "logo": "https://images.unsplash.com/photo-1542838132...",
  "description": "Your neighborhood fresh organic store",
  "phone_number": "9876543210",
  "gst_number": "07AAACR12341Z5",
  "opening_timing": "07:30 AM",
  "closing_timing": "10:30 PM",
  "min_order_value": 100.00,
  "max_quantity_limit": 20,
  "delivery_charge": 20.00,
  "gst_percentage": 5.00,
  "service_charge_percentage": 0.00
}
```
- **Status Codes & Responses**:
  - `200 OK` - Settings updated
  ```json
  {
    "message": "Store settings updated successfully",
    "logo": "https://images.unsplash.com/photo-1542838132..."
  }
  ```

---

### 4.6 Renew Vendor Subscription
- **Title**: Transactional Annual Subscription Renewal
- **Endpoint**: `POST /api/vendorPanel/:vendorId/renew`
- **Request Headers**: `Authorization: Bearer <accessToken>`
- **Request Body (`req.body`)**:
```json
{
  "payment_method": "Razorpay (UPI)",
  "transaction_id": "RZP_RENEW_991203"
}
```
- **Status Codes & Responses**:
  - `200 OK` - Subscription extended 1 year
  ```json
  {
    "message": "Subscription renewed successfully for 1 year!",
    "start_date": "2026-07-31",
    "end_date": "2027-07-31"
  }
  ```

---

## 5. Admin Portal APIs

### 5.1 Get All Vendors (Admin)
- **Title**: Admin List All Vendors with Payments
- **Endpoint**: `GET /api/admin/vendors`
- **Request Headers**: `Authorization: Bearer <adminAccessToken>`
- **Query Params**: `?search=FreshMart&page=1&limit=50`
- **Status Codes & Responses**:
  - `200 OK` - List of vendors with payment records
  ```json
  [
    {
      "vendor_id": 1,
      "vendor_name": "Rajesh Sharma",
      "store_name": "FreshMart Grocery & Organic",
      "status": "ACTIVE",
      "payments": [
        { "payment_id": 1, "amount": 2999.00, "status": "SUCCESS" }
      ]
    }
  ]
  ```

---

### 5.2 Get Pending Vendor Requests
- **Title**: Admin List Pending Vendor Requests
- **Endpoint**: `GET /api/admin/requests`
- **Status Codes & Responses**:
  - `200 OK` - Pending vendor requests
  ```json
  [
    {
      "vendor_id": 5,
      "vendor_name": "Pooja Verma",
      "store_name": "Royal Laundry & Dry Cleaning",
      "status": "PENDING"
    }
  ]
  ```

---

### 5.3 Approve Vendor Request
- **Title**: Approve Vendor & Activate 1-Year Subscription
- **Endpoint**: `POST /api/admin/requests/:vendorId/approve`
- **Status Codes & Responses**:
  - `200 OK` - Vendor approved
  ```json
  {
    "message": "Vendor request approved successfully! Vendor is now active with 1-Year Subscription.",
    "vendor_id": "5",
    "start_date": "2026-07-31",
    "end_date": "2027-07-31"
  }
  ```

---

### 5.4 Reject Vendor Request
- **Title**: Reject Vendor Request
- **Endpoint**: `POST /api/admin/requests/:vendorId/reject`
- **Status Codes & Responses**:
  - `200 OK` - Vendor rejected
  ```json
  {
    "message": "Vendor request rejected",
    "vendor_id": "5"
  }
  ```

---

### 5.5 Get Platform Config
- **Title**: Get Platform Logo & Name
- **Endpoint**: `GET /api/admin/config`
- **Status Codes & Responses**:
  - `200 OK` - Platform configuration
  ```json
  {
    "platform_logo": "https://imgh.in/host/ucila6",
    "platform_name": "DigiLocal"
  }
  ```

---

### 5.6 Update Platform Config
- **Title**: Update Platform Logo & Name
- **Endpoint**: `PUT /api/admin/config`
- **Request Body (`req.body`)**:
```json
{
  "platform_logo": "https://imgh.in/host/new_logo.png",
  "platform_name": "DigiLocal Marketplace"
}
```
- **Status Codes & Responses**:
  - `200 OK` - Configuration updated
  ```json
  {
    "message": "Platform configuration updated successfully",
    "platform_logo": "https://imgh.in/host/new_logo.png",
    "platform_name": "DigiLocal Marketplace"
  }
  ```

---

## 6. Health & Observability APIs

### 6.1 Full Health Check Report
- **Endpoint**: `GET /health`
- **Status Codes & Responses**:
  - `200 OK` - System UP
  ```json
  {
    "status": "UP",
    "timestamp": "2026-07-31T15:45:00.000Z",
    "version": "1.0.0",
    "uptimeSeconds": 3200,
    "environment": "development",
    "database": { "status": "UP", "engine": "sqlite" },
    "memory": { "heapUsedMb": 42, "rssMb": 85 }
  }
  ```

---

### 6.2 Liveness Probe (Kubernetes/Docker)
- **Endpoint**: `GET /health/live`
- **Status Codes & Responses**:
  - `200 OK` - Process is running
  ```json
  {
    "status": "ALIVE",
    "timestamp": "2026-07-31T15:45:00.000Z",
    "uptimeSeconds": 3200
  }
  ```

---

### 6.3 Readiness Probe (Kubernetes/Docker)
- **Endpoint**: `GET /health/ready`
- **Status Codes & Responses**:
  - `200 OK` - Database ping connected
  ```json
  {
    "status": "READY",
    "timestamp": "2026-07-31T15:45:00.000Z",
    "database": "CONNECTED"
  }
  ```

---

### 6.4 Version Metadata
- **Endpoint**: `GET /version`
- **Status Codes & Responses**:
  - `200 OK` - Application version metadata
  ```json
  {
    "name": "digilocal-backend",
    "version": "1.0.0",
    "description": "Backend API for DigiLocal Vendor Ordering and Subscription Platform",
    "environment": "development",
    "nodeVersion": "v20.11.0"
  }
  ```

---

## 7. API Documentation Endpoints

### 7.1 Interactive Swagger UI Documentation
- **Endpoint**: `GET /api-docs`
- **Description**: Renders interactive HTML Swagger UI documentation for browser execution.

### 7.2 Raw OpenAPI 3.1.0 JSON Specification
- **Endpoint**: `GET /openapi.json`
- **Description**: Returns raw OpenAPI 3.1.0 JSON specification file for Postman or SDK generation.
