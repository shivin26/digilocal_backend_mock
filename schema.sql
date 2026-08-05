-- DigiLocal Platform Relational Database Schema (PostgreSQL & SQLite compatible)

CREATE TABLE IF NOT EXISTS societies (
    society_id BIGSERIAL PRIMARY KEY,
    society_name VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    pincode VARCHAR(10) DEFAULT '201310',
    total_flats INT DEFAULT 0,
    rwa_phone VARCHAR(20),
    image_url TEXT,
    banner_image TEXT,
    public_id VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    society_id BIGINT REFERENCES societies(society_id) ON DELETE SET NULL,
    flat VARCHAR(100),
    joined_date VARCHAR(50),
    avatar TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vendors (
    vendor_id BIGSERIAL PRIMARY KEY,
    society_id BIGINT REFERENCES societies(society_id) ON DELETE CASCADE,
    vendor_name VARCHAR(255) NOT NULL,
    store_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    password VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),
    gst_number VARCHAR(50),
    opening_time VARCHAR(20) DEFAULT '08:00 AM',
    closing_time VARCHAR(20) DEFAULT '10:00 PM',
    opening_timing VARCHAR(20) DEFAULT '08:00 AM',
    closing_timing VARCHAR(20) DEFAULT '10:00 PM',
    min_order_value DECIMAL(10,2) DEFAULT 0.00,
    max_quantity_limit INT DEFAULT 10,
    delivery_charge DECIMAL(10,2) DEFAULT 0.00,
    gst_percentage DECIMAL(5,2) DEFAULT 5.00,
    service_charge_percentage DECIMAL(5,2) DEFAULT 0.00,
    logo TEXT DEFAULT 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=200&auto=format&fit=crop&q=80',
    description TEXT DEFAULT 'Quality goods & daily essentials delivered within society via WhatsApp.',
    status VARCHAR(20) DEFAULT 'ACTIVE',
    public_id VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS items (
    item_id BIGSERIAL PRIMARY KEY,
    vendor_id BIGINT REFERENCES vendors(vendor_id) ON DELETE CASCADE,
    item_name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    stock INT DEFAULT 100,
    category VARCHAR(100) DEFAULT 'General',
    unit VARCHAR(20) DEFAULT 'piece',
    is_available BOOLEAN DEFAULT TRUE,
    in_stock BOOLEAN DEFAULT TRUE,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS catalog_items (
    item_id BIGSERIAL PRIMARY KEY,
    vendor_id BIGINT REFERENCES vendors(vendor_id) ON DELETE CASCADE,
    item_name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    category VARCHAR(100),
    description TEXT,
    image_url TEXT,
    in_stock BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    order_id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100),
    vendor_id BIGINT REFERENCES vendors(vendor_id) ON DELETE CASCADE,
    society_id BIGINT REFERENCES societies(society_id) ON DELETE SET NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING',
    delivery_address TEXT NOT NULL,
    customer_id BIGINT,
    order_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_details (
    order_id VARCHAR(100) NOT NULL,
    item_id BIGINT,
    item_name VARCHAR(255),
    quantity INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    unit_price DECIMAL(10,2),
    item_total DECIMAL(10,2),
    PRIMARY KEY (order_id, item_name)
);

CREATE TABLE IF NOT EXISTS subscriptions (
    subscription_id BIGSERIAL PRIMARY KEY,
    vendor_id BIGINT REFERENCES vendors(vendor_id) ON DELETE CASCADE,
    start_date DATE,
    end_date DATE,
    status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
    payment_id BIGSERIAL PRIMARY KEY,
    subscription_id BIGINT REFERENCES subscriptions(subscription_id) ON DELETE CASCADE,
    vendor_id BIGINT REFERENCES vendors(vendor_id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    payment_method VARCHAR(30) DEFAULT 'Razorpay (UPI)',
    transaction_id VARCHAR(100) UNIQUE,
    status VARCHAR(20) DEFAULT 'SUCCESS',
    paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_config (
    config_key VARCHAR(100) PRIMARY KEY,
    config_value TEXT NOT NULL
);
