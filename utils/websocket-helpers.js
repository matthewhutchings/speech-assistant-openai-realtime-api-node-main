import WebSocket from 'ws';
import { OPENAI_API_KEY } from '../config/environment.js';

// Utility function to get current timestamp for logs
const getTimestamp = () => new Date().toISOString();

// Function to send the initial conversation item
export function sendInitialConversationItem(openAiWs) {
    if (openAiWs.readyState === WebSocket.OPEN) {
        console.log(`[${getTimestamp()}] WebSocket connection is open. Preparing to send initial conversation item to OpenAI...`);

        const initialConversationItem = {
            type: 'conversation.item.create',
            item: {
                type: 'message',
                role: 'user',
                content: [
                    {
                        type: 'input_text',
                        text: 'Hello! How can I assist you today?',
                    },
                ],
            },
        };

        try {
            console.log(`[${getTimestamp()}] Initial conversation item payload:`, JSON.stringify(initialConversationItem, null, 2));

            // Send the initial conversation item
            openAiWs.send(JSON.stringify(initialConversationItem));
            console.log(`[${getTimestamp()}] Initial conversation item sent successfully.`);

            // Optionally request a response
            const responseRequest = { type: 'response.create' };
            console.log(`[${getTimestamp()}] Requesting response from OpenAI:`, JSON.stringify(responseRequest, null, 2));
            openAiWs.send(JSON.stringify(responseRequest));
            console.log(`[${getTimestamp()}] Response request sent successfully.`);
        } catch (error) {
            console.error(`[${getTimestamp()}] Error sending initial conversation item or response request:`, error.message);
            console.error(`[${getTimestamp()}] Stack trace:`, error.stack);
        }
    } else {
        console.error(
            `[${getTimestamp()}] Failed to send initial conversation item. OpenAI WebSocket is not open. Current readyState: ${openAiWs.readyState}`
        );
    }
}

// Function to handle WebSocket connection
export function handleWebSocketConnection(connection, req, SYSTEM_MESSAGE, VOICE) {
    console.log(`[${getTimestamp()}] Handling WebSocket connection with client...`);

    let streamSid = null;
    let latestMediaTimestamp = 0;
    let lastAssistantItem = null;
    let markQueue = [];
    let responseStartTimestampTwilio = null;

    // OpenAI WebSocket
    const openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
        headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'OpenAI-Beta': 'realtime=v1',
        },
    });

    // Initialize OpenAI session
    const initializeOpenAiSession = () => {
        const sessionUpdate = {
            type: 'session.update',
            session: {
                turn_detection: { type: 'server_vad' },
                input_audio_format: 'g711_ulaw',
                output_audio_format: 'g711_ulaw',
                voice: VOICE,
                instructions: "test",
                modalities: ['text', 'audio'],
                temperature: 0.8,
            },
        };

        console.log(`[${getTimestamp()}] Preparing to initialize OpenAI session.`);
        console.log(`[${getTimestamp()}] Session Update Payload:`, JSON.stringify(sessionUpdate, null, 2));

        try {
            openAiWs.send(JSON.stringify(sessionUpdate));
            console.log(`[${getTimestamp()}] Session update sent to OpenAI.`);
            sendInitialConversationItem(openAiWs);
        } catch (error) {
            console.error(`[${getTimestamp()}] Error during OpenAI session initialization:`, error.message);
        }
    };

    // Listen for OpenAI WebSocket messages
    openAiWs.on('message', (data) => {
        console.log(`[${getTimestamp()}] Message received from OpenAI:`, data);

        try {
            const response = JSON.parse(data);

            if (response.type === 'response.audio.delta' && response.delta) {
                console.log(`[${getTimestamp()}] Processing audio delta from OpenAI...`);
                const audioDelta = {
                    event: 'media',
                    streamSid,
                    media: { payload: Buffer.from(response.delta, 'base64').toString('base64') },
                };
                connection.send(JSON.stringify(audioDelta));
                console.log(`[${getTimestamp()}] Audio delta sent to client.`);

                if (!responseStartTimestampTwilio) {
                    responseStartTimestampTwilio = latestMediaTimestamp;
                    console.log(`[${getTimestamp()}] Response start timestamp set: ${responseStartTimestampTwilio}`);
                }

                if (response.item_id) {
                    lastAssistantItem = response.item_id;
                    console.log(`[${getTimestamp()}] Last assistant item updated: ${lastAssistantItem}`);
                }
            }

            if (response.type === 'input_audio_buffer.speech_started') {
                console.log(`[${getTimestamp()}] Speech started event detected.`);
                handleSpeechStartedEvent(connection, latestMediaTimestamp, responseStartTimestampTwilio, lastAssistantItem, markQueue, openAiWs);
            }
        } catch (error) {
            console.error(`[${getTimestamp()}] Error processing OpenAI message:`, error.message);
        }
    });

    // Handle OpenAI WebSocket events
    openAiWs.on('open', () => {
        console.log(`[${getTimestamp()}] Connected to OpenAI Realtime API.`);
        initializeOpenAiSession();
    });

    openAiWs.on('close', (code, reason) => {
        console.log(`[${getTimestamp()}] Disconnected from OpenAI Realtime API. Code: ${code}, Reason: ${reason}`);
    });

    openAiWs.on('error', (error) => {
        console.error(`[${getTimestamp()}] Error in OpenAI WebSocket:`, error.message);
    });

    // Handle client WebSocket events
    connection.on('message', (message) => {
        console.log(`[${getTimestamp()}] Message received from client:`, message);

        try {
            const data = JSON.parse(message);

            if (data.event === 'media') {
                latestMediaTimestamp = data.media.timestamp;
                console.log(`[${getTimestamp()}] Received media timestamp: ${latestMediaTimestamp}`);

                if (openAiWs.readyState === WebSocket.OPEN) {
                    const audioAppend = {
                        type: 'input_audio_buffer.append',
                        audio: data.media.payload,
                    };
                    openAiWs.send(JSON.stringify(audioAppend));
                    console.log(`[${getTimestamp()}] Media payload sent to OpenAI.`);
                }
            }

            if (data.event === 'start') {
                streamSid = data.start.streamSid;
                console.log(`[${getTimestamp()}] Stream started with SID: ${streamSid}`);
                responseStartTimestampTwilio = null;
                latestMediaTimestamp = 0;
                console.log(`[${getTimestamp()}] Media timestamp and response start timestamp reset.`);
            }
        } catch (error) {
            console.error(`[${getTimestamp()}] Error parsing client message:`, error.message);
        }
    });

    connection.on('close', () => {
        console.log(`[${getTimestamp()}] Client WebSocket disconnected.`);
        if (openAiWs.readyState === WebSocket.OPEN) {
            openAiWs.close();
            console.log(`[${getTimestamp()}] OpenAI WebSocket closed.`);
        }
    });

    connection.on('error', (error) => {
        console.error(`[${getTimestamp()}] Client WebSocket error:`, error.message);
    });
}
