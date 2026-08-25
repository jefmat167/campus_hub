import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  // Application
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  CORS_ORIGIN: Joi.string().default('*'),

  // Database - Either DATABASE_URL or individual params required
  DATABASE_URL: Joi.string().uri({ scheme: ['postgres', 'postgresql'] }).optional(),
  DB_HOST: Joi.string().when('DATABASE_URL', {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.required(),
  }),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().when('DATABASE_URL', {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.required(),
  }),
  DB_PASSWORD: Joi.string().when('DATABASE_URL', {
    is: Joi.exist(),
    then: Joi.optional().allow(''),
    otherwise: Joi.required(),
  }),
  DB_NAME: Joi.string().when('DATABASE_URL', {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.required(),
  }),

  // Redis
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').default(''),

  // JWT
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  // Termii (SMS) - optional in development, mock OTP will be used
  TERMII_API_KEY: Joi.string().default(''),
  TERMII_SENDER_ID: Joi.string().default('CampusHub'),

  // Paystack (Payments) - optional in development
  PAYSTACK_SECRET_KEY: Joi.string().allow('').optional(),
  PAYSTACK_PUBLIC_KEY: Joi.string().allow('').optional(),

  // AWS S3 - optional, can be configured later
  AWS_ACCESS_KEY_ID: Joi.string().allow('').optional(),
  AWS_SECRET_ACCESS_KEY: Joi.string().allow('').optional(),
  AWS_REGION: Joi.string().default('eu-west-1'),
  AWS_S3_BUCKET: Joi.string().allow('').optional(),

  // Cloudinary (backup) - optional, can be configured later
  CLOUDINARY_CLOUD_NAME: Joi.string().allow('').optional(),
  CLOUDINARY_API_KEY: Joi.string().allow('').optional(),
  CLOUDINARY_API_SECRET: Joi.string().allow('').optional(),

  // Cloudflare R2 - optional, for presigned URL uploads
  R2_ACCOUNT_ID: Joi.string().allow('').optional(),
  R2_ACCESS_KEY_ID: Joi.string().allow('').optional(),
  R2_SECRET_ACCESS_KEY: Joi.string().allow('').optional(),
  R2_BUCKET_NAME: Joi.string().allow('').optional(),
  R2_PUBLIC_URL: Joi.string().uri().allow('').optional(),

  // Anonymous posts
  ANONYMOUS_SECRET: Joi.string().min(32).required(),

  // MongoDB (Social features) - optional, defaults to local
  MONGODB_URI: Joi.string().allow('').optional(),

  // Escrow tuning — safe production defaults; override per environment.
  // Dispute window defaults to 24h (1440 min); set lower only in dev/test.
  ESCROW_PLATFORM_FEE_PERCENT: Joi.number().min(0).default(2.5),
  ESCROW_FULFILLMENT_HOURS: Joi.number().min(1).default(72),
  ESCROW_DISPUTE_WINDOW_MINUTES: Joi.number().min(1).default(1440),

  // Per-university fee fallbacks (university_settings NULL → these defaults).
  // VENDOR_PLATFORM_FEE_PERCENT falls back to ESCROW_PLATFORM_FEE_PERCENT.
  VENDOR_PLATFORM_FEE_PERCENT: Joi.number().min(0).optional(),
  ESCROW_CANCELLATION_FEE_PERCENT: Joi.number().min(0).default(10),

  // Marketplace rev-2 timing knobs (TimingPolicyService) — uniform global
  // defaults; per-category overrides are a future table (spec 05).
  ORDER_CONFIRMATION_HOURS: Joi.number().min(1).default(24),
  SERVICE_AGREEMENT_HOURS: Joi.number().min(1).default(72),
  SERVICE_APPOINTMENT_HORIZON_DAYS: Joi.number().min(1).default(14),
  SERVICE_NO_SHOW_GRACE_MINUTES: Joi.number().min(0).default(30),
  SERVICE_APPOINTMENT_BACKSTOP_HOURS: Joi.number().min(1).default(24),
  OFFER_LOCK_HOURS: Joi.number().min(1).default(24),

  // Withdrawal fee (monetisation) — hybrid: PERCENT of the amount, floored at
  // MIN and capped at MAX (all Naira). Set MAX very high to disable the cap,
  // or PERCENT/MIN to 0 to effectively disable the fee.
  WITHDRAWAL_FEE_PERCENT: Joi.number().min(0).default(1.5),
  WITHDRAWAL_FEE_MIN: Joi.number().min(0).default(50),
  WITHDRAWAL_FEE_MAX: Joi.number().min(0).default(250),
});
