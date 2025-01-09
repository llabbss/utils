import request from "@/utils/request";
import Axios from "axios";
export class FileUploader {
    constructor(eventEmitter, files, uploadTarget) {
        this.uploadTarget = uploadTarget;
        this.files = files;
        this.eventEmitter = eventEmitter;
        this.uploadQueue = [];
        this.activeUploads = new Map();
        this.cancelUploads = new Map();
        this.maxConcurrent = 1;
        this.pausedFiles = new Set();
        this.isPaused = false;
    }
    setStatus(fileId, status) {
        this.eventEmitter.emit("status", {
            fileId: fileId,
            status: status,
        });
    }
    // 添加文件到上传队列
    addFile(fileInfo) {
        if (!fileInfo) return;
        if (this.uploadQueue.some((f) => f.id === fileInfo.id)) {
            return;
        }
        if (fileInfo.status === "error") {
            this.uploadQueue = [];
            this.uploadQueue.push(fileInfo);
            this.processQueue();
            return;
        }
        if (this.activeUploads.has(fileInfo.id) || this.cancelUploads.has(fileInfo.id)) {
            this.pauseUpload(fileInfo.id);
        }
        this.pausedFiles.delete(fileInfo.id);
        this.uploadQueue.push(fileInfo);
        if (!this.files.some((f) => f.id === fileInfo.id)) {
            this.files.push(fileInfo);
        }
    }
    // 添加清理方法
    cleanup() {
        // 清理各种 Map 和 Set
        this.activeUploads.clear();
        this.cancelUploads.clear();
        this.pausedFiles.clear();
        this.uploadQueue = [];
        this.filesMap.clear();
    }
    // 暴露给外部的方法
    startUpload() {
        this.maxConcurrent = 1;
        if (this.activeUploads.size >= this.maxConcurrent || this.cancelUploads.size >= this.maxConcurrent) {
            return;
        }
        this.processQueue();
    }
    // 处理上传队列
    processQueue() {
        // 使用更简洁的条件检查
        if (this.activeUploads.size >= this.maxConcurrent || !this.uploadQueue.length) {
            return;
        }

        const fileInfo = this.uploadQueue.shift();
        if (!fileInfo || fileInfo.status === "completed" ||
            this.activeUploads.has(fileInfo.id)) {
            return;
        }
        this.uploadFile(fileInfo);
    }
    setProgress(fileId, progress) {
        this.eventEmitter.emit("progress", {
            fileId: fileId,
            progress: progress,
        });
    }
    cancelUpload(fileId) {
        const cancel = this.cancelUploads.get(fileId);
        const controller = this.activeUploads.get(fileId);
        if (!cancel && !controller) return;
        if (cancel) {
            cancel.cancel({ ignore: true })
            this.cancelUploads.delete(fileId);
        }
        if (controller) {
            controller.abort();
            this.activeUploads.delete(fileId);
        }
    }
    // 上传文件
    async uploadFile(fileInfo) {
        // NOTE: 此处做了兼容处理，如果axios版本大于1.0.0，则使用axios的CancelToken，否则使用AbortController
        const controller = new AbortController();
        this.activeUploads.set(fileInfo.id, controller);
        const CancelToken = Axios.CancelToken;
        const cancel = CancelToken.source();
        this.cancelUploads.set(fileInfo.id, cancel)
        try {
            if (!this.uploadTarget) {
                throw new Error("uploadTarget is necessary");
            }
            const formData = new FormData();
            formData.append("file", fileInfo.file);
            const response = await request.post(this.uploadTarget, formData, {
                cancelToken: cancel.token,
                signal: controller.signal,
                filterErrMesg: true,
                headers: {
                    "Content-Type": "multipart/form-data",
                    Accept: "application/json",
                    "X-Requested-With": "XMLHttpRequest",
                },
                timeout: 0,
                onUploadProgress: (progressEvent) => {
                    const progress = Math.round(
                        (progressEvent.loaded / progressEvent.total) * 100
                    );
                    this.setStatus(fileInfo.id, "uploading");
                    this.setProgress(fileInfo.id, progress);
                },
            });
            if (response && response.md5) {
                this.activeUploads.delete(fileInfo.id);
                this.cancelUploads.delete(fileInfo.id);
                this.setStatus(fileInfo.id, "completed");
                this.eventEmitter.emit("uploadSuccess", {
                    file: fileInfo,
                    result: response,
                });
                this.findNextFileUpload();
            }
        } catch (error) {
            // 处理错误
            if (error.message === "Upload aborted") {
                this.setStatus(fileInfo.id, "paused");
            } else {
                this.setStatus(fileInfo.id, "error");
                this.eventEmitter.emit("uploadError", {
                    file: fileInfo,
                    error: error,
                });
                const nextFile = this.files.find(
                    (file) =>
                        (file.status === "pending" || file.status === "paused") &&
                        (!this.activeUploads.has(file.id) || !this.cancelUploads.has(file.id)) &&
                        !this.pausedFiles.has(file.id)
                );
                if (nextFile) {
                    this.setStatus(nextFile.id, "pending");
                    this.eventEmitter.emit('nextFile', nextFile)
                    this.addFile(nextFile);
                    this.processQueue();
                }
            }
            throw error;
        }
        this.cancelUploads.delete(fileInfo.id)
        this.activeUploads.delete(fileInfo.id);
        if ((this.activeUploads.size === 0 || this.cancelUploads.size === 0) && this.uploadQueue.length > 0) {
            this.processQueue();
        }
    }
    findNextFileUpload() {
        const nextFile = this.files.find(
            (file) => file.status === "pending" &&
                (!this.activeUploads.has(file.id) || !this.cancelUploads.has(file.id)) &&
                !this.pausedFiles.has(file.id)
        );
        if (nextFile) {
            this.eventEmitter.emit('nextFile', nextFile)
            this.setStatus(nextFile.id, "pending");
            this.addFile(nextFile);
            this.processQueue();
        }
    }
    pauseUpload(fileId, skipProcessQueue = false) {
        const file = this.files.find((f) => f.id === fileId);
        if (file.progress === 100) {
            return;
        }
        this.isPaused = true;
        this.cancelUpload(fileId);
        this.pausedFiles.add(fileId);
        this.setStatus(fileId, "paused");
        if (!skipProcessQueue) {
            this.findNextFileUpload();
        }
    }
    // 恢复上传
    resumeUpload(fileId) {
        if (this.activeUploads.has(fileId) || this.cancelUploads.has(fileId)) {
            return;
        }
        this.pausedFiles.delete(fileId);
        const file = this.files.find((f) => f.id === fileId);
        const uploadingFile = this.files.find((f) => f.status === 'uploading');
        uploadingFile && this.pauseUpload(uploadingFile.id, true);
        if (file) {
            // 将文件添加到队列而不是直接上传
            this.uploadQueue.push(file);
            this.uploadFile(file);
            this.setStatus(file.id, 'uploading')
        }
    }
    clearUploadQueue() {
        this.uploadQueue = [];
    }
    pauseAll() {
        // 使用更高效的批量操作
        const pausePromises = [...this.activeUploads.keys()].map(fileId =>
            this.pauseUpload(fileId, true)
        );

        return Promise.all(pausePromises).then(() => {
            this.processQueue();
        });
    }
}
