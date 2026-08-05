# 📱 DigiLocal Platform - Frontend Developer Integration Guide

Welcome! This guide provides everything an App / Web Frontend Developer needs to connect an Android, iOS, React Native, Flutter, or Web application to the **DigiLocal Backend API**.

---

## 🚀 1. Base URLs & Environment Setup

When running the backend server locally, use the appropriate Base URL depending on your development environment:

| Client Environment | Base URL | Notes |
| :--- | :--- | :--- |
| **Web Browser / iOS Simulator** | `http://localhost:5000` | Standard local development |
| **Android Emulator** | `http://10.0.2.2:5000` | Android Virtual Device loopback IP |
| **Physical Phone (Wi-Fi/LAN)** | `http://172.25.12.195:5000` | Devices connected to the same Wi-Fi |

### 🛠 Interactive API Documentation (Swagger)
- **Interactive Swagger UI:** `http://172.25.12.195:5000/api-docs` (or `http://localhost:5000/api-docs`)
- **OpenAPI 3.1 JSON Spec:** `http://172.25.12.195:5000/openapi.json`
- **Health Check Endpoint:** `GET /health`

---

## 🔐 2. Authentication & Token Management

DigiLocal uses **JWT (JSON Web Tokens)** for protected vendor endpoints.

### Authentication Headers
For all protected routes (`/api/vendor-panel/*`), attach the Access Token in the request header:
```http
Authorization: Bearer <accessToken>
Content-Type: application/json
```

### Dual-Token Lifecycle (Access & Refresh Tokens)
1. Upon `POST /api/vendors/login` or `POST /api/vendors/register`, the backend returns:
   - `accessToken` (Short-lived, used for authorization)
   - `refreshToken` (Long-lived, stored securely in Keychain / EncryptedSharedPreferences / SecureStore)
2. When an API call returns `401 Unauthorized` (token expired), automatically call the refresh endpoint:
   - `POST /api/vendors/refresh` with body `{ "refreshToken": "<refreshToken>" }`
3. Store the newly returned `accessToken` and retry the original failed request.

---

## 📑 3. TypeScript Data Types & Interfaces

```typescript
// Society
export interface Society {
  id: number;
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
}

// Vendor
export interface Vendor {
  vendor_id: number;
  society_id: number;
  vendor_name: string;
  store_name: string;
  email: string;
  phone_number: string;
  gst_number?: string;
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'EXPIRED';
  created_at: string;
}

// Product
export interface Product {
  id: number;
  vendor_id: number;
  name: string;
  description?: string;
  price: number;
  unit: string; // e.g. "kg", "liter", "piece", "packet"
  category: string;
  in_stock: boolean;
  image_url?: string;
}

// Order Item
export interface OrderItem {
  product_id: number;
  product_name: string;
  quantity: number;
  price: number;
}

// Order
export interface Order {
  id: number;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  society_id: number;
  vendor_id: number;
  total_amount: number;
  status: 'PENDING' | 'ACCEPTED' | 'DELIVERED' | 'CANCELLED';
  created_at: string;
  items: OrderItem[];
}
```

---

## 🎯 4. Complete API Endpoint Reference

### 🏬 4.1 Society Directory & Search (Public)
| Method | Endpoint | Description | Query Params / Body |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/societies` | Get list of all registered housing societies | None |
| `GET` | `/api/societies/:id` | Get details for a specific society | `id` (path param) |

---

### 🛒 4.2 Customer Storefront & Products (Public)
| Method | Endpoint | Description | Query Params / Body |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/storefront/societies/:society_id/vendors` | List active vendors in a housing society | `society_id` (path) |
| `GET` | `/api/storefront/vendors/:vendor_id/products` | Get product catalog of a specific vendor | `vendor_id` (path) |
| `GET` | `/api/storefront/search` | Search stores or items across society | `?q=grocery&society_id=1` |

---

### 📦 4.3 Customer Order Placement & Tracking (Public)
| Method | Endpoint | Description | Body / Response |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/orders` | Place customer order | **Body:** `{ customer_name, customer_phone, customer_address, society_id, vendor_id, items: [{ product_id, quantity }] }` |
| `GET` | `/api/orders/:order_id` | Track live order status | **Path:** `order_id` or `order_number` |

---

### 🔑 4.4 Vendor Authentication & Account Setup (Public)
| Method | Endpoint | Description | Request Body |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/vendors/register` | Register new vendor & submit subscription | `{ society_id, vendor_name, email, password, store_name, phone_number, gst_number, payment_method, transaction_id }` |
| `POST` | `/api/vendors/login` | Login vendor | `{ email, password }` |
| `POST` | `/api/vendors/refresh` | Obtain new Access Token | `{ refreshToken }` |
| `POST` | `/api/vendors/logout` | Invalidate tokens | `{ refreshToken }` (Requires Auth Header) |
| `POST` | `/api/vendors/forgot-password` | Request password reset 6-digit OTP | `{ email }` |
| `POST` | `/api/vendors/verify-otp` | Verify 6-digit OTP | `{ email, otp }` |
| `POST` | `/api/vendors/reset-password` | Set new password after OTP verification | `{ email, otp, newPassword }` |

