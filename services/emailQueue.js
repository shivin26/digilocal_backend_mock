const EventEmitter = require('events');

/**
 * Asynchronous Background Email Queue Processor.
 * Dispatches emails in background workers without blocking HTTP client responses.
 * Implements Exponential Backoff Retry handling for transient network/SMTP failures.
 */
class EmailQueueProcessor extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.isProcessing = false;
    this.maxRetries = 3;
    this.baseDelayMs = 2000;
  }

  /**
   * Enqueues an email task for async background processing.
   * Returns immediately (non-blocking).
   */
  enqueue(sendMailFn, taskName = 'email_job') {
    this.queue.push({
      sendMailFn,
      taskName,
      attempts: 0,
      enqueuedAt: Date.now()
    });

    setImmediate(() => this.processNext());
  }

  /**
   * Processes the next item in the background queue.
   */
  async processNext() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const item = this.queue.shift();

    try {
      item.attempts += 1;
      await item.sendMailFn();
    } catch (err) {
      console.error(`[EmailQueue Error] Task '${item.taskName}' failed on attempt ${item.attempts}:`, err.message);

      if (item.attempts < this.maxRetries) {
        const delay = this.baseDelayMs * Math.pow(2, item.attempts - 1);
        setTimeout(() => {
          this.queue.push(item);
          this.processNext();
        }, delay);
      } else {
        console.error(`[EmailQueue Failed] Task '${item.taskName}' exhausted all ${this.maxRetries} retries.`);
      }
    } finally {
      this.isProcessing = false;
      if (this.queue.length > 0) {
        setImmediate(() => this.processNext());
      }
    }
  }
}

const emailQueue = new EmailQueueProcessor();
module.exports = emailQueue;
