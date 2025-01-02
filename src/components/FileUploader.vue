<template>
    <transition name="fade-transform" mode="out-in">
        <div class="file-uploader" v-show="isShow">
            <div class="dialog-header">
                <div class="file-uploader-title">文件列表</div>
                <div class="btns">
                    <span class="dot" title="关闭" @click="closeUploader">
                        <i class="el-icon-close"></i>
                    </span>
                    <span class="dot" title="展开" @click="collapseUploader">
                        <i class="el-icon-minus"></i>
                    </span>
                </div>
            </div>
            <el-alert
                title="正在上传，上传过程中请勿全局刷新页面，请耐心等待..."
                type="warning"
                show-icon
                v-if="!isCompleted"
            />
            <el-card class="upload-card">
                <div class="control-panel">
                    <el-button
                        type="primary"
                        @click="startSelectedUploads"
                        :disabled="selectedFiles.length === 0"
                        size="mini"
                    >
                        开始上传
                    </el-button>
                </div>
                <el-table
                    :data="files"
                    style="width: 100%"
                    @selection-change="handleSelectionChange"
                    ref="uploadTable"
                    height="350"
                    scrollbar-always-on
                >
                    <el-table-column
                        type="selection"
                        width="55"
                        :selectable="canSelect"
                    />
                    <el-table-column label="文件名" width="100">
                        <template slot-scope="scope">
                            <el-tooltip
                                class="item"
                                effect="dark"
                                :content="scope.row.originalName"
                                placement="top"
                            >
                                <div class="uploader-file-name">
                                    <!-- <i class="uploader-file-icon"></i> -->
                                    {{ scope.row.originalName }}
                                </div>
                            </el-tooltip>
                        </template>
                    </el-table-column>
                    <el-table-column prop="size" label="大小" width="100">
                        <template slot-scope="scope">
                            {{ formatSize(scope.row.size) }}
                        </template>
                    </el-table-column>
                    <el-table-column label="进度" width="80">
                        <template slot-scope="scope">
                            <!-- <el-progress :percentage="scope.row.progress" /> -->
                            {{
                                scope.row.progress === 0
                                    ? "0%"
                                    : scope.row.progress + "%"
                            }}
                        </template>
                    </el-table-column>
                    <el-table-column prop="status" label="状态" width="80">
                        <template slot-scope="scope">
                            <el-tag :type="getStatusType(scope.row.status)">
                                {{ getStatusText(scope.row.status) }}
                            </el-tag>
                        </template>
                    </el-table-column>
                    <el-table-column label="操作" width="120">
                        <template slot-scope="scope">
                            <el-button
                                v-if="scope.row.status === 'uploading'"
                                type="warning"
                                size="mini"
                                @click="pauseUpload(scope.row)"
                            >
                                暂停
                            </el-button>
                            <el-button
                                v-if="scope.row.status === 'paused'"
                                type="primary"
                                size="mini"
                                @click="resumeUpload(scope.row)"
                            >
                                继续
                            </el-button>
                            <el-button
                                v-if="scope.row.status === 'error'"
                                type="danger"
                                size="mini"
                                @click="retryUpload(scope.row)"
                            >
                                重试
                            </el-button>
                        </template>
                    </el-table-column>
                </el-table>

                <div class="upload-footer">
                    <input
                        type="file"
                        ref="fileInput"
                        @change="handleFileSelect"
                        multiple
                        style="display: none"
                    />
                </div>
            </el-card>
        </div>
    </transition>
</template>

<script>
const url = `${process.env.VUE_APP_URL}/${new Date().getFullYear()}/${
    new Date().getMonth() + 1
}/${new Date().getDate()}`;
import { FileUploader } from "../utils/FileUploader";
import { EventEmitter } from "../utils/EventEmitter";
import Bus from "../utils/bus";

