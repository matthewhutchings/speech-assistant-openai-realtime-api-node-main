import { WEBSOCKET_HOST } from '../config/environment.js';
import { twilioClient } from './twilio-client.js'; // Updated to separate client initialization

// Twilio call function
export async function makeCall(to, from) {
    try {
        const call = await twilioClient.calls.create({
            to,
            from,
            url: `https://${WEBSOCKET_HOST}/incoming-call`, // Ensure WEBSOCKET_HOST is properly configured
        });
        return call.sid;
    } catch (error) {
        console.error('Twilio makeCall error:', error);
        throw new Error('Failed to make call with Twilio.'); // Rethrow for route handling
    }
}
