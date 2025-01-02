/*
 * @Author: Oliver
 * @Date: 2024-12-16 10:08:01
 * @LastEditors: Oliver
 * @LastEditTime: 2024-12-16 14:32:12
 * @FilePath: /v2_upload/src/utils/EventEmitter.js
 */
export class EventEmitter {
  constructor() {
    this.events = new Map()
  }

  on(eventName, callback) {
    if (!this.events.has(eventName)) {
      this.events.set(eventName, [])
    }
    this.events.get(eventName).push(callback)
  }

  off(eventName, callback) {
    if (!this.events.has(eventName)) return
    
    const callbacks = this.events.get(eventName)
    const index = callbacks.indexOf(callback)
    
    if (index !== -1) {
      callbacks.splice(index, 1)
    }
  }

  emit(eventName, data) {
    if (!this.events.has(eventName)) return
    
    this.events.get(eventName).forEach(callback => {
      callback(data)
    })
  }
} 