export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(eventName, handler) {
    const bucket = this.listeners.get(eventName) || new Set();
    bucket.add(handler);
    this.listeners.set(eventName, bucket);
    return () => bucket.delete(handler);
  }

  emit(eventName, payload = {}) {
    const bucket = this.listeners.get(eventName);
    if (!bucket) return;
    for (const handler of bucket) {
      handler(payload);
    }
  }
}
