import dotenv from 'dotenv';

dotenv.config();

export const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
export const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const PORT = process.env.PORT || 3000;
export const WEBSOCKET_HOST = process.env.WEBSOCKET_HOST || 'localhost';
