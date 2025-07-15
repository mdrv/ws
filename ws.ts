import * as Events from './events'
import { __ } from '@mdrv/m/v257'

const getGlobalWebSocket = (): WebSocket | undefined => {
	if (typeof WebSocket !== 'undefined') {
		// @ts-ignore
		return WebSocket
	}
}

const isWebSocket = (w: any) =>
	typeof w !== 'undefined' && !!w && w.CLOSING === 2

export type Event = Events.Event
export type ErrorEvent = Events.ErrorEvent
export type CloseEvent = Events.CloseEvent

export type Options = {
	WebSocket?: any
	maxReconnectionDelay?: number
	minReconnectionDelay?: number
	reconnectionDelayGrowFactor?: number
	minUptime?: number
	connectionTimeout?: number
	maxRetries?: number
	maxEnqueuedMessages?: number
	startClosed?: boolean
	debug?: boolean
}

const DEFAULT = {
	maxReconnectionDelay: 10000,
	minReconnectionDelay: 1000 + Math.random() * 4000,
	minUptime: 5000,
	reconnectionDelayGrowFactor: 1.3,
	connectionTimeout: 4000,
	maxRetries: Infinity,
	maxEnqueuedMessages: Infinity,
	startClosed: false,
	debug: false,
}

export type UrlProvider = string | (() => string) | (() => Promise<string>)

export type Message = string | ArrayBuffer | Blob | ArrayBufferView

export type ListenersMap = {
	error: Array<Events.WebSocketEventListenerMap['error']>
	message: Array<Events.WebSocketEventListenerMap['message']>
	open: Array<Events.WebSocketEventListenerMap['open']>
	close: Array<Events.WebSocketEventListenerMap['close']>
}

export class WS {
	_ws?: WebSocket
	_listeners: ListenersMap = {
		error: [],
		message: [],
		open: [],
		close: [],
	}
	_retryCount = -1
	_uptimeTimeout: any
	_connectTimeout: any
	_shouldReconnect = true
	_connectLock = false
	_binaryType: BinaryType = 'blob'
	_closeCalled = false
	_messageQueue: Message[] = []

	readonly _url: UrlProvider
	readonly _protocols?: string | string[]
	readonly _options: Options

	constructor(
		url: UrlProvider,
		protocols?: string | string[],
		options: Options = {},
	) {
		this._url = url
		this._protocols = protocols
		this._options = options
		if (this._options.startClosed) {
			this._shouldReconnect = false
		}
		// this._connect() // H: let me connect manually, lol.
	}

    // i: I added the specific number type myself.
	static get CONNECTING(): 0 {
		return 0
	}
	static get OPEN(): 1 {
		return 1
	}
	static get CLOSING(): 2 {
		return 2
	}
	static get CLOSED(): 3 {
		return 3
	}

	get CONNECTING() {
		return WS.CONNECTING
	}
	get OPEN() {
		return WS.OPEN
	}
	get CLOSING() {
		return WS.CLOSING
	}
	get CLOSED() {
		return WS.CLOSED
	}

	get binaryType() {
		return this._ws ? this._ws.binaryType : this._binaryType
	}

	set binaryType(value: BinaryType) {
		this._binaryType = value
		if (this._ws) {
			this._ws.binaryType = value
		}
	}

	get retryCount(): number {
		return Math.max(this._retryCount, 0)
	}

	get bufferedAmount(): number {
		const bytes = this._messageQueue.reduce((acc, message) => {
			if (typeof message === 'string') {
				acc += message.length // not byte size
			} else if (message instanceof Blob) {
				acc += message.size
			} else {
				acc += message.byteLength
			}
			return acc
		}, 0)
		return bytes + (this._ws ? this._ws.bufferedAmount : 0)
	}

	get extensions(): string {
		return this._ws ? this._ws.extensions : ''
	}

	get protocol(): string {
		return this._ws ? this._ws.protocol : ''
	}

	get readyState(): number {
		if (this._ws) {
			return this._ws.readyState
		}
		return this._options.startClosed
			? WS.CLOSED
			: WS.CONNECTING
	}

	get url(): string {
		return this._ws ? this._ws.url : ''
	}

	public onclose: ((event: Events.CloseEvent) => void) | null = null
	public onerror: ((event: Events.ErrorEvent) => void) | null = null
	public onmessage: ((event: MessageEvent) => void) | null = null
	public onopen: ((event: Event) => void) | null = null

