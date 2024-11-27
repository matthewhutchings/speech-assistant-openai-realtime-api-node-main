import dotenv from 'dotenv';
import fastifyApp from './app.js';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3000;

// Start the Fastify app
fastifyApp.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(`Server is listening on ${address}`);
});
