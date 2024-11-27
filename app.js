import fastifyCors from '@fastify/cors';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';
import Fastify from 'fastify';
import incomingCallRoutes from './routes/incoming-call.js';
import makeCallRoutes from './routes/make-call.js';
import websocketRoutes from './routes/websocket.js';

const fastify = Fastify();

// Register plugins
fastify.register(fastifyCors, {
    origin: ['https://whatsapp.test', 'https://ai.fewzen.com'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
});
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

// Register routes
fastify.register(incomingCallRoutes);
fastify.register(makeCallRoutes);
fastify.register(websocketRoutes);

export default fastify;