	public close(code = 1000, reason?: string) {
		this._closeCalled = true
		this._shouldReconnect = false
		this._clearTimeouts()
		if (!this._ws) {
			this._debug('close enqueued: no ws instance')
			return
		}
		if (this._ws.readyState === this.CLOSED) {
			this._debug('close: already closed')
			return
		}
		this._ws.close(code, reason)
	}

	public reconnect(code?: number, reason?: string) {
		this._shouldReconnect = true
		this._closeCalled = false
		this._retryCount = -1
		if (!this._ws || this._ws.readyState === this.CLOSED) {
			this._connect()
		} else {
			this._disconnect(code, reason)
			this._connect()
		}
	}

	public send(data: Message) {
		if (this._ws && this._ws.readyState === this.OPEN) {
			this._debug('send', data)
			this._ws.send(data)
		} else {
			const { maxEnqueuedMessages = DEFAULT.maxEnqueuedMessages } =
				this._options
			if (this._messageQueue.length < maxEnqueuedMessages) {
				this._debug('enqueue', data)
				this._messageQueue.push(data)
			}
		}
	}

	public addEventListener<T extends keyof Events.WebSocketEventListenerMap>(
		type: T,
		listener: Events.WebSocketEventListenerMap[T],
	): void {
		if (this._listeners[type]) {
			// @ts-ignore
			this._listeners[type].push(listener)
		}
	}

	public dispatchEvent(event: Event) {
		const listeners =
			this._listeners[event.type as keyof Events.WebSocketEventListenerMap]
		if (listeners) {
			for (const listener of listeners) {
				this._callEventListener(event, listener)
			}
		}
		return true
	}

	public removeEventListener<T extends keyof Events.WebSocketEventListenerMap>(
		type: T,
		listener: Events.WebSocketEventListenerMap[T],
	): void {
		if (this._listeners[type]) {
			// @ts-ignore
			this._listeners[type] = this._listeners[type].filter(
				(l) => l !== listener,
			)
		}
	}

	_debug(...args: any[]) {
		if (this._options.debug) {
			console.log.apply(console, ['RWS>', ...args])
		}
	}

	_getNextDelay() {
		const {
			reconnectionDelayGrowFactor = DEFAULT.reconnectionDelayGrowFactor,
			minReconnectionDelay = DEFAULT.minReconnectionDelay,
			maxReconnectionDelay = DEFAULT.maxReconnectionDelay,
		} = this._options
		let delay = 0
		if (this._retryCount > 0) {
			delay =
				minReconnectionDelay *
				Math.pow(reconnectionDelayGrowFactor, this._retryCount - 1)
			if (delay > maxReconnectionDelay) {
				delay = maxReconnectionDelay
			}
		}
		this._debug('next delay', delay)
		return delay
	}

	_wait(): Promise<void> {
		return new Promise((resolve) => {
			setTimeout(resolve, this._getNextDelay())
		})
	}

	_getNextUrl(urlProvider: UrlProvider): Promise<string> {
		if (typeof urlProvider === 'string') {
			return Promise.resolve(urlProvider)
		}
		if (typeof urlProvider === 'function') {
			const url = urlProvider()
			if (typeof url === 'string') {
				return Promise.resolve(url)
			}
			// @ts-ignore redundant check
			if (url.then) {
				return url
			}
		}
		throw Error('Invalid URL')
	}

	_connect() {
		if (this._connectLock || !this._shouldReconnect) {
			return
		}
		this._connectLock = true

		const {
			maxRetries = DEFAULT.maxRetries,
			connectionTimeout = DEFAULT.connectionTimeout,
			WebSocket = getGlobalWebSocket(),
		} = this._options

		if (this._retryCount >= maxRetries) {
			this._debug('max retries reached', this._retryCount, '>=', maxRetries)
			return
		}

		this._retryCount++

		this._debug('connect', this._retryCount)
		this._removeListeners()
		if (!isWebSocket(WebSocket)) {
			throw Error('No valid WebSocket class provided')
		}
		this._wait()
			.then(() => this._getNextUrl(this._url))
			.then((url) => {
				// close could be called before creating the ws
				if (this._closeCalled) {
					return
				}
				this._debug('connect', { url, protocols: this._protocols })
				this._ws = this._protocols
					? new WebSocket(url, this._protocols)
					: new WebSocket(url)
				this._ws!.binaryType = this._binaryType
				this._connectLock = false
				this._addListeners()

                // __("WS _CONNECTTIMEOUT",  this._connectTimeout)
                clearTimeout(this._connectTimeout) // H: MY CURRENT FIX
				this._connectTimeout = setTimeout(
					() => {
                        // __("WS HANDLETIMEOUT")
                        // __(this.readyState)
                        this._handleTimeout()
                    },
					connectionTimeout,
				)
                // __("WS _CONNECTTIMEOUT2",  this._connectTimeout, connectionTimeout)
			})
	}

