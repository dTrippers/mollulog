-- 쿠폰 마스터 테이블
CREATE TABLE coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  imageUrl TEXT,
  rewards TEXT NOT NULL DEFAULT '[]',   -- JSON: [{ "itemUid": "string", "quantity": number }]
  linkUrl TEXT,
  linkLabel TEXT,
  expiresAt TEXT,                       -- ISO 8601, nullable (무기한)
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX coupons_uid ON coupons (uid);
CREATE UNIQUE INDEX coupons_code ON coupons (code);

-- 유저별 쿠폰 등록 기록
CREATE TABLE coupon_registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL,
  userId INTEGER NOT NULL,
  couponId INTEGER NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX coupon_registrations_user_coupon ON coupon_registrations (userId, couponId);

-- 회원 코드
ALTER TABLE senseis ADD COLUMN memberCode TEXT;
