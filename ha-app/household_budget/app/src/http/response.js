export function redirect(res, location) {
  const target = withIngressPath(res, location);
  if (typeof res.redirect === 'function') {
    res.redirect(303, target);
    return;
  }
  res.writeHead(303, { Location: target });
  res.end();
}

export function html(res, body, status = 200) {
  const payload = rewriteHtmlForIngress(res, body);
  if (typeof res.status === 'function') {
    res
      .status(status)
      .type('html')
      .send(payload);
    return;
  }
  const frameAncestors = res.locals?.ingressPath ? "'self'" : "'none'";
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': `default-src 'self'; style-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors ${frameAncestors}`,
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(payload);
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

export function json(res, body, status = 200) {
  const payload = JSON.stringify(body);
  if (typeof res.status === 'function') {
    res
      .status(status)
      .type('json')
      .send(payload);
    return;
  }
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(payload);
}

export function notFound(res) {
  html(res, '<h1>Not found</h1>', 404);
}

export function ingressPathForResponse(res) {
  const base = String(res?.locals?.ingressPath || '').trim();
  if (!base || base === '/') return '';
  return `/${base.replace(/^\/+|\/+$/g, '')}`;
}

export function withIngressPath(res, location) {
  const base = ingressPathForResponse(res);
  const target = String(location || '/');
  if (!base || !target.startsWith('/')) return target;
  if (target === base || target.startsWith(`${base}/`)) return target;
  return `${base}${target}`;
}

function rewriteHtmlForIngress(res, body) {
  const base = ingressPathForResponse(res);
  if (!base) return body;
  const payload = String(body)
    .replaceAll('href="/', `href="${base}/`)
    .replaceAll('src="/', `src="${base}/`)
    .replaceAll('action="/', `action="${base}/`);
  return payload.replace('<body>', `<body data-app-base-path="${escapeAttribute(base)}">`);
}

function escapeAttribute(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
