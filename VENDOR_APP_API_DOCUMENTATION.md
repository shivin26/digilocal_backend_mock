# 🏪 DigiLocal Vendor Mobile App - Complete API Documentation

This document is a complete, production-ready API integration guide specifically created for **Vendor App Developers** (React Native, Flutter, iOS, Android, Web). It covers authentication, catalog management (CRUD), order management, dashboard analytics, and store settings.

---

## 🌐 1. Server Connection & Base URLs

Depending on your development setup, set your HTTP Client Base URL:

| Environment | Base URL |
| :--- | :--- |
| **Local PC / Web** | `http://localhost:5000` |
| **Android Emulator** | `http://10.0.2.2:5000` |
| **Physical Phone (Same Wi-Fi)** | `http://172.25.12.195:5000` |
| **Render Live Database / Production** | `https://your-backend-app.onrender.com` |

- **Interactive Swagger Documentation:** `http://172.25.12.195:5000/api-docs`

---

## 🔐 2. Authentication & Header Rules

### Request Headers
For all protected Vendor Panel endpoints, include the `Authorization` header:

```http
Authorization: Bearer <accessToken>
Content-Type: application/json
```

### Dual JWT Token Architecture
1. Upon successful `POST /api/vendors/login` or `POST /api/vendors/register`, store both:
   - `accessToken` (Short-lived JWT)
   - `refreshToken` (Long-lived JWT stored in SecureStorage/Keychain)
2. When receiving `HTTP 401 Unauthorized`:
   - Call `POST /api/vendors/refresh` with `{ "refreshToken": "<stored_refresh_token>" }`.
   - Update `accessToken` and retry the request.

---

## 📋 3. Vendor Data Models (TypeScript Interfaces)

```typescript
export interface Society {
  society_id: number;
  society_name: string;
  location: string;
  vendor_count?: number;
}

export interface VendorProfile {
  vendor_id: number;
  society_id: number;
  vendor_name: string;
  store_name: string;
  email: string;
  phone_number: string;
  gst_number: string;
  logo: string;
  description: string;
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'EXPIRED';
}

export interface CatalogItem {
  item_id: number;
  vendor_id: number;
  item_name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  unit: string; // e.g. "kg", "packet", "piece", "liter"
  is_available: boolean | number;
  image_url: string;
}

export interface CustomerOrderItem {
  item_id: number;
  item_name: string;
  quantity: number;
  price: number;
}

export interface CustomerOrder {
  order_id: number;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  total_amount: number;
  status: 'PENDING' | 'ACCEPTED' | 'DELIVERED' | 'CANCELLED';
  created_at: string;
  items: CustomerOrderItem[];
}
```

---

## 🛠️ 4. Vendor API Endpoints Reference

---

### 🏛️ 4.1 Onboarding: Fetch & Add Housing Societies

#### Get Societies List
- **Endpoint:** `GET /api/societies`
- **Auth:** Public
- **Description:** Retrieve available housing societies to populate society dropdown during vendor registration.
- **Query Params:** `?search=sunshine` (Optional)

#### Create New Society
- **Endpoint:** `POST /api/societies`
- **Auth:** Required (`Bearer <accessToken>`)
- **Request Body:** `{ "society_name": "Sunshine Heights", "location": "Sector 62, Noida" }`
- **Response `201 Created`:** `{ "message": "Society created successfully", "society_id": 5 }`
- **Error `400 Bad Request` (Duplicate Name):** `{ "error": "A society named \"Sunshine Heights\" already exists. Please choose a different name." }`

---

