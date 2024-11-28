import fastifyCors from '@fastify/cors';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';
import Fastify from 'fastify';

import { PORT } from './config/environment.js';
import incomingCallRoutes from './routes/incoming-call.js';
import indexRoute from './routes/index-route.js';
import makeCallRoutes from './routes/make-call.js';
import mediaStreamRoutes from './routes/media-stream.js';

const fastify = Fastify();

// Register plugins
fastify.register(fastifyCors, {
    origin: ['https://whatsapp.test', 'https://ai.fewzen.com'], // Replace with actual origins
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
});

fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

// Register routes
fastify.register(indexRoute);
fastify.register(incomingCallRoutes);
fastify.register(makeCallRoutes);
fastify.register(mediaStreamRoutes);


// Start the server
fastify.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
    if (err) {
        console.error('Error starting server:', err);
        process.exit(1);
    }
    console.log(`Server is running at ${address}`);
});