export default {
    name: "FileUploader",
    props: {
        autoStart: {
            type: Boolean,
            default: true,
        },
        isSlice: {
            type: Boolean,
            default: false,
        },
        params: {
            type: Object,
        },
    },
    data() {
        return {
            isShow: false,
            maxConcurrent: 1,
            files: [],
            eventEmitter: new EventEmitter(),
            uploadManager: null,
            tableSelection: [],
            selectedRowKeys: [],
            errorFiles: new Map(),
            extraParams: null,
            uploadUrl: null,
            isCompleted: false,
        };
    },
    computed: {
        selectedFiles() {
            return this.tableSelection;
        },
        uploadingFiles() {
            return this.files.filter((file) => file.status === "uploading");
        },
    },

    created() {
        // TODO: 这里需要判断是更新还是新增
        // TODO: 上传接口还没处理好，需要处理，另外上传的文件之前一堆逻辑，得看看
        // 这里注入的逻辑还没判断
        Bus.$on("filesReach", ({ fileList, subTypeFlag, isSlice, params }) => {
            this.subTypeFlag = subTypeFlag;
            this.extraParams = params;
            this.addExternalFiles(fileList);
            this.isShow = true;
            this.uploadManager = new FileUploader(
                this.eventEmitter,
                this.files,
                this.uploadUrl
            );
            this.initEventListeners();
            this.uploadUrl = `${
                process.env.VUE_APP_URL
            }/${new Date().getFullYear()}/${
                new Date().getMonth() + 1
            }/${new Date().getDate()}?cmd=${isSlice ? "m3u8" : "upload"}`;
        });
    },
    methods: {
        closeUploader() {
            this.$emit("close");
        },
        collapseUploader() {
            this.$emit("collapse");
        },
        // 上传事件监听
        initEventListeners() {
            this.eventEmitter.on("progress", ({ fileId, progress }) => {
                const file = this.files.find((f) => f.id === fileId);
                if (file) {
                    file.progress = progress;
                }
            });

            this.eventEmitter.on("status", ({ fileId, status }) => {
                const file = this.files.find((f) => f.id === fileId);
                if (file) {
                    file.status = status;
                }
            });

            this.eventEmitter.on("uploadError", ({ file, error }) => {
                this.errorFiles.set(file.id, {
                    ...file,
                    error: error.message || "上传失败",
                });
                const errorFilesArray = Array.from(this.errorFiles.values());
                this.$emit("upload-error", errorFilesArray);
            });
            this.eventEmitter.on(
                "uploadSuccess",
                ({ file: fileInfo, result }) => {
                    const { file, ...other } = fileInfo || {};
                    const preUrl =
                        this.uploadUrl.indexOf("?cmd=upload") > 0
                            ? this.uploadUrl.split("?cmd=upload")[0]
                            : this.uploadUrl.split("?cmd=m3u8")[0];
                    console.log(fileInfo, "---file");
                    this.injectorMediaUploadVideoInfo({
                        ...other,
                        ...result,
                        url: `${preUrl}/${file.name}`,
                    });
                    if (
                        this.files &&
                        this.files.every((f) => f.status === "completed")
                    ) {
                        this.isCompleted = true;
                    }
                }
            );
        },
        // 注入上传信息
        async injectorMediaUploadVideoInfo(result) {
            const { episode_id } = result;
            let param = {};
            let postUrl = "injector/injectorMediaUploadVideoInfo";
            if (this.typeFlag == "origin") {
                postUrl = "origin/metaVideoUpload";
                param = result;
                param.episode_id = episode_id || null;
            } else {
                if (this.subTypeFlag) {
                    postUrl = "injector/replaceMedia";
                } else {
                    postUrl = "injector/injectorMediaUploadVideoInfo";
                }
                param = result;
                param.episode_id = episode_id || null;
            }
            // const res = await this.$store.dispatch(postUrl, param);
            // if (res && res.code === 0) {
            //     Bus.$emit("getSucceed", {});
            // }
        },
        addExternalFiles(fileList) {
            const newFiles = fileList.map(({ file, ...other }) => {
                return {
                    id: Date.now() + Math.random(),
                    file: file,
                    name: file.name,
                    size: file.size,
                    progress: 0,
                    status: "pending",
                    selected: false,
                    ...other,
                };
            });
            // 避免重复添加相同文件
            const existingFileNames = this.files.map((f) => f.name);
            const uniqueNewFiles = newFiles.filter(
                (f) => !existingFileNames.includes(f.name)
            );
            if (uniqueNewFiles.length) {
                this.files.push(...uniqueNewFiles);
                // 如果设置了自动开始上传，则添加第一个文件到上传队列
                if (this.autoStart && uniqueNewFiles[0]) {
                    this.$nextTick(() => {
                        this.uploadManager = new FileUploader(
                            this.eventEmitter,
                            this.files,
                            this.uploadUrl
                        );
                        this.initEventListeners();
                        this.uploadManager.addFile(uniqueNewFiles[0]);
                        this.uploadManager.startUpload();
                    });
                }
            }
        },
        getEpisode(filename) {
            var numArr = filename.match(/-\s*\d+/g);
            if (!numArr) {
                return "";
            }
            return parseInt(numArr.slice(-1)[0].replace("-", ""));
        },
        handleFileSelect(event) {
            const newFiles = Array.from(event.target.files).map((file) => ({
                id: Date.now() + Math.random(),
                file,
                name: file.name,
                size: file.size,
                progress: 0,
                status: "pending",
                selected: false,
            }));
            this.files.push(...newFiles);
            // 如果设置了自动开始上传，则添加第一个文件到上传队列
            if (this.autoStart && newFiles[0]) {
                this.$nextTick(() => {
                    this.uploadManager = new FileUploader(
                        this.eventEmitter,
                        this.files,
                        this.uploadUrl
                    );
                    this.initEventListeners();
                    this.uploadManager.addFile(newFiles[0]);
                    this.uploadManager.startUpload();
                });
            }
            event.target.value = "";
        },

        startSelectedUploads() {
            // 暂停所有正在上传的文件
            const currentUploading = this.uploadingFiles;
            this.uploadManager.pauseUpload(currentUploading.id);
            // 获取当前选中的文件
            const selectedFiles = this.$refs.uploadTable.selection;

            // 开始上传选中的文件
            selectedFiles.forEach((file) => {
                if (["pending", "paused"].includes(file.status)) {
                    this.clearErrorFile(file.id);
                    this.uploadManager.addFile(file);
                    this.uploadManager.startUpload(this.maxConcurrent);
                }
            });

            // 清空选中状态
            this.$refs.uploadTable.clearSelection();
            this.tableSelection = [];
        },

        pauseUpload(file) {
            this.uploadManager.pauseUpload(file.id);
        },

        resumeUpload(file) {
            this.clearErrorFile(file.id);
            this.uploadManager.resumeUpload(file.id);
            this.uploadManager.startUpload(this.maxConcurrent);
        },

        pauseAllUploads() {
            this.uploadManager.pauseAll();
        },

        canSelect(row) {
            // 只允许选择待上传和已暂停的文件
            if (!["pending", "paused"].includes(row.status)) {
                return false;
            }
            return true;
        },

        formatSize(bytes) {
            const units = ["B", "KB", "MB", "GB"];
            let size = bytes;
            let unitIndex = 0;

            while (size >= 1024 && unitIndex < units.length - 1) {
                size /= 1024;
                unitIndex++;
            }

            return `${size.toFixed(2)} ${units[unitIndex]}`;
        },

        getStatusType(status) {
            const statusMap = {
                pending: "info",
                uploading: "primary",
                paused: "warning",
                completed: "success",
                error: "danger",
            };
            return statusMap[status] || "info";
        },

        getStatusText(status) {
            const statusMap = {
                pending: "待上传",
                uploading: "上传中",
                paused: "已暂停",
                completed: "已完成",
                error: "错误",
            };
            return statusMap[status] || status;
        },

        getProgressStatus(file) {
            if (file.status === "error") return "exception";
            if (file.status === "completed") return "success";
            return "";
        },

        handleSelectionChange(selection) {
            // 接使用表格的选择
            this.tableSelection = [...selection]; // 创建一个新的数组副本
        },

        clearErrorFile(fileId) {
            this.errorFiles.delete(fileId);
            const errorFilesArray = Array.from(this.errorFiles.values());
            this.$emit("upload-error", errorFilesArray);
        },

        retryUpload(file) {
            // 清除错误状态
            this.clearErrorFile(file.id);
            // 重置文件状态为待上传
            file.status = "pending";
            file.progress = 0;
            // 重新添加到上传队列
            this.uploadManager.addFile(file);
            this.uploadManager.startUpload(this.maxConcurrent);
        },
    },
};
</script>

