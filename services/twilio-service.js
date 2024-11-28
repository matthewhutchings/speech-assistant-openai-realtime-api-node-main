import { WEBSOCKET_HOST } from '../config/environment.js';
import { twilioClient } from './twilio-client.js';

export async function makeCall(to, from, direction = 'outgoing') {
    try {
        const call = await twilioClient.calls.create({
            to,
            from,
            url: `https://${WEBSOCKET_HOST}/incoming-call?direction=${encodeURIComponent(direction)}`,
        });
        return call.sid;
    } catch (error) {
        console.error('Twilio makeCall error:', error);
        throw new Error(`Failed to make call with Twilio: ${error.message}`);
    }
}