### 🔑 4.2 Vendor Account Registration & Payment Submission
- **Endpoint:** `POST /api/vendors/register`
- **Auth:** Public
- **Request Body:**
```json
{
  "society_id": 1,
  "vendor_name": "Rajesh Sharma",
  "email": "freshmart@gmail.com",
  "password": "VendorSecretPassword123",
  "store_name": "FreshMart Grocery Store",
  "phone_number": "9876543210",
  "gst_number": "07AAACR12341Z5",
  "payment_method": "Razorpay (UPI)",
  "transaction_id": "RAZORPAY_TXN_991823"
}
```
- **Response `201 Created`:**
```json
{
  "message": "Vendor registration & payment submitted successfully!",
  "vendor_id": 1,
  "vendor": {
    "vendor_id": 1,
    "society_id": 1,
    "vendor_name": "Rajesh Sharma",
    "store_name": "FreshMart Grocery Store",
    "email": "freshmart@gmail.com",
    "status": "PENDING"
  },
  "status": "PENDING",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### 🔐 4.3 Vendor Login
- **Endpoint:** `POST /api/vendors/login`
- **Auth:** Public (Protected by Brute-Force Rate Limiter)
- **Request Body:**
```json
{
  "email": "freshmart@gmail.com",
  "password": "VendorSecretPassword123"
}
```
- **Response `200 OK`:**
```json
{
  "message": "Login successful",
  "vendor": {
    "vendor_id": 1,
    "society_id": 1,
    "vendor_name": "Rajesh Sharma",
    "store_name": "FreshMart Grocery Store",
    "email": "freshmart@gmail.com",
    "status": "ACTIVE"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```
- **Error Responses:**
  - `401 Unauthorized`: `{ "error": "Invalid email or password" }`
  - `403 Forbidden`: `{ "error": "Access Denied: Your vendor application was rejected by DigiLocal Admin.", "status": "REJECTED" }`
  - `429 Too Many Requests`: `{ "error": "Account temporarily locked due to repeated failed login attempts. Please try again in 15 minute(s).", "isLocked": true }`

---

### 🔄 4.4 Refresh Access Token
- **Endpoint:** `POST /api/vendors/refresh`
- **Auth:** Public
- **Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```
- **Response `200 OK`:**
```json
{
  "message": "Access token refreshed successfully",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### 🚪 4.5 Vendor Logout
- **Endpoint:** `POST /api/vendors/logout`
- **Auth:** Required (`Bearer <accessToken>`)
- **Request Body:** `{ "refreshToken": "..." }`
- **Response `200 OK`:** `{ "message": "Logout successful, tokens revoked" }`

---

### 🔑 4.6 Password Reset Workflow (OTP)

#### Step 1: Request 6-Digit OTP
- **Endpoint:** `POST /api/vendors/forgot-password`
- **Request Body:** `{ "email": "freshmart@gmail.com" }`
- **Response `200 OK`:**
```json
{
  "message": "OTP sent successfully to registered email address",
  "simulationOtp": "849201"
}
```

#### Step 2: Verify OTP
- **Endpoint:** `POST /api/vendors/verify-otp`
- **Request Body:** `{ "email": "freshmart@gmail.com", "otp": "849201" }`
- **Response `200 OK`:** `{ "message": "OTP verified successfully" }`

#### Step 3: Set New Password
- **Endpoint:** `POST /api/vendors/reset-password`
- **Request Body:** `{ "email": "freshmart@gmail.com", "otp": "849201", "newPassword": "NewStrongPassword123" }`
- **Response `200 OK`:** `{ "message": "Password reset successfully. You can now log in with your new password." }`

---

### 📊 4.7 Get Full Vendor Dashboard Data
- **Endpoint:** `GET /api/vendorPanel/:vendorId`
- **Auth:** Required (`Bearer <accessToken>`)
- **Description:** Returns store summary, entire product catalog, and incoming customer orders.
- **Response `200 OK`:**
```json
{
  "vendor": {
    "vendor_id": 1,
    "society_id": 1,
    "vendor_name": "Rajesh Sharma",
    "store_name": "FreshMart Grocery Store",
    "email": "freshmart@gmail.com",
    "phone_number": "9876543210",
    "gst_number": "07AAACR12341Z5",
    "status": "ACTIVE"
  },
  "items": [
    {
      "item_id": 10,
      "vendor_id": 1,
      "item_name": "Aashirvaad Whole Wheat Atta 5kg",
      "description": "100% pure wheat flour",
      "price": 275.00,
      "stock": 50,
      "category": "Grocery",
      "unit": "packet",
      "is_available": 1,
      "image_url": "https://images.unsplash.com/photo-1542838132-92c53300491e"
    }
  ],
  "orders": [
    {
      "order_id": 101,
      "customer_name": "Ananya Roy",
      "customer_phone": "9811223344",
      "customer_address": "Flat 402, Tower B",
      "total_amount": 550.00,
      "status": "PENDING",
      "created_at": "2026-08-05T10:30:00Z"
    }
  ]
}
```

---

### 📦 4.8 Product Catalog Management (CRUD)

#### ➕ Add New Product
- **Endpoint:** `POST /api/vendorPanel/:vendorId/items`
- **Auth:** Required (`Bearer <accessToken>`)
- **Request Body:**
```json
{
  "item_name": "Amul Taza Toned Milk 1L",
  "description": "Pasteurized toned milk pouch",
  "price": 54.00,
  "stock": 100,
  "category": "Dairy",
  "unit": "liter",
  "is_available": true,
  "image_url": "https://images.unsplash.com/photo-1550583724-b2692b85b150"
}
```
- **Response `201 Created`:**
```json
{
  "message": "Item added successfully",
  "item_id": 11
}
```

#### ✏️ Update Product Details or Toggle Stock Availability
- **Endpoint:** `PUT /api/vendorPanel/:vendorId/items/:itemId`
- **Auth:** Required (`Bearer <accessToken>`)
- **Option A (Full Edit):**
```json
{
  "item_name": "Amul Taza Toned Milk 1L",
  "description": "Pasteurized fresh milk",
  "price": 56.00,
  "stock": 80,
  "category": "Dairy",
  "unit": "liter",
  "is_available": true,
  "image_url": "https://images.unsplash.com/photo-1550583724-b2692b85b150"
}
```
- **Option B (Stock Availability Toggle only):**
```json
{
  "is_available": false
}
```
- **Response `200 OK`:** `{ "message": "Item updated successfully" }`

#### 🗑️ Delete Product
- **Endpoint:** `DELETE /api/vendorPanel/:vendorId/items/:itemId`
- **Auth:** Required (`Bearer <accessToken>`)
- **Response `200 OK`:** `{ "message": "Item deleted successfully" }`

---

### 🚚 4.9 Vendor Order Management (Accept / Deliver / Cancel Order)
- **Endpoint:** `PUT /api/orders/:orderId/status`
- **Auth:** Required (`Bearer <accessToken>`)
- **Request Body:**
```json
{
  "status": "ACCEPTED" 
}
```
- **Allowed Status Options:**
  - `"ACCEPTED"` (Vendor accepts incoming order)
  - `"DELIVERED"` (Order completed & delivered to customer)
  - `"CANCELLED"` (Vendor declines order)
- **Response `200 OK`:**
```json
{
  "message": "Order status updated",
  "status": "ACCEPTED"
}
```

---

### ⚙️ 4.10 Update Vendor Store Profile & Settings
- **Endpoint:** `PUT /api/vendorPanel/:vendorId/settings`
- **Auth:** Required (`Bearer <accessToken>`)
- **Request Body:**
```json
{
  "store_name": "FreshMart Organic & Supermarket",
  "phone_number": "9876543210",
  "gst_number": "07AAACR12341Z5",
  "description": "Premium organic groceries delivered to your door",
  "logo": "https://images.unsplash.com/photo-1534723452862-4c874018d66d"
}
```
- **Response `200 OK`:** `{ "message": "Store settings updated successfully", "logo": "..." }`

---

### 💳 4.11 Renew Annual Vendor Subscription
- **Endpoint:** `POST /api/vendorPanel/:vendorId/renew`
- **Auth:** Required (`Bearer <accessToken>`)
- **Request Body:**
```json
{
  "payment_method": "Razorpay (UPI)",
  "transaction_id": "RAZORPAY_RENEW_881923"
}
```
- **Response `200 OK`:**
```json
{
  "message": "Subscription renewed successfully for 1 year!",
  "start_date": "2026-08-05",
  "end_date": "2027-08-05"
}
```

---

## 📱 5. Production Vendor App API Client Implementation (TypeScript & Axios)

```typescript
import axios from 'axios';

// Replace with your local IP or production domain
const BASE_URL = 'http://172.25.12.195:5000';

export const vendorApi = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Auto-attach JWT Access Token
vendorApi.interceptors.request.use(async (config) => {
  const token = await getStoredToken('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Automatic 401 Unauthorized Refresh Interceptor
vendorApi.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = await getStoredToken('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${BASE_URL}/api/vendors/refresh`, { refreshToken });
        await saveStoredToken('accessToken', data.accessToken);
        
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return vendorApi(originalRequest);
      } catch (err) {
        await clearStoredTokens();
        // Redirect to Vendor Login Screen
        return Promise.reject(err);
      }
    }
    return Promise.reject(error);
  }
);
```
