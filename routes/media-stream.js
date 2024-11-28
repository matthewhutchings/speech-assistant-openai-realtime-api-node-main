import WebSocket from 'ws';
import { OPENAI_API_KEY } from '../config/environment.js'; // Import your environment variables
import { sendInitialConversationItem } from '../utils/websocket-helpers.js'; // Ensure helpers are available

export default async function mediaStreamRoutes(fastify) {
    fastify.get('/media-stream', { websocket: true }, (connection, req) => {
        console.log('Client connected to media stream');

        // Connection-specific state
        let streamSid = null;
        let latestMediaTimestamp = 0;
        let lastAssistantItem = null;
        let markQueue = [];
        let responseStartTimestampTwilio = null;

        // OpenAI WebSocket connection
        const openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
            headers: {
                Authorization: `Bearer ${OPENAI_API_KEY}`,
                "OpenAI-Beta": "realtime=v1",
            },
        });

        // Initialize OpenAI session
        const initializeSession = () => {
            const sessionUpdate = {
                type: 'session.update',
                session: {
                    turn_detection: { type: 'server_vad' },
                    input_audio_format: 'g711_ulaw',
                    output_audio_format: 'g711_ulaw',
                    voice: 'alloy', // Adjust to the desired voice model
                    instructions: 'Default system message.', // Replace with dynamic SYSTEM_MESSAGE if needed
                    modalities: ["text", "audio"],
                    temperature: 0.8,
                },
            };

            console.log('Sending session update:', JSON.stringify(sessionUpdate));
            openAiWs.send(JSON.stringify(sessionUpdate));

            // Send the initial conversation item
            sendInitialConversationItem(openAiWs, "Welcome to the media stream! How can I assist?");
        };

        // Handle incoming Twilio messages
        connection.on('message', (message) => {
            try {
                const data = JSON.parse(message);

                switch (data.event) {
                    case 'media':
                        latestMediaTimestamp = data.media.timestamp;
                        console.log(`Received media with timestamp: ${latestMediaTimestamp}ms`);
                        if (openAiWs.readyState === WebSocket.OPEN) {
                            const audioAppend = {
                                type: 'input_audio_buffer.append',
                                audio: data.media.payload,
                            };
                            openAiWs.send(JSON.stringify(audioAppend));
                        }
                        break;

                    case 'start':
                        streamSid = data.start.streamSid;
                        console.log(`Stream started with SID: ${streamSid}`);
                        responseStartTimestampTwilio = null;
                        latestMediaTimestamp = 0;
                        break;

                    case 'mark':
                        if (markQueue.length > 0) {
                            markQueue.shift();
                        }
                        break;

                    default:
                        console.log('Unknown Twilio event:', data.event);
                        break;
                }
            } catch (error) {
                console.error('Error processing Twilio message:', error);
            }
        });

        // Handle OpenAI WebSocket messages
        openAiWs.on('message', (data) => {
            try {
                const response = JSON.parse(data);

                console.log(`OpenAI event received: ${response.type}`);
                if (response.type === 'response.audio.delta' && response.delta) {
                    const audioDelta = {
                        event: 'media',
                        streamSid,
                        media: {
                            payload: Buffer.from(response.delta, 'base64').toString('base64'),
                        },
                    };
                    connection.send(JSON.stringify(audioDelta));
                }

                if (response.type === 'response.done') {
                    console.log('Response complete');
                }
            } catch (error) {
                console.error('Error processing OpenAI response:', error);
            }
        });

        // Handle connection closures
        connection.on('close', () => {
            if (openAiWs.readyState === WebSocket.OPEN) {
                openAiWs.close();
            }
            console.log('Client disconnected from media stream.');
        });

        // Handle OpenAI WebSocket errors and closures
        openAiWs.on('close', () => console.log('Disconnected from OpenAI WebSocket.'));
        openAiWs.on('error', (error) => console.error('OpenAI WebSocket error:', error));

        // When OpenAI WebSocket connection is established
        openAiWs.on('open', () => {
            console.log('Connected to OpenAI WebSocket.');
            initializeSession();
        });
    });
}
