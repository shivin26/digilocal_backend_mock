# 🏪 DigiLocal Vendor Mobile App - Complete API Integration Handbook

This API handbook is prepared specifically for **Vendor Mobile App Frontend Developers** (React Native, Flutter, iOS, Android, or Web). It documents all REST endpoints, request/response schemas, dual JWT authentication headers, error codes, and TypeScript interfaces needed to build the vendor mobile application.

---

## 🌐 1. Base URL & Environments

Configure your HTTP Client (Axios / Fetch) base URL:

| Environment | Base URL |
| :--- | :--- |
| **Local Web / PC** | `http://localhost:5000` |
| **Android Emulator** | `http://10.0.2.2:5000` |
| **Physical Mobile Device (Same Wi-Fi)** | `http://<your-local-ip>:5000` |
| **Render PostgreSQL Backend (Live)** | `https://digilocal-backend-mock.onrender.com` |

- **Interactive Swagger OpenAPI Docs:** `http://localhost:5000/api-docs`

---

## 🔐 2. Authentication & Header Conventions

### HTTP Request Headers
For all protected Vendor endpoints, attach the JWT `Authorization` header:

```http
Authorization: Bearer <accessToken>
Content-Type: application/json
```

### Dual Session JWT Architecture
1. On successful `POST /api/vendors/login` or `POST /api/vendors/register`, store both `accessToken` (Short-lived) and `refreshToken` (Long-lived in SecureStore/Keychain).
2. When receiving `HTTP 401 Unauthorized`:
   - Call `POST /api/vendors/refresh` with `{ "refreshToken": "<stored_refresh_token>" }`.
   - Save the new `accessToken` and retry the failed request automatically.

---

## 📦 3. Data Models (TypeScript Interfaces)

```typescript
export interface HousingSociety {
  society_id: number;
  society_name: string;
  location: string;
  pincode: string;
  total_flats: number;
  rwa_phone?: string;
  image_url?: string;
}

export interface VendorProfile {
  vendor_id: number;
  society_id: number;
  vendor_name: string;
  store_name: string;
  email: string;
  phone_number: string;
  gst_number: string;
  opening_time: string;
  closing_time: string;
  logo: string;
  description: string;
  min_order_value?: number;
  delivery_charge?: number;
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'EXPIRED';
}

export interface ProductItem {
  item_id: number;
  vendor_id: number;
  item_name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  unit: string; // e.g. "kg", "packet", "piece", "liter"
  is_available: boolean | number;
  in_stock: boolean | number;
  image_url: string;
}

export interface OrderItem {
  item_id?: number;
  item_name: string;
  quantity: number;
  price: number;
}

export interface VendorOrder {
  order_id: string;
  user_id: string;
  customer_name: string;
  phone: string;
  delivery_address: string;
  total_amount: number;
  status: 'PENDING' | 'ACCEPTED' | 'CONFIRMED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';
  created_at: string;
  items: OrderItem[];
}
```

---

## 🚀 4. API Endpoints Reference

---

### 🏛️ 4.1 Onboarding: Fetch & Add Housing Societies

#### 1. List Housing Societies
- **Endpoint:** `GET /api/societies`
- **Auth:** Public
- **Description:** Populates the society selection dropdown during vendor registration.
- **Response `200 OK`:**
```json
[
  {
    "society_id": 1,
    "society_name": "Omaxe Greenwood Residency",
    "location": "Sector Greenwood, Omega II, Greater Noida",
    "pincode": "201310",
    "total_flats": 850,
    "vendor_count": 2,
    "image_url": "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800"
  }
]
```

#### 2. Onboard New Housing Society
- **Endpoint:** `POST /api/societies`
- **Auth:** Public
- **Request Body:**
```json
{
  "society_name": "Godrej Woods Community",
  "location": "Sector 43, Noida",
  "pincode": "201301",
  "total_flats": 450,
  "rwa_phone": "9876543210"
}
```
- **Response `201 Created`:**
```json
{
  "message": "Society onboarding request created successfully",
  "society_id": 5,
  "society": {
    "society_id": 5,
    "society_name": "Godrej Woods Community",
    "location": "Sector 43, Noida",
    "status": "APPROVED"
  }
}
```
- **Error `400 Bad Request` (Duplicate Name):**
```json
{
  "error": "A society named \"Godrej Woods Community\" already exists."
}
```

