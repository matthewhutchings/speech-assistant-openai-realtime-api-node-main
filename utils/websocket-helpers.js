import WebSocket from 'ws';

export function sendInitialConversationItem(openAiWs) {
    if (openAiWs.readyState === WebSocket.OPEN) {
        console.log('Sending initial conversation item to OpenAI...');

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

        // Send the initial conversation item to OpenAI
        openAiWs.send(JSON.stringify(initialConversationItem));

        // Optionally request a response from OpenAI
        openAiWs.send(JSON.stringify({ type: 'response.create' }));
    } else {
        console.error('OpenAI WebSocket is not open, cannot send initial conversation item.');
    }
}


export function handleWebSocketConnection(connection, req, OPENAI_API_KEY, SYSTEM_MESSAGE, VOICE) {
    console.log('Handling WebSocket connection with client...');

    let streamSid = null;
    let latestMediaTimestamp = 0;
    let lastAssistantItem = null;
    let markQueue = [];
    let responseStartTimestampTwilio = null;

    // Connect to OpenAI's WebSocket API
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
                instructions: SYSTEM_MESSAGE, // Dynamic system message
                modalities: ['text', 'audio'],
                temperature: 0.8,
            },
        };

        console.log('Initializing OpenAI session:', JSON.stringify(sessionUpdate));
        openAiWs.send(JSON.stringify(sessionUpdate));
        sendInitialConversationItem(openAiWs);
    };

    // Listen for OpenAI WebSocket messages
    openAiWs.on('message', (data) => {
        try {
            const response = JSON.parse(data);
            console.log('Message from OpenAI:', response);

            // Process OpenAI response
            if (response.type === 'response.audio.delta' && response.delta) {
                const audioDelta = {
                    event: 'media',
                    streamSid,
                    media: { payload: Buffer.from(response.delta, 'base64').toString('base64') },
                };
                connection.send(JSON.stringify(audioDelta));

                if (!responseStartTimestampTwilio) {
                    responseStartTimestampTwilio = latestMediaTimestamp;
                    console.log(`Start timestamp set: ${responseStartTimestampTwilio}`);
                }

                if (response.item_id) {
                    lastAssistantItem = response.item_id;
                }
            }

            if (response.type === 'input_audio_buffer.speech_started') {
                handleSpeechStartedEvent(connection, latestMediaTimestamp, responseStartTimestampTwilio, lastAssistantItem, markQueue, openAiWs);
            }
        } catch (error) {
            console.error('Error processing OpenAI message:', error);
        }
    });

    // Handle incoming WebSocket messages from the client
    connection.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.event === 'media') {
                latestMediaTimestamp = data.media.timestamp;
                console.log(`Received media timestamp: ${latestMediaTimestamp}`);

                if (openAiWs.readyState === WebSocket.OPEN) {
                    const audioAppend = {
                        type: 'input_audio_buffer.append',
                        audio: data.media.payload,
                    };
                    openAiWs.send(JSON.stringify(audioAppend));
                }
            }

            if (data.event === 'start') {
                streamSid = data.start.streamSid;
                console.log('Stream started with SID:', streamSid);
                responseStartTimestampTwilio = null;
                latestMediaTimestamp = 0;
            }
        } catch (error) {
            console.error('Error parsing client message:', error);
        }
    });

    // Handle OpenAI WebSocket events
    openAiWs.on('open', () => {
        console.log('Connected to OpenAI Realtime API');
        initializeOpenAiSession();
    });

    openAiWs.on('close', () => {
        console.log('Disconnected from OpenAI Realtime API');
    });

    openAiWs.on('error', (error) => {
        console.error('Error in OpenAI WebSocket:', error);
    });

    // Handle connection close
    connection.on('close', () => {
        if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
        console.log('Client disconnected.');
    });

    // Handle connection error
    connection.on('error', (error) => {
        console.error('WebSocket connection error:', error);
    });
}

function handleSpeechStartedEvent(connection, latestMediaTimestamp, responseStartTimestampTwilio, lastAssistantItem, markQueue, openAiWs) {
    if (markQueue.length > 0 && responseStartTimestampTwilio != null) {
        const elapsedTime = latestMediaTimestamp - responseStartTimestampTwilio;
        console.log(`Elapsed time for truncation: ${elapsedTime}ms`);

        if (lastAssistantItem) {
            const truncateEvent = {
                type: 'conversation.item.truncate',
                item_id: lastAssistantItem,
                content_index: 0,
                audio_end_ms: elapsedTime,
            };
            openAiWs.send(JSON.stringify(truncateEvent));
        }

        connection.send(JSON.stringify({ event: 'clear', streamSid: null }));
        markQueue.length = 0;
        lastAssistantItem = null;
        responseStartTimestampTwilio = null;
    }
}
