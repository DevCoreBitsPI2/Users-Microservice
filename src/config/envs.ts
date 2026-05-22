import 'dotenv/config';
import * as joi from 'joi';

interface EnvVars {
  PORT: number;
  DATABASE_URL: string;
  SUPABASE_URL: string;
  DATABASE_KEY: string;
  DATABASE_ADMIN_KEY: string;
  NATS_SERVERS: string[];
  QR_TOKEN_SECRET?: string;
  REDIRECT_URL?: string;
}

const envsSchema = joi
  .object({
    PORT: joi.number().required(),
    DATABASE_URL: joi.string().required(),
    SUPABASE_URL: joi.string().required(),
    DATABASE_KEY: joi.string().required(),
    DATABASE_ADMIN_KEY: joi.string().required(),
    NATS_SERVERS: joi.array().items(joi.string()).required(),
    QR_TOKEN_SECRET: joi.string().optional(),
    REDIRECT_URL: joi.string().required(),
  })
  .unknown(true);

const { error, value } = envsSchema.validate({
  ...process.env,
  NATS_SERVERS: process.env.NATS_SERVERS?.split(','),
});
if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

const envVars: EnvVars = value;

export const envs = {
  port: envVars.PORT,
  databaseUrl: envVars.DATABASE_URL,
  supabaseUrl: envVars.SUPABASE_URL,
  databaseKey: envVars.DATABASE_KEY,
  databaseAdminKey: envVars.DATABASE_ADMIN_KEY,
  natsServers: envVars.NATS_SERVERS,
  qrTokenSecret: envVars.QR_TOKEN_SECRET ?? envVars.DATABASE_ADMIN_KEY,
  redirectUrl: envVars.REDIRECT_URL,
};
