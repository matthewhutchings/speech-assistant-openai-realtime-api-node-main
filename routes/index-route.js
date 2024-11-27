export default async function indexRoute(fastify) {
    fastify.get('/', async (request, reply) => {
        try {
            reply.send({
                status: 'ok',
                message: 'Twilio Media Stream Server is running!',
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            console.error('Error in index route:', error);
            reply.status(500).send({ error: 'An error occurred.' });
        }
    });
}
