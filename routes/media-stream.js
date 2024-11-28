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
(async () => {
    try {
        await redisClient.connect();
        console.log('Connected to Redis for media-stream');
    } catch (err) {
        console.error('Error connecting to Redis:', err);
        process.exit(1);
    }
})();

redisClient.on('error', (err) => console.error('Redis Client Error:', err));

export default async function mediaStreamRoutes(fastify) {
    fastify.get('/media-stream', { websocket: true }, async (connection, req) => {
        console.log('Incoming WebSocket request:', req.url);

        let sessionId;
        try {

            console.log("url is" + req.url)
            const url = new URL(req.url, `https://${req.headers.host}`);

            console.log(url)
            sessionId = url.searchParams.get('sessionId');
            if (!sessionId) {
                console.error('No sessionId provided. Closing connection.');
                connection.close(1008, 'No sessionId provided'); // Close with policy violation code
                return;
            }
            console.log('Session ID:', sessionId);
        } catch (err) {
            console.error('Error parsing WebSocket URL:', err);
            connection.close(1008, 'Malformed URL');
            return;
        }

        // Fetch profile info from Redis
        let profileInfo;

        console.log("The media stream sessionID is: " + sessionId)
        try {
            const profileInfoJson = await redisClient.get(sessionId);
            if (!profileInfoJson) {
                console.error('No profile info found for sessionId:', sessionId);
                connection.close(1008, 'No profile info found');
                return;
            }
            profileInfo = JSON.parse(profileInfoJson);
            console.log('Retrieved profile info:', profileInfo);
        } catch (error) {
            console.error('Error retrieving profile info from Redis:', error);
            connection.close(1011, 'Internal server error');
            return;
        }

        // OpenAI WebSocket
        const openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
            headers: {
                Authorization: `Bearer ${OPENAI_API_KEY}`,
                "OpenAI-Beta": "realtime=v1",
            },
        });

        // Heartbeat mechanism to keep the connection alive
        let isAlive = true;
        connection.on('pong', () => {
            isAlive = true;
        });

        const interval = setInterval(() => {
            if (!isAlive) {
                console.log('Client is unresponsive. Terminating connection.');
                connection.terminate();
                clearInterval(interval);
                return;
            }
            isAlive = false;
            connection.ping();
        }, 30000);

        // Initialize OpenAI session
        const initializeSession = () => {
            const sessionUpdate = {
                type: 'session.update',
                session: {
                    turn_detection: { type: 'server_vad' },
                    input_audio_format: 'g711_ulaw',
                    output_audio_format: 'g711_ulaw',
                    voice: 'alloy',
                    instructions: `Welcome ${profileInfo?.Name || 'Guest'}! ${profileInfo?.SayMessage || 'How can I assist?'}`,
                    modalities: ["text", "audio"],
                    temperature: 0.8,
                },
            };

            console.log('Sending session update:', JSON.stringify(sessionUpdate));
            openAiWs.send(JSON.stringify(sessionUpdate));
            sendInitialConversationItem(openAiWs, profileInfo?.InitialMessage || "Welcome to the media stream! How can I assist?");
        };

        connection.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                console.log('Received message:', data);

                switch (data.event) {
                    case 'media':
                        if (openAiWs.readyState === WebSocket.OPEN) {
                            openAiWs.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: data.media.payload }));
                        }
                        break;
                    default:
                        console.log('Unknown event type:', data.event);
                        break;
                }
            } catch (err) {
                console.error('Error handling message:', err);
            }
        });

        connection.on('error', (err) => {
            console.error('WebSocket error from client:', err);
        });

        connection.on('close', (code, reason) => {
            console.log(`Connection closed. Code: ${code}, Reason: ${reason}`);
            clearInterval(interval);
            if (openAiWs.readyState === WebSocket.OPEN) {
                openAiWs.close(1000, 'Connection closed by server');
            }
        });

        openAiWs.on('open', () => {
            console.log('Connected to OpenAI WebSocket.');
            initializeSession();
        });

        openAiWs.on('error', (err) => {
            console.error('OpenAI WebSocket error:', err);
        });

        openAiWs.on('close', (code, reason) => {
            console.log(`OpenAI WebSocket closed. Code: ${code}, Reason: ${reason}`);
        });
    });
}
