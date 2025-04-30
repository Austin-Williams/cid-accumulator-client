// A FIFO rate limiter that ensures requests are processed in order

// Retries an async function with full-jitter exponential backoff.
// @param fn Operation to retry.
// @param maxRetries Max attempts before throwing.
// @param baseDelay Base delay in ms for backoff.
// @param capDelay Maximum backoff cap in ms.
async function retryWithBackoff<T>(
	fn: () => Promise<T>,
	maxRetries = 3,
	baseDelay = 500,
	capDelay = 10000
): Promise<T> {
	let attempt = 0
	while (true) {
		try {
			return await fn()
		} catch (err) {
			attempt++
			if (attempt > maxRetries) throw err
			const backoff = Math.min(capDelay, baseDelay * 2 ** (attempt - 1))
			const delay = Math.random() * backoff
			await new Promise((res) => setTimeout(res, delay))
		}
	}
}

// Task to be processed in the queue
type QueueTask<T> = {
	id: number
	fn: () => Promise<T>
	resolve: (value: T | PromiseLike<T>) => void
	reject: (reason?: any) => void
}

// A rate limiter with a FIFO queue
export class RateLimiter {
	// Queue of pending tasks
	private queue: Array<QueueTask<any>> = []
	
	// Is the queue processor running?
	private processingQueue = false
	
	// Counter for task IDs (for logging)
	private taskCounter = 0
	
	// Timestamp when the next operation is allowed
	private nextAllowedTime = 0

	// Creates a new rate limiter
	// @param intervalMs Minimum time between operations in milliseconds
	// @param maxRetries Maximum number of retries for failed operations
	// @param baseDelay Base delay for retry backoff in milliseconds
	// @param capDelay Maximum delay cap for retry backoff in milliseconds
	constructor(
		private intervalMs: number,
		private maxRetries = 3,
		private baseDelay = 500,
		private capDelay = 10000,
	) {}

	// Executes a function with rate limiting
	// The operation is added to a FIFO queue with the specified
	// minimum delay between operations
	// @param fn Function to execute
	// @returns Promise resolving to the result of the function
	execute<T>(fn: () => Promise<T>): Promise<T> {
		const id = ++this.taskCounter
		
		return new Promise<T>((resolve, reject) => {
			// Add the operation to the queue
			this.queue.push({
				id,
				fn: () => retryWithBackoff(fn, this.maxRetries, this.baseDelay, this.capDelay),
				resolve,
				reject
			})
			
			// Start processing the queue if not already running
			if (!this.processingQueue) {
				this.processQueue()
			}
		})
	}

	// Processes the queue of operations, ensuring proper spacing between API calls
	private async processQueue(): Promise<void> {
		// If already processing, don't start another processor
		if (this.processingQueue) return
		
		this.processingQueue = true
		
		try {
			while (this.queue.length > 0) {
				// Get the next task (but don't remove it yet)
				const task = this.queue[0]
				
				// Apply rate limiting
				const now = Date.now()
				const waitTime = Math.max(0, this.nextAllowedTime - now)
				
				if (waitTime > 0) await new Promise(resolve => setTimeout(resolve, waitTime))
				
				// Remove the task from the queue
				this.queue.shift();
				
				// Update the time when the next operation is allowed
				this.nextAllowedTime = Date.now() + this.intervalMs
				
				// Execute the task
				try {
					const result = await task.fn()
					task.resolve(result);
				} catch (error) {
					console.error(`[RATE_LIMITER][${task.id}] Failed at ${Date.now()}:`, error);
					task.reject(error);
				}
			}
		} catch (error) {
			console.error(`[RATE_LIMITER] Queue processor error:`, error);
		} finally {
			this.processingQueue = false;
		}
	}
}
