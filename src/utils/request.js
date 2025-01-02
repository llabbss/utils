/**
 * 简易axios的请求封装
 */
import axios from 'axios'

const pending = new Map()
let formData;
/**
 * 添加请求
 * @param {Object} config
 */
const addPending = (config) => {
    const url = [
        config.method,
        config.url,
        JSON.stringify(config.params),
        JSON.stringify(config.data),
    ].join('&')
    config.cancelToken = config.cancelToken || new axios.CancelToken(cancel => {
        if (!pending.has(url)) { // 如果 pending 中不存在当前请求，则添加进去
            pending.set(url, cancel)
        }
    })
}
/**
 * 移除请求
 * @param {Object} config
 */
const removePending = (config) => {
    const url = [
        config.method,
        config.url,
        JSON.stringify(config.params),
        JSON.stringify(config.data)
    ].join('&')
    // 如果在 pending 中存在当前请求标识，需要取消当前请求，并且移除   
    if (pending.has(url)) { 
        const cancel = pending.get(url)
        cancel({ code: 1000000, message: '取消了' })
        pending.delete(url)
    }
}
/**
 * 清空 pending 中的请求（在路由跳转时调用）
 */
export const clearPending = () => {
    for (const [url, cancel] of pending) {
        // cancel(url)
        cancel({ code: 1000000, message: '取消了', url })
    }
    pending.clear()
}

const service = axios.create({
    baseURL: process.env.VUE_APP_BASE_API,
    timeout: 10000
})

// 请求拦截器
service.interceptors.request.use(
    config => {
        removePending(config)
        addPending(config)
        if (config.onUploadProgress) {
            config.uploadProgress = (event) => {
                const progress = (event.loaded / event.total) * 100
                if (typeof config.onUploadProgress === 'function') {
                    config.onUploadProgress(progress)
                }
            }
        }
        const sid = '', uid = 0;
        if (config.method === 'post' && config.form_data) {
            formData = new FormData(); const obj = Object.assign({ sid, uid }, config.data);
            for (const key in obj) {
                if (obj[key] !== undefined && obj[key] !== null) {
                    formData.append(key, obj[key]);
                }
            }
            config.data = formData
        } else if (config.method === 'post') {
            config.params = Object.assign({ sid, uid }, config.params)
        }
        if (config.method === 'get') {
            config.params = Object.assign({ sid, uid }, config.params)
        }
        if (config.method === 'delete') {
            config.params = Object.assign({ sid, uid }, config.params)
        }
        if (config.loading) {
            // store.dispatch('loading/setshowloading', true)
        }

        // if (store.getters.token) {
        //     // let each request carry token
        //     // ['X-Token'] is a custom headers key
        //     // please modify it according to the actual situation
        //     config.headers['X-Token'] = getToken()
        // }
        return config
    },
    error => {
        // do something with request error
        console.log(error) // for debug
        return Promise.reject(error)
    }
)

// response interceptor
service.interceptors.response.use(
    /**
     * If you want to get http information such as headers or status
     * Please return  response => response
    */

    /**
     * Determine the request status by custom code
     * Here is just an example
     * You can also judge the status by HTTP Status Code
     */
    response => {
        const res = response.data
        // if the custom code is not 20000, it is judged as an error.
        // store.dispatch('loading/setshowloading', false)
        if (res.code !== 0 && res.code !== undefined) {
            if (!response.config.filterErrMesg) {
                // Message({
                //     message: res.desc || 'Error',
                //     type: 'error',
                //     duration: 5 * 1000
                // })
            }
            if (res.code === 6) {
                // store.dispatch('user/resetLogout')
            }
            // return Promise.reject(new Error(res.desc || 'Error'))
        }
        return res
    },
    error => {
        const cancelObj = JSON.parse(JSON.stringify(error.message || {}));
        if (error.code == 'ECONNABORTED' && error.message.indexOf('timeout') != -1) {
            // Message({
            //     message: '请求超时，请重试',
            //     type: 'warning',
            //     duration: 5 * 1000
            // })
            // return Promise.reject(error)
        } else if (cancelObj.code === 1000000) {
            return error
        } else {
            // console.log('err' + error) // for debug
            // Message({
            //     message: error.message,
            //     type: 'error',
            //     duration: 5 * 1000
            // })
            // return Promise.reject(error)
        }
        // return Promise.reject(new Error(error))
        return error
    }
)

export default service
