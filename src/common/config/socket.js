const { Server } = require('socket.io');
const sessionMiddleware = require('./session');

let io;

// Attaches Socket.IO to the same HTTP server Express listens on, reusing the
// exact session middleware from session.js so a socket connection is
// authenticated the same way an HTTP request is - via the connect.sid cookie,
// no separate socket-specific login step.
function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: ['http://localhost:4200', 'https://admin.orviaerp.com'],
      credentials: true,
    },
  });

  io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
  });

  io.use((socket, next) => {
    const userId = socket.request.session?.passport?.user;
    if (!userId) {
      console.warn(`[socket] rejected connection ${socket.id} - no session/passport user found`);
      return next(new Error('unauthorized'));
    }
    socket.userId = userId;
    next();
  });

  io.on('connection', (socket) => {
    // Personal room for "assigned to me" pushes, plus a shared room so
    // anyone with the inbox open sees every new/reassigned conversation.
    socket.join(`agent:${socket.userId}`);
    socket.join('inbox:all');
    console.log(`[socket] connected ${socket.id} as user ${socket.userId}`);

    socket.on('disconnect', (reason) => {
      console.log(`[socket] disconnected ${socket.id}: ${reason}`);
    });
  });

  io.engine.on('connection_error', (err) => {
    console.error('[socket] engine connection_error:', err.code, err.message, err.context);
  });

  return io;
}

function getIO() {
  if (!io) {
    throw new Error('Socket.io has not been initialized - call initSocket(server) first.');
  }
  return io;
}

module.exports = { initSocket, getIO };
