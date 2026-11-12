'use strict';
// Socket.io: تحديث لوحات التحكم لحظياً بدون إعادة تحميل الصفحة
// الغرف: "admins" للإدارة العليا، و "tenant:{id}" لكل مجمع
const { Server } = require('socket.io');
const { usersFromCookieHeader } = require('./services/auth');

let io = null;

function attach(httpServer) {
  io = new Server(httpServer, { path: '/socket.io', serveClient: false, cors: { origin: false } });
  io.use(async (socket, next) => {
    try {
      // portal=app لوحة العميل، وإلا لوحة الإدارة
      const { admin, tenant } = await usersFromCookieHeader(socket.handshake.headers.cookie);
      const user = socket.handshake.query?.portal === 'app' ? tenant : admin;
      if (!user) return next(new Error('unauthorized'));
      socket.data.user = user;
      next();
    } catch (e) {
      next(e);
    }
  });
  io.on('connection', (socket) => {
    const u = socket.data.user;
    socket.join(u.role === 'super_admin' ? 'admins' : `tenant:${u.tenant_id}`);
  });
  return io;
}

// يرسل الحدث للإدارة العليا دائماً، وللمجمع المعني إن وجد
function emit(event, data, tenantId) {
  if (!io) return;
  io.to('admins').emit(event, data);
  if (tenantId) io.to(`tenant:${tenantId}`).emit(event, data);
}

function emitAdmins(event, data) {
  io?.to('admins').emit(event, data);
}

module.exports = { attach, emit, emitAdmins };
