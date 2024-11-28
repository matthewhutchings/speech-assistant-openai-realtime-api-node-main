import WebSocket from 'ws';
import { getProfileInfo } from '../services/profile-service.js';
import { sendInitialConversationItem } from '../utils/websocket-helpers.js';

export default async function incomingCallRoutes(fastify) {
    fastify.all('/incoming-call', async (request, reply) => {
        try {
            const phoneNumber = request.body?.To || '';
            const twilioNumber = process.env.TWILIO_PHONE_NUMBER; // Set Twilio number dynamically

            const profileInfo = await getProfileInfo(phoneNumber, twilioNumber);


            let sayMessage = 'Hey - How can I help you?';
            if (profileInfo?.SayMessage) {
                sayMessage = profileInfo.SayMessage;
            }

            const websocketHost = process.env.WEBSOCKET_HOST || request.headers.host;

        // TwiML response with recording and transcription
        const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Record transcribe="true" transcribeCallback="https://node.fewzen.com/transcription-callback" />
    <Connect>
        <Stream url="wss://${websocketHost}/media-stream">
        </Stream>
    </Connect>
</Response>`.trim();

            reply.type('text/xml').send(twimlResponse);
           // console.log("sayMessage:", sayMessage);

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
