import { makeCall } from '../services/twilio-service.js';

export default async function makeCallRoutes(fastify) {
    fastify.post('/make-call', async (request, reply) => {
        try {
            // Extract and validate input
            const { phoneNumber, twilioNumber } = request.body;
            if (!phoneNumber || !twilioNumber) {
                return reply.status(400).send({ error: 'Phone number and Twilio number are required.' });
            }

            // Initiate the call
            const callSid = await makeCall(phoneNumber, twilioNumber);

            // Send a successful response
            reply.send({
                message: 'Call initiated successfully',
                callSid,
            });
        } catch (error) {
            console.error('Error initiating call:', error);

            // Respond with an error
            reply.status(500).send({
                error: 'Failed to initiate call.',
                details: error.message, // Optionally include error details for debugging
            });
        }
    });
}
