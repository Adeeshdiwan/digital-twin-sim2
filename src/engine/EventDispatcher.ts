export type EventCallback = (data?: any) => void;

export const SystemEvent = {
  EVENT_PICK_DETECTED: "EVENT_PICK_DETECTED",
  EVENT_ITEM_IN_TRANSIT: "EVENT_ITEM_IN_TRANSIT",
  EVENT_PLACEMENT_DETECTED: "EVENT_PLACEMENT_DETECTED",
  EVENT_PLACEMENT_VERIFIED: "EVENT_PLACEMENT_VERIFIED",
  CRANE_STATE_CHANGED: "CRANE_STATE_CHANGED",
  SENSOR_TRIGGERED: "SENSOR_TRIGGERED",
  ITEM_SPAWNED: "ITEM_SPAWNED",
  ERROR_DETECTED: "ERROR_DETECTED",
  METRICS_CALCULATED: "METRICS_CALCULATED"
} as const;

export type SystemEvent = typeof SystemEvent[keyof typeof SystemEvent];

class EventDispatcher {
  private listeners: Map<string, EventCallback[]> = new Map();

  on(event: string, callback: EventCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback: EventCallback) {
    if (!this.listeners.has(event)) return;
    const callbacks = this.listeners.get(event)!.filter(cb => cb !== callback);
    this.listeners.set(event, callbacks);
  }

  emit(event: string, data?: any) {
    console.log(`[Event Emitted] ${event}`, data || '');
    if (!this.listeners.has(event)) return;
    this.listeners.get(event)!.forEach(cb => cb(data));
  }
}

export const events = new EventDispatcher();
