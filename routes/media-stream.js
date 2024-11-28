import { createClient } from 'redis';
import { WebSocket } from 'ws';
import { OPENAI_API_KEY } from '../config/environment.js';
import { sendInitialConversationItem } from '../utils/websocket-helpers.js';

// Initialize Redis client
const redisClient = createClient({
    url: process.env.REDISCLOUD_URL,
    socket: {
        tls: false, // Enable TLS for secure connection to Redis Cloud
        rejectUnauthorized: false, // Accept self-signed certificates if necessary
    },
});

// Connect Redis client
(async () => {
    try {
        await redisClient.connect();
        console.log('Connected to Redis for media-stream');
    } catch (err) {
        console.error('Error connecting to Redis:', err);
        process.exit(1); // Exit process if Redis connection fails
    }
})();

redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
});

export default async function mediaStreamRoutes(fastify) {
    fastify.get('/media-stream/:sessionId', { websocket: true }, async (connection, req) => {
        console.log('Incoming WebSocket request:', req.url);

        const { sessionId } = req.params;
        console.log('Session ID from URL:', sessionId);

        // Validate sessionId
        if (!sessionId) {
            console.error('No sessionId provided in URL path. Closing connection.');
            connection.socket.close(1008, 'No sessionId provided');
            return;
        }

        // Fetch profile info from Redis
        let profileInfo;
        try {
            const profileInfoJson = await redisClient.get(sessionId);
            if (!profileInfoJson) {
                throw new Error('No profile info found for sessionId.');
            }
            profileInfo = JSON.parse(profileInfoJson);
            console.log('Retrieved profile info:', profileInfo);
        } catch (err) {
            console.error('Error retrieving profile info from Redis:', err.message);
            connection.socket.close(1011, 'Internal server error');
            return;
        }

        // Establish OpenAI WebSocket connection
        const openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
            headers: {
                Authorization: `Bearer ${OPENAI_API_KEY}`,
                'OpenAI-Beta': 'realtime=v1',
            },
        });

        // WebSocket message handling
        connection.socket.on('message', async (message) => {
            try {
                const msg = JSON.parse(message);

                switch (msg.event) {
                    case 'connected':
                        console.log('Twilio media stream connected.');
                        break;

                    case 'start':
                        console.log('Twilio media stream started.');
                        console.log('Start message:', JSON.stringify(msg, null, 2));

                        // Initialize OpenAI session
                        if (openAiWs.readyState === WebSocket.OPEN) {
                            initializeOpenAiSession(openAiWs, profileInfo);
                        }
                        break;

                    case 'media':
                        console.log('Received media event.');
                        if (openAiWs.readyState === WebSocket.OPEN) {
                            openAiWs.send(
                                JSON.stringify({
                                    type: 'input_audio_buffer.append',
                                    audio: msg.media.payload,
                                })
                            );
                        }
                        break;

                    case 'stop':
                        console.log('Twilio media stream stopped.');
                        connection.socket.close();
                        break;

                    default:
                        console.log('Unknown event type:', msg.event);
                        break;
                }
            } catch (err) {
                console.error('Error processing WebSocket message:', err.message);
            }
        });

        // WebSocket connection error handling
        connection.socket.on('close', () => {
            console.log('WebSocket connection closed.');
            if (openAiWs.readyState === WebSocket.OPEN) {
                openAiWs.close(1000, 'Connection closed by client');
            }
        });

        connection.socket.on('error', (err) => {
            console.error('WebSocket error:', err.message);
        });

        // OpenAI WebSocket connection events
        openAiWs.on('open', () => {
            console.log('Connected to OpenAI WebSocket.');
        });

        openAiWs.on('error', (err) => {
            console.error('OpenAI WebSocket error:', err.message);
        });

        openAiWs.on('close', (code, reason) => {
            console.log(`OpenAI WebSocket closed. Code: ${code}, Reason: ${reason}`);
        });
    });
}

// Initialize OpenAI session
function initializeOpenAiSession(openAiWs, profileInfo) {
    console.log('initializeOpenAiSession Started')
    const sessionUpdate = {
        type: 'session.update',
        session: {
            turn_detection: { type: 'server_vad' },
            input_audio_format: 'g711_ulaw',
            output_audio_format: 'g711_ulaw',
            voice: 'alloy',
            instructions: `Welcome ${profileInfo?.SayMessage || 'How can I assist?'}`,
            modalities: ['text', 'audio'],
            temperature: 0.8,
        },
    };

    console.log(sessionUpdate)

    console.log('Sending session update:', JSON.stringify(sessionUpdate));
    openAiWs.send(JSON.stringify(sessionUpdate));
    sendInitialConversationItem(openAiWs, profileInfo?.InitialMessage || 'Welcome to the media stream! How can I assist?');
}
