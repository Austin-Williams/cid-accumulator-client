/**
 * A rate limiter with full-jitter exponential backoff retries.
 */

/**
 * Retries an async function with full-jitter exponential backoff.
 * @param fn Operation to retry.
 * @param maxRetries Max attempts before throwing.
 * @param baseDelay Base delay in ms for backoff.
 * @param capDelay Maximum backoff cap in ms.
 */
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

export class RateLimiter {
	private lastTimestamp = 0

	constructor(
		private intervalMs: number,
		private maxRetries = 3,
		private baseDelay = 500,
		private capDelay = 10000,
	) {}

	/**
	 * Wait until at least `intervalMs` has passed since the last call.
	 */
	async throttle(): Promise<void> {
		const now = Date.now()
		const delta = now - this.lastTimestamp
		if (delta < this.intervalMs) {
			await new Promise((res) => setTimeout(res, this.intervalMs - delta))
		}
		this.lastTimestamp = Date.now()
	}

	/**
	 * Throttle then retry the operation with full-jitter exponential backoff.
	 */
	async execute<T>(fn: () => Promise<T>): Promise<T> {
		await this.throttle()
		return retryWithBackoff(fn, this.maxRetries, this.baseDelay, this.capDelay)
	}
}