	_handleTimeout() {
		this._debug('timeout event')
		this._handleError(new Events.ErrorEvent(Error('TIMEOUT'), this))
	}

	_disconnect(code = 1000, reason?: string) {
		this._clearTimeouts()
		if (!this._ws) {
			return
		}
		this._removeListeners()
		try {
			this._ws.close(code, reason)
			this._handleClose(new Events.CloseEvent(code, reason, this))
		} catch (error) {
			// ignore
		}
	}

	_acceptOpen() {
		this._debug('accept open')
		this._retryCount = 0
	}

	_callEventListener<T extends keyof Events.WebSocketEventListenerMap>(
		event: Events.WebSocketEventMap[T],
		listener: Events.WebSocketEventListenerMap[T],
	) {
		if ('handleEvent' in listener) {
			// @ts-ignore
			listener.handleEvent(event)
		} else {
			// @ts-ignore
			listener(event)
		}
	}

	_handleOpen = (event: Event) => {
		this._debug('open event')
		const { minUptime = DEFAULT.minUptime } = this._options

        // __("WS _HANDLEOPEN", this._connectTimeout)
		clearTimeout(this._connectTimeout) // H: Buggy???
		this._uptimeTimeout = setTimeout(() => this._acceptOpen(), minUptime)

		this._ws!.binaryType = this._binaryType

		this._messageQueue.forEach((message) => this._ws?.send(message))
		this._messageQueue = []

		if (this.onopen) {
			this.onopen(event)
		}
		this._listeners.open.forEach((listener) =>
			this._callEventListener(event, listener),
		)
	}

	_handleMessage = (event: MessageEvent) => {
		this._debug('message event')

		if (this.onmessage) {
			this.onmessage(event)
		}
		this._listeners.message.forEach((listener) =>
			this._callEventListener(event, listener),
		)
	}

	_handleError = (event: Events.ErrorEvent) => {
        // __("WS _HANDLEERROR")
        // __(event.message)
		this._debug('error event', event.message)
		this._disconnect(
			undefined,
			event.message === 'TIMEOUT' ? 'timeout' : undefined,
		)

		if (this.onerror) {
			this.onerror(event)
		}
		this._debug('exec error listeners')
		this._listeners.error.forEach((listener) =>
			this._callEventListener(event, listener),
		)

		this._connect()
	}

	_handleClose = (event: Events.CloseEvent) => {
        // __("WS _HANDLECLOSE")
		this._debug('close event')
		this._clearTimeouts()

		if (this._shouldReconnect) {
			this._connect()
		}

		if (this.onclose) {
			this.onclose(event)
		}
		this._listeners.close.forEach((listener) =>
			this._callEventListener(event, listener),
		)
	}

	_removeListeners() {
		if (!this._ws) {
			return
		}
		this._debug('removeListeners')
		this._ws.removeEventListener('open', this._handleOpen)
		this._ws.removeEventListener('close', this._handleClose)
		this._ws.removeEventListener('message', this._handleMessage)
		// @ts-ignore
		this._ws.removeEventListener('error', this._handleError)
	}

	_addListeners() {
		if (!this._ws) {
			return
		}
		this._debug('addListeners')
		this._ws.addEventListener('open', this._handleOpen)
		this._ws.addEventListener('close', this._handleClose)
		this._ws.addEventListener('message', this._handleMessage)
		// @ts-ignore
		this._ws.addEventListener('error', this._handleError)
	}

	_clearTimeouts() {
		clearTimeout(this._connectTimeout)
		clearTimeout(this._uptimeTimeout)
	}
}
