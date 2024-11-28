import { makeCall } from '../services/twilio-service.js';

export default async function makeCallRoutes(fastify) {
    fastify.post('/make-call', async (request, reply) => {
        const { phoneNumber: to, twilioNumber: from, direction } = request.body;
        const callDirection = direction || 'outgoing'; // Default to outgoing if not provided

        // Validate input
        if (!to || !from) {
            reply.status(400).send({ error: 'Both "to" and "from" phone numbers are required.' });
            return;
        }

        if (typeof to !== 'string' || typeof from !== 'string') {
            reply.status(400).send({ error: 'Both "to" and "from" phone numbers must be strings.' });
            return;
        }


                console.log(`Making call from ${from} to ${to} with direction: ${callDirection}`);

        try {
            // Use the service function
            const callSid = await makeCall(to, from, callDirection);
            console.log(`Call initiated successfully: ${callSid}`);
            reply.send({ message: 'Call initiated successfully', callSid });
        } catch (error) {
            console.error('Error in /make-call route:', error);
            reply.status(500).send({ error: error.message });
        }
    });
}
