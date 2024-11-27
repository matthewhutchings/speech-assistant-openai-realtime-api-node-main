import { handleWebSocketConnection } from '../utils/websocket-helpers.js';

export default async function websocketRoutes(fastify) {
    fastify.get('/media-stream', { websocket: true }, (connection, req) => {
        console.log('WebSocket client connected');
        handleWebSocketConnection(connection, req);
    });
}
