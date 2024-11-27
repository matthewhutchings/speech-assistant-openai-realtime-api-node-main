import twilio from 'twilio';
import { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } from '../config/environment.js';

// Validate environment variables
if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error('Missing Twilio credentials. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in your environment.');
}

// Initialize and export the Twilio client
export const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
