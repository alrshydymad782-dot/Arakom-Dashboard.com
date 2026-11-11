'use strict';
// بث الأحداث المباشرة للمتصفح عبر Server-Sent Events (بدون مكتبات)
const clients = new Set();

function subscribe(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  const client = { res, user: req.user };
  clients.add(client);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(client);
  });
}

// يرسل الحدث للمدير دائماً، وللعميل فقط إن كان الحدث يخصه
function publish(type, data, customerId) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) {
    if (c.user.role === 'admin' || (customerId && c.user.customer_id === customerId)) c.res.write(msg);
  }
}

module.exports = { subscribe, publish };
