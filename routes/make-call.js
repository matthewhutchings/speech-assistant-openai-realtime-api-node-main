import { WEBSOCKET_HOST } from '../config/environment.js';
import { twilioClient } from '../services/twilio-client.js';

export default async function makeCallRoutes(fastify) {
    fastify.post('/make-call', async (request, reply) => {
        const { phoneNumber: to, twilioNumber: from } = request.body;

        if (!to || !from) {
            reply.status(400).send({ error: 'Both "to" and "from" phone numbers are required.' });
            return;
        }

        if (typeof to !== 'string' || typeof from !== 'string') {
            reply.status(400).send({ error: 'Both "to" and "from" phone numbers must be strings.' });
            return;
        }

        console.log(`Making call from ${from} to ${to}`);

        try {

            const call = await twilioClient.calls.create({
                to,
                from,
                url: `https://${WEBSOCKET_HOST}/incoming-call?direction=outgoing}`,
            });
            console.log(`Call initiated successfully: ${call.sid}`);
            reply.send({ message: 'Call initiated successfully', callSid: call.sid });
        } catch (error) {
            console.error('Twilio makeCall error:', error);
            reply.status(500).send({ error: `Failed to make call with Twilio. ${error.message}` });
        }
    });
}
