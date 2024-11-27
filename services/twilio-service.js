import twilio from 'twilio';

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;

// Validate environment variables
if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error('Missing Twilio credentials. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in your environment.');
}

// Initialize the Twilio client
export const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// Twilio call function
export async function makeCall(to, from) {
    try {
        const call = await client.calls.create({
            to,
            from,
            url: `https://node.fewzen.com/incoming-call`, // URL for handling the call
        });
        return call.sid;
    } catch (error) {
        console.error('Twilio makeCall error:', error);
        throw new Error('Failed to make call with Twilio.'); // Rethrow for route handling
    }
}