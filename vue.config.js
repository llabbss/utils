/*
 * @Author: Oliver
 * @Date: 2024-12-16 10:08:43
 * @LastEditors: Oliver
 * @LastEditTime: 2024-12-17 14:35:33
 * @FilePath: /v2_upload/vue.config.js
 */
module.exports = {
    lintOnSave: false,
    devServer: {
        proxy: {
            '/api': {
                target: 'http://your-backend-server.com',
                changeOrigin: true
            },
            '/upload': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                pathRewrite: {
                    '^/upload': '/upload'  // 重写路径
                },
                onError: (err) => {
                    console.log('Proxy error:', err);
                },
                onProxyReq: (proxyReq, req, res) => {
                    // 添加跨域头
                    proxyReq.setHeader('origin', 'http://localhost:3000');
                }
            }
        }
    }
} 