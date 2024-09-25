export default {
  compiler: [8, '>= 4.3.0'],
  main: function (container, depth0, helpers, partials, data) {
    return "export class CancelError extends Error {\n	constructor(message: string) {\n		super(message);\n		this.name = 'CancelError';\n	}\n\n	public get isCancelled(): boolean {\n		return true;\n	}\n}\n\nexport interface OnCancel {\n	readonly isResolved: boolean;\n	readonly isRejected: boolean;\n	readonly isCancelled: boolean;\n\n	(cancelHandler: () => void): void;\n}\n\nexport class CancelablePromise<T> implements Promise<T> {\n	private _isResolved: boolean;\n	private _isRejected: boolean;\n	private _isCancelled: boolean;\n	readonly cancelHandlers: (() => void)[];\n	readonly promise: Promise<T>;\n	private _resolve?: (value: T | PromiseLike<T>) => void;\n	private _reject?: (reason?: unknown) => void;\n\n	constructor(\n		executor: (\n			resolve: (value: T | PromiseLike<T>) => void,\n			reject: (reason?: unknown) => void,\n			onCancel: OnCancel\n		) => void\n	) {\n		this._isResolved = false;\n		this._isRejected = false;\n		this._isCancelled = false;\n		this.cancelHandlers = [];\n		this.promise = new Promise<T>((resolve, reject) => {\n			this._resolve = resolve;\n			this._reject = reject;\n\n			const onResolve = (value: T | PromiseLike<T>): void => {\n				if (this._isResolved || this._isRejected || this._isCancelled) {\n					return;\n				}\n				this._isResolved = true;\n				if (this._resolve) this._resolve(value);\n			};\n\n			const onReject = (reason?: unknown): void => {\n				if (this._isResolved || this._isRejected || this._isCancelled) {\n					return;\n				}\n				this._isRejected = true;\n				if (this._reject) this._reject(reason);\n			};\n\n			const onCancel = (cancelHandler: () => void): void => {\n				if (this._isResolved || this._isRejected || this._isCancelled) {\n					return;\n				}\n				this.cancelHandlers.push(cancelHandler);\n			};\n\n			Object.defineProperty(onCancel, 'isResolved', {\n				get: (): boolean => this._isResolved,\n			});\n\n			Object.defineProperty(onCancel, 'isRejected', {\n				get: (): boolean => this._isRejected,\n			});\n\n			Object.defineProperty(onCancel, 'isCancelled', {\n				get: (): boolean => this._isCancelled,\n			});\n\n			return executor(onResolve, onReject, onCancel as OnCancel);\n		});\n	}\n\n	get [Symbol.toStringTag]() {\n		return \"Cancellable Promise\";\n	}\n\n	public then<TResult1 = T, TResult2 = never>(\n		onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,\n		onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null\n	): Promise<TResult1 | TResult2> {\n		return this.promise.then(onFulfilled, onRejected);\n	}\n\n	public catch<TResult = never>(\n		onRejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null\n	): Promise<T | TResult> {\n		return this.promise.catch(onRejected);\n	}\n\n	public finally(onFinally?: (() => void) | null): Promise<T> {\n		return this.promise.finally(onFinally);\n	}\n\n	public cancel(): void {\n		if (this._isResolved || this._isRejected || this._isCancelled) {\n			return;\n		}\n		this._isCancelled = true;\n		if (this.cancelHandlers.length) {\n			try {\n				for (const cancelHandler of this.cancelHandlers) {\n					cancelHandler();\n				}\n			} catch (error) {\n				console.warn('Cancellation threw an error', error);\n				return;\n			}\n		}\n		this.cancelHandlers.length = 0;\n		if (this._reject) this._reject(new CancelError('Request aborted'));\n	}\n\n	public get isCancelled(): boolean {\n		return this._isCancelled;\n	}\n}";
  },
  useData: true,
};