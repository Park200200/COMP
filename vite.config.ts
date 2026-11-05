import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react-swc'
import basicSsl from '@vitejs/plugin-basic-ssl'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

// ── 이미지 업로드 플러그인 ──
// POST /api/upload-image  { data: "data:image/jpeg;base64,..." }
// → public/local-images/img-xxx.jpg 저장 → { path: "/local-images/img-xxx.jpg" } 반환
function imageUploadPlugin(): Plugin {
  const IMAGE_DIR = path.resolve(__dirname, 'public/local-images');

  return {
    name: 'local-image-upload',
    configureServer(server) {
      // 이미지 업로드 엔드포인트
      server.middlewares.use('/api/upload-image', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method Not Allowed' }));
          return;
        }

        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const { data } = JSON.parse(body);
            if (!data || !data.startsWith('data:image')) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Invalid image data' }));
              return;
            }

            // data:image/jpeg;base64,/9j/4AAQ... → 바이너리 추출
            const matches = data.match(/^data:image\/(\w+);base64,(.+)$/);
            if (!matches) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Invalid base64 format' }));
              return;
            }

            const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
            const buffer = Buffer.from(matches[2], 'base64');
            const hash = crypto.createHash('md5').update(buffer).digest('hex').slice(0, 10);
            const filename = `img-${Date.now()}-${hash}.${ext}`;

            // 폴더 확인 & 저장
            if (!fs.existsSync(IMAGE_DIR)) {
              fs.mkdirSync(IMAGE_DIR, { recursive: true });
            }
            fs.writeFileSync(path.join(IMAGE_DIR, filename), buffer);

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ path: `/local-images/${filename}` }));
          } catch (err) {
            console.error('[image-upload] Error:', err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Upload failed' }));
          }
        });
      });

      // 저장된 로컬 이미지 목록 엔드포인트
      server.middlewares.use('/api/list-local-images', (req, res) => {
        try {
          if (!fs.existsSync(IMAGE_DIR)) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ files: [] }));
            return;
          }
          const files = fs.readdirSync(IMAGE_DIR);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ files }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Failed to list images' }));
        }
      });

      // 일괄 마이그레이션 엔드포인트 (IndexedDB base64 → 파일)
      server.middlewares.use('/api/migrate-images', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method Not Allowed' }));
          return;
        }

        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const { images } = JSON.parse(body); // { atomId: base64 }
            if (!images || typeof images !== 'object') {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Invalid images data' }));
              return;
            }

            if (!fs.existsSync(IMAGE_DIR)) {
              fs.mkdirSync(IMAGE_DIR, { recursive: true });
            }

            const result: Record<string, string> = {}; // atomId → path
            for (const [atomId, data] of Object.entries(images)) {
              if (typeof data !== 'string' || !data.startsWith('data:image')) continue;
              const matches = (data as string).match(/^data:image\/(\w+);base64,(.+)$/);
              if (!matches) continue;

              const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
              const buffer = Buffer.from(matches[2], 'base64');
              const hash = crypto.createHash('md5').update(buffer).digest('hex').slice(0, 10);
              const filename = `img-${atomId.replace(/[^a-zA-Z0-9-_]/g, '')}-${hash}.${ext}`;

              fs.writeFileSync(path.join(IMAGE_DIR, filename), buffer);
              result[atomId] = `/local-images/${filename}`;
            }

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ migrated: result }));
          } catch (err) {
            console.error('[migrate-images] Error:', err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Migration failed' }));
          }
        });
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl(), imageUploadPlugin()],
})
