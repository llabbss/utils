/**
 * 基于axios的文件上传器
 * 使用到了axios的简易封装，其实不用也可以，直接使用axios
 */
import request from "./request";
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
  }
  /**
   * 设置文件状态
   * @param {string} fileId 文件id
   * @param {string} status 状态
   */
  setStatus(fileId, status) {
    this.eventEmitter.emit("status", {
      fileId: fileId,
      status: status,
    });
  }
  /**
   * 添加文件到上传队列
   * @param {Object} fileInfo 文件信息
   */
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
  /**
   * 暴露给外部的方法
   */
  startUpload() {
    this.maxConcurrent = 1;
    if (this.activeUploads.size >= this.maxConcurrent || this.cancelUploads.size >= this.maxConcurrent) {
      return;
    }
    this.processQueue();
  }
  /**
   * 处理上传队列
   */
  processQueue() {
    if (this.activeUploads.size >= this.maxConcurrent) {
      return;
    }
    while (
      this.uploadQueue.length > 0 &&
      (this.activeUploads.size < this.maxConcurrent)
    ) {
      // 取队列中的第一个文件
      const fileInfo = this.uploadQueue.shift();
      if (!fileInfo || fileInfo.status === "completed") {
        continue;
      }
      // 如果文件正在上传或已取消，则将文件重新添加到队列中
      if (this.activeUploads.has(fileInfo.id) || this.cancelUploads.has(fileInfo.id)) {
        this.uploadQueue.push(fileInfo);
        continue;
      }
      // 如果文件已暂停，则将文件从暂停数组中删除
      if (this.pausedFiles.has(fileInfo.id)) {
        this.pausedFiles.delete(fileInfo.id);
      }
      // 找到下一个未上传的文件
      const idx = this.files.findIndex((f) => f.id === fileInfo.id);
      const nextFile = this.files.find(
        (f, index) => index > idx && f.status === "pending"
      );
      nextFile && this.eventEmitter.emit("nextFile", nextFile);
      this.setStatus(fileInfo.id, "uploading");
      this.uploadFile(fileInfo);
      break;
    }
  }
  /**
   * 设置文件进度
   * @param {string} fileId 文件id
   * @param {number} progress 进度
   */
  setProgress(fileId, progress) {
    this.eventEmitter.emit("progress", {
      fileId: fileId,
      progress: progress,
    });
  }
  /**
   * 上传文件
   * @param {Object} fileInfo 文件信息
   */
  async uploadFile(fileInfo) {
    // NOTE: 此处做了兼容处理，如果axios版本大于1.0.0，则使用axios的CancelToken，否则使用AbortController
    // 创建一个AbortController对象，用于取消上传
    const controller = new AbortController();
    this.activeUploads.set(fileInfo.id, controller);
    const CancelToken = Axios.CancelToken;
    const cancel = CancelToken.source();
    this.cancelUploads.set(fileInfo.id, cancel)
    try {
      if (!this.uploadTarget) {
        throw new Error("error: uploadTarget is necessary");
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

          this.setProgress(fileInfo.id, progress);
        },
      });
      if (response && response.md5) {
        this.setStatus(fileInfo.id, "completed");
        this.eventEmitter.emit("uploadSuccess", {
          file: fileInfo,
          result: response,
        });
        // 找到下一个未上传的文件准备上传
        const nextFile = this.files.find(
          (file) =>
            (file.status === "pending" || file.status === "paused") &&
            (!this.activeUploads.has(file.id) || !this.cancelUploads.has(file.id)) &&
            !this.pausedFiles.has(file.id)
        );
        if (nextFile) {
          this.setStatus(nextFile.id, "pending");
          this.eventEmitter.emit("nextFile", nextFile);
          this.addFile(nextFile);
          this.processQueue();
        } else {
          if (this.pausedFiles.size > 0) {
            this.pausedFiles.forEach((fileId) => {
              this.resumeUpload(fileId);
            });
          }
        }
      }
      if (response.code === "ERR_NETWORK") {
        this.setStatus(fileInfo.id, "error");
      }
    } catch (error) {
      // 错误处理
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
  /**
   * 暂停上传
   * @param {string} fileId 文件id
   * @param {boolean} skipProcessQueue 是否跳过队列
   */
  pauseUpload(fileId, skipProcessQueue = false) {
    const controller = this.activeUploads.get(fileId);
    const cancel = this.cancelUploads.get(fileId)
    const file = this.files.find((f) => f.id === fileId);
    if (file.progress === 100) {
      return;
    }
    if (cancel) {
      cancel.cancel({ ignore: true })
      this.cancelUploads.delete(fileId);
    }
    if (controller) {
      controller.abort();
      this.activeUploads.delete(fileId);
    }
    if (!cancel && !controller) return;
    this.pausedFiles.add(fileId);
    this.setStatus(fileId, "paused");
    const nextFile = this.files.find(
      (file) =>
        file.status === "pending" &&
        (!this.activeUploads.has(file.id) || !this.cancelUploads.has(file.id)) &&
        !this.pausedFiles.has(file.id)
    );

    if (nextFile) {
      this.eventEmitter.emit('nextFile', nextFile)
      this.setStatus(nextFile.id, "pending");
      if (skipProcessQueue) {
        return;
      }
      this.addFile(nextFile);
      this.processQueue();
    }
  }

  /**
   * 恢复上传
   * @param {string} fileId 文件id
   */
  resumeUpload(fileId) {
    if (this.activeUploads.has(fileId) || this.cancelUploads.has(fileId)) {
      return;
    }
    this.pausedFiles.delete(fileId);
    const file = this.files.find((f) => f.id === fileId);
    const uploadingFile = this.files.find((f) => f.status === 'uploading');
    uploadingFile && this.pauseUpload(uploadingFile.id, true);
    if (file) {
      this.uploadQueue.push(file);
      this.uploadFile(file);
      this.setStatus(file.id, 'uploading')
    }
  }
  /**
   * 清空上传队列
   */
  clearUploadQueue() {
    this.uploadQueue = [];
  }
  /**
   * 暂停所有上传
   */
  pauseAll() {
    for (const [fileId] of this.activeUploads) {
      this.pauseUpload(fileId);
    }
    for (const [fileId] of this.cancelUploads) {
      this.pauseUpload(fileId)
    }
  }
}