<style scoped>
.file-uploader {
    position: fixed;
    z-index: 20;
    right: 15px;
    bottom: 15px;
    background-color: #fefefe;
    /* border: 1px solid #e0e0e0; */
    border-radius: 10px;
    box-shadow: 0 0 10px 0 rgba(0, 0, 0, 0.1);
    transition: all 0.2s cubic-bezier(0.7, 0.3, 0.1, 1);
    /* transform: translateY(115%); */
    -moz-user-select: none; /*火狐*/
    -webkit-user-select: none; /*webkit浏览器*/
    -ms-user-select: none; /*IE10*/
    -khtml-user-select: none; /*早期浏览器*/
    user-select: none;
}
.dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-right: 15px;
    .btns {
        display: flex;
        align-items: center;
        .dot {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            cursor: pointer;
        }
    }
}
.file-uploader-title {
    padding: 10px 20px;
    font-size: 16px;
    font-weight: bold;
}
.el-alert {
    position: sticky;
    top: 0;
    left: 0;
    width: 100%;
    z-index: 100;
}
.upload-card {
    max-height: 550px;
    overflow-y: auto;
    position: sticky;
    top: 0;
    left: 0;
    z-index: 100;
    margin-top: 0;
    &.is-always-shadow {
        box-shadow: none;
        border: none;
    }
}

.control-panel {
    margin-bottom: 10px;
}
.uploader-file-name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-indent: 14px;
    flex: 1 0 50%;
}
.upload-footer {
    margin-top: 20px;
    text-align: center;
}

.el-progress {
    margin-right: 20px;
}
</style>
