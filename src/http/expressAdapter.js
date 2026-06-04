import multer from 'multer';
import { html } from './response.js';
import { loadSession } from '../middleware/session.js';
import { page } from '../views/html.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1_000_000,
    files: 1,
    fields: 80
  }
});

export function createExpressRouter(app, db) {
  return {
    get(path, handler) {
      app.get(path, wrapHandler(db, handler));
    },
    post(path, handler, options = {}) {
      const middleware = options.fileField ? [upload.single(options.fileField)] : [];
      app.post(path, ...middleware, wrapHandler(db, handler));
    }
  };
}

function wrapHandler(db, handler) {
  return async (req, res, next) => {
    try {
      const ctx = buildContext(db, req, res);

      if (req.method === 'POST' && ctx.user) {
        if (!ctx.body._csrf || ctx.body._csrf !== ctx.csrfToken) {
          return html(
            res,
            page(ctx, {
              title: 'Security check failed',
              body: '<section class="card"><h1>Security check failed</h1><p>Please go back, refresh the page, and try again.</p></section>'
            }),
            403
          );
        }
      }

      return await handler(ctx);
    } catch (error) {
      return next(error);
    }
  };
}

function buildContext(db, req, res) {
  const host = req.get('host') || 'localhost';
  const url = new URL(req.url || '/', `${req.protocol}://${host}`);
  const { user, csrfToken, sessionId } = loadSession(db, req, res);

  return {
    req,
    res,
    db,
    url,
    query: url.searchParams,
    body: req.body || {},
    files: buildFiles(req),
    user,
    csrfToken,
    sessionId,
    secure: Boolean(req.secure || req.get('x-forwarded-proto') === 'https')
  };
}

function buildFiles(req) {
  if (!req.file) return {};
  return {
    [req.file.fieldname]: {
      filename: req.file.originalname,
      content: req.file.buffer.toString('utf8')
    }
  };
}
