export function redirect(res, location) {
  if (typeof res.redirect === 'function') {
    res.redirect(303, location);
    return;
  }
  res.writeHead(303, { Location: location });
  res.end();
}

export function html(res, body, status = 200) {
  if (typeof res.status === 'function') {
    res
      .status(status)
      .type('html')
      .send(body);
    return;
  }
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'self'; style-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

export function css(res, body) {
  if (typeof res.type === 'function') {
    res
      .type('css')
      .set('Cache-Control', 'public, max-age=300')
      .send(body);
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'text/css; charset=utf-8',
    'Cache-Control': 'public, max-age=300'
  });
  res.end(body);
}

export function csv(res, filename, body) {
  if (typeof res.attachment === 'function') {
    res.attachment(filename).type('csv').send(body);
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`
  });
  res.end(body);
}

export function notFound(res) {
  html(res, '<h1>Not found</h1>', 404);
}
