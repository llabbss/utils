/*
 * @Author: Oliver
 * @Date: 2024-12-12 15:35:47
 * @LastEditors: Oliver
 * @LastEditTime: 2025-01-02 11:37:32
 * @FilePath: /v2_upload/server/index.js
 */
const Koa = require('koa')
const server = require('koa-static')
const Router = require('koa-router')
const multer = require('@koa/multer')
const cors = require('@koa/cors')
const path = require('path')
const fs = require('fs')

const app = new Koa()

// 配置 cors 中间件
app.use(cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true
}));

app.use(server(__dirname + '/public'))

// 确保上传目录存在
const uploadDir = path.join(__dirname, 'public/upload');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置 multer
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, uploadDir);
        },
        filename: (req, file, cb) => {
            // 直接使用原始文件名
            cb(null, file.originalname);
        }
    }),
    limits: {
        fileSize: 10240 * 1024 * 1024, // 1000MB
        files: 1 // 一次只处理一个文件
    }
});

// 错误处理中间件
app.use(async (ctx, next) => {
    try {
        await next();
    } catch (err) {
        console.error('Request error:', err);
        ctx.status = err.status || 500;
        ctx.body = {
            code: ctx.status,
            msg: err.message || '服务器错误'
        };
    }
});

const router = new Router();

// 上传路由
router.post('/upload', async (ctx) => {
    try {
        const result = await new Promise((resolve, reject) => {
            const uploadMiddleware = upload.single('file');
            
            uploadMiddleware(ctx, () => {})
                .then(() => {
                    const file = ctx.request.file;
                    if (!file) {
                        reject(new Error('没有上传文件'));
                        return;
                    }
                    resolve(file);
                })
                .catch(reject);
        });
        // mock 数据
        ctx.body = {
            "v_codec": "h264",
            "v_profile": "Main",
            "width": 640,
            "height": 360,
            "v_bit_rate": 253758,
            "sample_aspect_ratio": "1:1",
            "display_aspect_ratio": "16:9",
            "seconds": 207,
            "dub": 0,
            "frame_rate": 25,
            "a_codec": "aac",
            "a_channels": 2,
            "a_bit_rate": 64453,
            "a_sample_rate": 44100,
            "bit_rate": 321998,
            "size": 8294673,
            "md5": "623f5df4c2cf3500703c470ac7a21e89"
        };
    } catch (error) {
        console.error('Upload error:', error);
        ctx.body = {
            code: 500,
            msg: error.message || '文件上传失败'
        };
    }
});

app.use(router.routes());
app.use(router.allowedMethods());

// 全局错误处理
app.on('error', (err, ctx) => {
    console.error('Server error:', err);
});

app.listen(3000, () => {
    console.log('服务器运行在 3000 端口');
});