---

### 🔑 4.2 Vendor Registration & Login

#### 1. Vendor Account Registration
- **Endpoint:** `POST /api/vendors/register`
- **Auth:** Public
- **Request Body:**
```json
{
  "society_id": 1,
  "vendor_name": "Rajesh Sharma",
  "email": "freshmart@gmail.com",
  "password": "VendorPassword123",
  "store_name": "FreshMart Grocery & Organic",
  "phone_number": "9876543210",
  "gst_number": "07AAACR12341Z5",
  "payment_method": "Razorpay (UPI)",
  "transaction_id": "RAZORPAY_TXN_991823"
}
```
- **Response `201 Created`:**
```json
{
  "message": "Vendor registration submitted successfully",
  "vendor_id": 1,
  "vendor": {
    "vendor_id": 1,
    "store_name": "FreshMart Grocery & Organic",
    "vendor_name": "Rajesh Sharma",
    "email": "freshmart@gmail.com",
    "status": "ACTIVE"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### 2. Vendor Account Login
- **Endpoint:** `POST /api/vendors/login`
- **Auth:** Public (Rate-limited against brute-force)
- **Request Body:**
```json
{
  "email": "freshmart@gmail.com",
  "password": "VendorPassword123"
}
```
- **Response `200 OK`:**
```json
{
  "message": "Login successful",
  "vendor": {
    "vendor_id": 1,
    "store_name": "FreshMart Grocery & Organic",
    "vendor_name": "Rajesh Sharma",
    "email": "freshmart@gmail.com",
    "phone_number": "9876543210",
    "society_id": 1,
    "status": "ACTIVE"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### 3. Refresh Access Token
- **Endpoint:** `POST /api/vendors/refresh`
- **Auth:** Public
- **Request Body:** `{ "refreshToken": "<stored_refresh_token>" }`
- **Response `200 OK`:** `{ "accessToken": "eyJhbGciOiJIUzI1Ni..." }`

---

### 🔑 4.3 Password Reset (OTP Workflow)

1. **Request OTP:** `POST /api/vendors/forgot-password` ➔ `{ "email": "freshmart@gmail.com" }`
2. **Verify OTP:** `POST /api/vendors/verify-otp` ➔ `{ "email": "freshmart@gmail.com", "otp": "849201" }`
3. **Reset Password:** `POST /api/vendors/reset-password` ➔ `{ "email": "freshmart@gmail.com", "otp": "849201", "newPassword": "NewSecretPassword123" }`

---

### 📊 4.4 Vendor Panel Dashboard

- **Endpoint:** `GET /api/vendorPanel/:vendorId`
- **Auth:** Required (`Bearer <accessToken>`)
- **Description:** Fetches vendor store profile, full catalog items array, and incoming customer orders.
- **Response `200 OK`:**
```json
{
  "vendor": {
    "vendor_id": 1,
    "society_id": 1,
    "vendor_name": "Rajesh Sharma",
    "store_name": "FreshMart Grocery & Organic",
    "email": "freshmart@gmail.com",
    "phone_number": "9876543210",
    "opening_time": "08:00 AM",
    "closing_time": "10:00 PM",
    "status": "ACTIVE"
  },
  "items": [
    {
      "item_id": 101,
      "vendor_id": 1,
      "item_name": "Fresh Organic Milk (1L)",
      "description": "Pure farm fresh whole cow milk pouch.",
      "price": 68.00,
      "stock": 50,
      "category": "Dairy & Milk",
      "unit": "1 Litre",
      "is_available": true,
      "in_stock": true,
      "image_url": "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400"
    }
  ],
  "orders": [
    {
      "order_id": "ORD-9843",
      "customer_name": "Rahul Sharma",
      "phone": "9876543210",
      "delivery_address": "Tower A-402",
      "total_amount": 180.00,
      "status": "PENDING",
      "created_at": "2026-08-05T06:27:00.000Z",
      "items": [
        {
          "item_name": "Fresh Butter 500g",
          "quantity": 1,
          "price": 180.00
        }
      ]
    }
  ]
}
```

---

### 📦 4.5 Store Product Catalog Management (CRUD)

#### 1. Add Product Item
- **Endpoint:** `POST /api/vendors/:vendorId/items` (or `/api/vendorPanel/:vendorId/items`)
- **Auth:** Required (`Bearer <accessToken>`)
- **Request Body:**
```json
{
  "item_name": "Fresh Paneer 200g",
  "description": "Soft fresh dairy cottage cheese block",
  "price": 90.00,
  "category": "Dairy & Milk",
  "stock": 30,
  "unit": "200g",
  "is_available": true,
  "image_url": "https://images.unsplash.com/photo-1534723452862-4c874018d66d?w=400"
}
```
- **Response `201 Created`:**
```json
{
  "message": "Item added successfully",
  "item_id": 106,
  "item": {
    "item_id": 106,
    "item_name": "Fresh Paneer 200g",
    "price": 90.00,
    "in_stock": true
  }
}
```

#### 2. Update Product or Toggle In-Stock Status
- **Endpoint:** `PUT /api/vendorPanel/:vendorId/items/:itemId`
- **Auth:** Required (`Bearer <accessToken>`)
- **Request Body:**
```json
{
  "price": 95.00,
  "stock": 25,
  "is_available": false
}
```
- **Response `200 OK`:** `{ "message": "Item updated successfully" }`

#### 3. Delete Product Item
- **Endpoint:** `DELETE /api/vendorPanel/:vendorId/items/:itemId`
- **Auth:** Required (`Bearer <accessToken>`)
- **Response `200 OK`:** `{ "message": "Item deleted successfully" }`

---

### 🚚 4.6 Vendor Order Pipeline & Status Updates

#### 1. Fetch Store Orders
- **Endpoint:** `GET /api/orders/vendor/:vendorId`
- **Auth:** Required (`Bearer <accessToken>`)
- **Response `200 OK`:** Returns array of vendor orders with customer details and item lists.

#### 2. Update Order Status
- **Endpoint:** `PUT /api/orders/:id/status`
- **Auth:** Required (`Bearer <accessToken>`)
- **Request Body:**
```json
{
  "status": "CONFIRMED"
}
```
- **Supported Status Values:**
  - `"ACCEPTED"` or `"CONFIRMED"` (Vendor accepts order)
  - `"OUT_FOR_DELIVERY"` (Out for delivery within society)
  - `"DELIVERED"` (Delivery completed)
  - `"CANCELLED"` (Declined/Cancelled)
- **Response `200 OK`:**
```json
{
  "message": "Order status updated successfully",
  "order_id": "ORD-9843",
  "status": "CONFIRMED"
}
```

---

### ⚙️ 4.7 Update Vendor Store Settings
- **Endpoint:** `PUT /api/vendorPanel/:vendorId/settings`
- **Auth:** Required (`Bearer <accessToken>`)
- **Request Body:**
```json
{
  "store_name": "FreshMart Grocery & Organic",
  "phone_number": "9876543210",
  "opening_time": "07:30 AM",
  "closing_time": "10:30 PM",
  "description": "Quality goods & daily essentials delivered warm to your flat."
}
```
- **Response `200 OK`:** `{ "message": "Store settings updated successfully" }`

---

## 📱 5. Production Axios API Client Snippet (TypeScript)

```typescript
import axios from 'axios';

// Set Base URL to your backend server
const BASE_URL = 'http://localhost:5000'; // Or your Render live backend URL

export const vendorApiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor: Auto-attach JWT Access Token
vendorApiClient.interceptors.request.use(async (config) => {
  const token = await getStoredToken('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor: Handle 401 Unauthorized via Refresh Token
vendorApiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = await getStoredToken('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${BASE_URL}/api/vendors/refresh`, { refreshToken });
        await setStoredToken('accessToken', data.accessToken);

        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return vendorApiClient(originalRequest);
      } catch (err) {
        await clearTokens();
        // Redirect to Login Screen
        return Promise.reject(err);
      }
    }
    return Promise.reject(error);
  }
);
```
