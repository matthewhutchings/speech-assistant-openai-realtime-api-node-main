import { createClient } from 'redis';
import { WebSocket } from 'ws';
import { getProfileInfo } from '../services/profile-service.js';
import { sendInitialConversationItem } from '../utils/websocket-helpers.js';


// Initialize Redis client globally to ensure a single connection
const redisClient = createClient({
    url: process.env.REDISCLOUD_URL,
    socket: {
        tls: false, // Enable TLS for secure connection to Redis Cloud
        rejectUnauthorized: false, // Accept self-signed certificates if necessary
    },
});
// Connect the Redis client once during application startup
(async () => {
    try {
        await redisClient.connect();
        console.log('Incoming Call Connected to Redis');
    } catch (err) {
        console.error('Error connecting to Redis:', err);
        process.exit(1); // Exit if Redis connection fails
    }
})();

redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
});

export default async function incomingCallRoutes(fastify) {
    fastify.all('/incoming-call', async (request, reply) => {
        try {
            // Extract call details from the request
            const phoneNumber = request.body?.To || '';
            const twilioNumber = process.env.TWILIO_PHONE_NUMBER || '';
            const direction = request.query?.direction || 'incoming';

            // Retrieve profile information for the caller
            const profileInfo = await getProfileInfo(phoneNumber, twilioNumber, direction);

            // Generate a unique session ID
            const sessionId = `${phoneNumber}-${Date.now()}`;

            // Store profile info in Redis with a 5-minute expiration
            await redisClient.set(sessionId, JSON.stringify(profileInfo), { EX: 300 });

            console.log('Stored profile info in Redis for sessionId:', sessionId);

            // Customize the message if available
            let sayMessage = 'Hey - How can I help you?';
            if (profileInfo?.SayMessage) {
                sayMessage = profileInfo.SayMessage;
            }

            const websocketHost = process.env.WEBSOCKET_HOST || request.headers.host;

            // Generate TwiML response with the sessionId
            const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="wss://${websocketHost}/media-stream?sessionId=${sessionId}">
        </Stream>
    </Connect>
</Response>`.trim();

            reply.type('text/xml').send(twimlResponse);
            console.log('Generated TwiML response with Stream URL and sessionId.');

            // Create WebSocket connection to OpenAI or your backend service
            const openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    'OpenAI-Beta': 'realtime=v1',
                },
            });

            // Handle OpenAI WebSocket events
            openAiWs.on('open', () => {
                console.log('Connected to OpenAI WebSocket.');
                sendInitialConversationItem(openAiWs); // Send the initial conversation item
            });

            openAiWs.on('error', (error) => {
                console.error('OpenAI WebSocket error:', error);
            });

            openAiWs.on('close', () => {
                console.log('OpenAI WebSocket connection closed.');
            });
        } catch (error) {
            console.error('Error handling incoming call:', error);
            reply.status(500).send('An error occurred while handling the call.');
        }
    });
}
