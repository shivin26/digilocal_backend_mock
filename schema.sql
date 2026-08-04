-- DigiLocal PostgreSQL Database Schema

CREATE TABLE IF NOT EXISTS societies (
    society_id BIGSERIAL PRIMARY KEY,
    society_name VARCHAR(100) NOT NULL,
    location VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vendors (
    vendor_id BIGSERIAL PRIMARY KEY,
    society_id BIGINT REFERENCES societies(society_id) ON DELETE CASCADE,
    vendor_name VARCHAR(100) NOT NULL,
    gst_number VARCHAR(20),
    phone_number VARCHAR(15),
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    store_name VARCHAR(100) NOT NULL,
    logo TEXT DEFAULT 'https://images.unsplash.com/photo-1534723452862-4c874018d66d?w=200&auto=format&fit=crop&q=80',
    description TEXT DEFAULT 'Welcome to our store on DigiLocal!',
    status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
    customer_id BIGSERIAL PRIMARY KEY,
    customer_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(15) NOT NULL,
    address VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS items (
    item_id BIGSERIAL PRIMARY KEY,
    vendor_id BIGINT REFERENCES vendors(vendor_id) ON DELETE CASCADE,
    item_name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    stock INT DEFAULT 100,
    category VARCHAR(50) DEFAULT 'General',
    unit VARCHAR(20) DEFAULT 'piece',
    is_available BOOLEAN DEFAULT TRUE,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    order_id BIGSERIAL PRIMARY KEY,
    vendor_id BIGINT REFERENCES vendors(vendor_id) ON DELETE CASCADE,
    customer_id BIGINT REFERENCES customers(customer_id) ON DELETE CASCADE,
    order_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'PLACED',
    total_amount DECIMAL(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS order_details (
    order_id BIGINT REFERENCES orders(order_id) ON DELETE CASCADE,
    item_id BIGINT REFERENCES items(item_id) ON DELETE CASCADE,
    quantity INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    item_total DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (order_id, item_id)
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