---

### 📊 4.5 Vendor Panel (Protected — Requires `Authorization: Bearer <accessToken>`)
| Method | Endpoint | Description | Request Body / Details |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/vendor-panel/profile` | Get logged-in vendor profile | None |
| `PUT` | `/api/vendor-panel/profile` | Update vendor store info | `{ store_name, phone_number, gst_number }` |
| `GET` | `/api/vendor-panel/products` | List all products owned by vendor | None |
| `POST` | `/api/vendor-panel/products` | Add new product to store | `{ name, description, price, unit, category, in_stock, image_url }` |
| `PUT` | `/api/vendor-panel/products/:id` | Update existing product | `{ name, price, unit, category, in_stock, image_url }` |
| `DELETE` | `/api/vendor-panel/products/:id` | Remove product | Path param: `id` |
| `GET` | `/api/vendor-panel/orders` | Get incoming customer orders | Optional: `?status=PENDING` |
| `PATCH` | `/api/vendor-panel/orders/:id/status` | Change order status | `{ status: "ACCEPTED" }` (`PENDING` \| `ACCEPTED` \| `DELIVERED` \| `CANCELLED`) |
| `GET` | `/api/vendor-panel/analytics` | Sales analytics, revenue & order counts | None |

---

### 🛡️ 4.6 Admin Management Portal
| Method | Endpoint | Description | Request Body |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/vendors` | List pending / active vendor applications | Optional: `?status=PENDING` |
| `PATCH` | `/api/admin/vendors/:id/status` | Approve or Reject vendor application | `{ status: "ACTIVE" }` or `{ status: "REJECTED" }` |
| `GET` | `/api/admin/reports` | Platform high-level overview | None |

---

## 💻 5. Ready-to-Use Frontend Integration Code Examples

### 🅰️ Axios HTTP Client Setup with Auto Token Refresh (React / React Native / Vue)

```typescript
import axios from 'axios';

// Set base URL dynamically or from environment variables
const API_BASE_URL = 'http://172.25.12.195:5000'; // Replace with your IP or localhost

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add Request Interceptor to automatically attach Access Token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken'); // Or SecureStore / AsyncStorage
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Add Response Interceptor for Automatic 401 Refresh Handling
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token available');

        const { data } = await axios.post(`${API_BASE_URL}/api/vendors/refresh`, {
          refreshToken,
        });

        localStorage.setItem('accessToken', data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;

        return api(originalRequest); // Retry failed request with new token
      } catch (refreshErr) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  }
);
```

---

### 📱 Flutter / Dart HTTP Client Setup Example

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiService {
  static const String baseUrl = 'http://172.25.12.195:5000';
  String? accessToken;

  // Header helper
  Map<String, String> _getHeaders() {
    return {
      'Content-Type': 'application/json',
      if (accessToken != null) 'Authorization': 'Bearer $accessToken',
    };
  }

  // Fetch Vendors in a Society
  Future<List<dynamic>> fetchVendors(int societyId) async {
    final response = await http.get(
      Uri.parse('$baseUrl/api/storefront/societies/$societyId/vendors'),
      headers: _getHeaders(),
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      throw Exception('Failed to load vendors: ${response.body}');
    }
  }

  // Vendor Login
  Future<Map<String, dynamic>> login(String email, String password) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/vendors/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      accessToken = data['accessToken'];
      return data;
    } else {
      throw Exception(jsonDecode(response.body)['error'] ?? 'Login failed');
    }
  }
}
```

---

## ⚠️ 6. Error Handling & Standard Responses

All error responses from the backend return a consistent JSON structure:

```json
{
  "error": "Descriptive error message explaining what went wrong"
}
```

### Common HTTP Status Codes
- `200 OK` — Success.
- `201 Created` — Resource created (Registration, Product added, Order placed).
- `400 Bad Request` — Validation failure or missing required fields.
- `401 Unauthorized` — Invalid credentials or expired access token.
- `403 Forbidden` — Access denied (e.g. vendor application pending or rejected).
- `404 Not Found` — Resource does not exist.
- `429 Too Many Requests` — Rate limit exceeded (e.g. too many failed login attempts; locked for 15 mins).
- `500 Internal Server Error` — Server issue.
