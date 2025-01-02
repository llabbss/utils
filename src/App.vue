<!--
 * @Author: Oliver
 * @Date: 2024-12-16 10:08:42
 * @LastEditors: Oliver
 * @LastEditTime: 2024-12-20 15:54:25
 * @FilePath: /v2_upload/src/App.vue
-->
<template>
  <div id="app">
    <h1>文件上传示例</h1>
    <!-- 外部文件选择按钮 -->
    <input 
      type="file" 
      multiple 
      @change="handleExternalFileSelect"
      style="margin-bottom: 20px;"
    >
    <!-- 传递选择的文件到上传组件 -->
    <file-uploader 
      :auto-start="true"
      @upload-error="handleUploadError"
    />
    <!-- <QueueUpload
      :auto-start="true"
      :action-url="actionUrl"
      :dispatch="$store.dispatch"
      @upload-error="handleUploadError"
    /> -->
  </div>
</template>

<script>
import FileUploader from './components/FileUploader.vue'
import Bus from './utils/bus'
export default {
  name: 'App',
  components: {
    FileUploader
  },
  
  data() {
    return {
      selectedFiles: null
    }
  },
  methods: {
    handleExternalFileSelect(event) {
      // 将 FileList 转换为数组
      console.log(Array.from(event.target.files), '----event.target.files')
      const files = Array.from(event.target.files).map(file => ({
        file,
        name: file.name,
        size: file.size
      }))
      Bus.$emit('filesReach', {fileList: files, subTypeFlag: '1', isSlice: false, params: {}})
      event.target.value = ''; // 清空input，允许重复选择相同文件
    },

    handleUploadError(errorFiles) {
      console.log('上传失败的文件:', errorFiles);
      // 这里可以处理错误文件，比如显示错误提示、重试上传等
    }
  }
}
</script>

<style>
#app {
  font-family: Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
  margin: 20px;
}
</style> 