import { createClient } from 'redis';
import { WebSocket } from 'ws';
import { OPENAI_API_KEY } from '../config/environment.js';
import { handleWebSocketConnection, sendInitialConversationItem } from '../utils/websocket-helpers.js';
// Initialize Redis client
const redisClient = createClient({
    url: process.env.REDISCLOUD_URL,
    socket: {
        tls: false, // Secure connection to Redis Cloud if needed
        rejectUnauthorized: false, // Accept self-signed certificates
    },
});

// Connect Redis client
(async () => {
    try {
        await redisClient.connect();
        console.log('Connected to Redis for media-stream');
    } catch (err) {
        console.error('Error connecting to Redis:', err.message);
        process.exit(1); // Exit process if Redis connection fails
    }
})();

redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err.message);
});

export default async function mediaStreamRoutes(fastify) {
    // Define WebSocket route
    fastify.get('/media-stream/:sessionId', { websocket: true }, async (connection, req) => {
        const { sessionId } = req.params;
        console.log(`[${new Date().toISOString()}] Incoming WebSocket request for sessionId: ${sessionId}`);

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
                throw new Error('No profile info found for the given sessionId.');
            }
            profileInfo = JSON.parse(profileInfoJson);
            console.log('Retrieved profile info:', profileInfo);
        } catch (err) {
            console.error(`Error retrieving profile info for sessionId ${sessionId}:`, err.message);
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

        // Call the handler function to manage the connection
        handleWebSocketConnection(connection, openAiWs, profileInfo);

        // Twilio WebSocket event handling
        connection.socket.on('message', async (message) => {
            try {
                const msg = JSON.parse(message);
                console.log(`[${new Date().toISOString()}] Received message from Twilio:`, JSON.stringify(msg, null, 2));

                switch (msg.event) {
                    case 'connected':
                        console.log(`[${new Date().toISOString()}] Twilio media stream connected.`);
                        break;

                    case 'start':
                        console.log(`[${new Date().toISOString()}] Twilio media stream started.`);
                        console.log('Start message details:', JSON.stringify(msg, null, 2));

                        // Initialize OpenAI session if the connection is open
                        if (openAiWs.readyState === WebSocket.OPEN) {
                            initializeOpenAiSession(openAiWs, profileInfo);
                        } else {
                            console.error('OpenAI WebSocket is not ready. Cannot initialize session.');
                        }
                        break;

                    case 'media':
                        console.log(`[${new Date().toISOString()}] Received media payload.`);
                        if (openAiWs.readyState === WebSocket.OPEN) {
                            const audioAppend = {
                                type: 'input_audio_buffer.append',
                                audio: msg.media.payload,
                            };
                            openAiWs.send(JSON.stringify(audioAppend));
                            console.log('Audio payload sent to OpenAI.');
                        } else {
                            console.error('OpenAI WebSocket is not ready. Cannot send audio payload.');
                        }
                        break;

                    case 'stop':
                        console.log(`[${new Date().toISOString()}] Twilio media stream stopped.`);
                        connection.socket.close();
                        break;

                    default:
                        console.log(`[${new Date().toISOString()}] Unknown Twilio event received: ${msg.event}`);
                        break;
                }
            } catch (err) {
                console.error('Error processing Twilio message:', err.message);
            }
        });

        // Handle connection errors and closures
        connection.socket.on('close', () => {
            console.log(`[${new Date().toISOString()}] Client WebSocket connection closed.`);
            if (openAiWs.readyState === WebSocket.OPEN) {
                openAiWs.close(1000, 'Connection closed by client.');
            }
        });

        connection.socket.on('error', (err) => {
            console.error('WebSocket error from Twilio client:', err.message);
        });

        // OpenAI WebSocket event handling
        openAiWs.on('open', () => {
            console.log(`[${new Date().toISOString()}] Connected to OpenAI WebSocket.`);
        });

        openAiWs.on('message', (data) => {
            try {
                const response = JSON.parse(data);
                console.log(`[${new Date().toISOString()}] Message received from OpenAI:`, JSON.stringify(response, null, 2));
            } catch (err) {
                console.error('Error processing OpenAI response:', err.message);
            }
        });

        openAiWs.on('close', (code, reason) => {
            console.log(`[${new Date().toISOString()}] OpenAI WebSocket closed. Code: ${code}, Reason: ${reason || 'None'}`);
        });

        openAiWs.on('error', (err) => {
            console.error('OpenAI WebSocket error:', err.message);
        });
    });
}

// Initialize OpenAI session
function initializeOpenAiSession(openAiWs, profileInfo) {
    console.log(`[${new Date().toISOString()}] Initializing OpenAI session.`);
    const sessionUpdate = {
        type: 'session.update',
        session: {
            turn_detection: { type: 'server_vad' },
            input_audio_format: 'g711_ulaw',
            output_audio_format: 'g711_ulaw',
            voice: 'alloy', // Adjust as needed
            instructions: profileInfo?.SayMessage || 'How can I assist?',
            modalities: ['text', 'audio'],
            temperature: 0.8,
        },
    };

    console.log('Session update payload:', JSON.stringify(sessionUpdate, null, 2));
    openAiWs.send(JSON.stringify(sessionUpdate));

    // Send initial conversation item
    sendInitialConversationItem(openAiWs, profileInfo?.InitialMessage || 'Welcome to the media stream! How can I assist?');
}
