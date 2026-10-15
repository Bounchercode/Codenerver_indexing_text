/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../../../base/common/network.js';
import type { IWebWorkerClient } from '../../../../../../base/common/worker/webWorker.js';
import { WebWorkerDescriptor } from '../../../../../../platform/webWorker/browser/webWorkerDescriptor.js';
import { IWebWorkerService } from '../../../../../../platform/webWorker/browser/webWorkerService.js';
import type { ChatFindRegexWorker, IChatFindRegexMatch } from './chatFindRegexWorker.js';

/** Prevents an expensive `RegExp.exec` in the worker from delaying later searches indefinitely. */
const REGEX_SCAN_TIMEOUT_MS = 2000;
const MAX_CACHED_SCANS = 8;
const MAX_CACHED_MATCHES = 20_000;

export class ChatFindRegexScanner extends Disposable {
	private readonly client = this._register(new MutableDisposable<IWebWorkerClient<ChatFindRegexWorker>>());
	private readonly pending = new Set<() => void>();
	private readonly cachedScans = new Map<string, { scanLimit: number; matches: readonly IChatFindRegexMatch[] }>();
	private _failed = false;

	get failed(): boolean {
		return this._failed;
	}

	constructor(@IWebWorkerService private readonly webWorkerService: IWebWorkerService) {
		super();
	}

	async scan(text: string, regex: RegExp, resultLimit: number, scanLimit: number): Promise<readonly IChatFindRegexMatch[] | undefined> {
		// Highlighting visits a row's matches newest first. Reuse the first scan of that row
		// instead of asking the worker to rescan its text for every earlier occurrence.
		const cacheKey = resultLimit === scanLimit && scanLimit <= MAX_CACHED_MATCHES && text.length <= 100_000
			? JSON.stringify([regex.source, regex.flags, text]) : undefined;
		const cached = cacheKey ? this.cachedScans.get(cacheKey) : undefined;
		if (cached && cached.scanLimit >= scanLimit) {
			return cached.matches.filter(match => match.occurrenceIndex < scanLimit);
		}
		let client: IWebWorkerClient<ChatFindRegexWorker>;
		try {
			client = this.client.value ?? this.webWorkerService.createWorkerClient<ChatFindRegexWorker>(new WebWorkerDescriptor({
				esmModuleLocation: FileAccess.asBrowserUri('vs/workbench/contrib/chat/browser/widget/chatFind/chatFindRegexWorkerMain.js'),
				label: 'ChatFindRegexWorker'
			}));
			this.client.value = client;
		} catch {
			this._failed = true;
			return undefined;
		}

		let timeout: ReturnType<typeof setTimeout> | undefined;
		let cancel: () => void = () => { };
		const canceled = new Promise<undefined>(resolve => {
			cancel = () => resolve(undefined);
			this.pending.add(cancel);
		});
		const timedOut = new Promise<undefined>(resolve => {
			timeout = setTimeout(() => {
				this.reset();
				this._failed = true;
				resolve(undefined);
			}, REGEX_SCAN_TIMEOUT_MS);
		});
		try {
			const matches = await Promise.race([
				client.proxy.$scan(text, regex.source, regex.flags, resultLimit, scanLimit),
				canceled,
				timedOut
			]);
			if (cacheKey && matches) {
				this.cachedScans.set(cacheKey, { scanLimit, matches });
				if (this.cachedScans.size > MAX_CACHED_SCANS) {
					this.cachedScans.delete(this.cachedScans.keys().next().value!);
				}
			}
			return matches;
		} catch {
			this.reset();
			this._failed = true;
			return undefined;
		} finally {
			clearTimeout(timeout);
			this.pending.delete(cancel);
		}
	}

	reset(): void {
		if (this.pending.size) {
			this.client.clear();
			for (const cancel of this.pending) {
				cancel();
			}
			this.pending.clear();
		}
		this.cachedScans.clear();
		this._failed = false;
	}

	override dispose(): void {
		this.reset();
		super.dispose();
	}
}
