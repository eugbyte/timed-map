import { MinPriorityQueue } from "@datastructures-js/priority-queue";
import { TimeoutInfo, QueueInfo, TimeoutId, TimedMap } from "./timed-map.types";
import cloneDeep from "lodash.clonedeep";

export class TickerMap<K, V> extends Map<K, V> implements TimedMap<K, V> {
  private id: TimeoutId;
  private timeouts = new Map<K, TimeoutInfo>();
  private minQ = new MinPriorityQueue<QueueInfo<K>>((item) => item.priority);

  constructor() {
    super();
    const { minQ, timeouts } = this;

    this.id = setInterval(async () => {
      while (!minQ.isEmpty()) {
        const earliest: QueueInfo<K> = minQ.dequeue();
        const key: K = earliest.item;
        const timeout: TimeoutInfo | undefined = timeouts.get(key);

        if (timeout == null) {
          // this.delete() was called before interval callback was executed
          continue;
        } else if (Date.now() <= timeout.timestamp) {
          minQ.enqueue({ item: key, priority: timeout.timestamp });
          // other items in the queue are in inreasing order, so just break
          break;
        }

        try {
          await timeout.callback();
        } catch (err) {
          console.error(err);
        }
      }
    }, 1000);
  }

  /**
   * Remember to call `dispose()` before unmounting the component, as TimeoutCache uses setInterval internally
   */
  dispose() {
    clearInterval(this.id);
  }

  /**
   * Set the expiry duration for the item in the cache.
   * A 1 to 1 mapping of the item against the expiry date. Calling this method consecutively will overwrite the previous expiry date.
   * If setTimer was called previously, and called again with an earlier timestamp before the previous timestamp, time complexity will be `O(log(n) + n)`,
   * as the item needs to be removed from the heap.
   * In all other cases, time complexity is `O(log(n))`.
   * @param key the key of the item in the cache which will expire.
   * @param timestamp the date time in Unix timestamp
   * @param callback the callback function which will execute upon expiry.
   */
  setTimer(key: K, timestamp: number, callback: () => void | Promise<void>) {
    const { minQ, timeouts } = this;
    const ttl = timestamp - Date.now();

    const prev: TimeoutInfo | undefined = timeouts.get(key);
    if (prev != null && timestamp < prev.timestamp) {
      minQ.remove((element) => element.item == key);
    } else if (prev == null) {
      minQ.enqueue({ item: key, priority: timestamp });
    }

    timeouts.set(key, { ttl, timestamp, callback });
  }

  override delete(key: K): boolean {
    this.timeouts.delete(key);
    return super.delete(key);
  }

  getTimeout(key: K): TimeoutInfo | undefined {
    return this.timeouts.get(key);
  }

  getTimeouts() {
    return cloneDeep(this.timeouts);
  }
}
