/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IWebWorkerServerRequestHandler } from '../../../../../../base/common/worker/webWorker.js';

/** A match's offsets in the string sent to the worker. */
export interface IChatFindRegexMatch {
	readonly occurrenceIndex: number;
	readonly start: number;
	readonly end: number;
	readonly text: string;
}

export class ChatFindRegexWorker implements IWebWorkerServerRequestHandler {
	_requestHandlerBrand: void = undefined;
	/**
	 * Regex execution must stay in this worker. The caller can terminate the worker if a single
	 * `exec` takes too long; a match-count limit alone cannot stop catastrophic backtracking.
	 */
	$scan(text: string, source: string, flags: string, resultLimit: number, scanLimit: number): IChatFindRegexMatch[] {
		if (resultLimit <= 0 || scanLimit <= 0) {
			return [];
		}
		const regex = new RegExp(source, flags.includes('g') ? flags : `${flags}g`);
		const matches: IChatFindRegexMatch[] = [];
		let occurrenceIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = regex.exec(text))) {
			matches.push({ occurrenceIndex, start: match.index, end: match.index + match[0].length, text: match[0] });
			occurrenceIndex++;
			if (match[0].length === 0) {
				regex.lastIndex++;
			}
			if (matches.length >= resultLimit * 2) {
				matches.splice(0, matches.length - resultLimit);
			}
			if (occurrenceIndex >= scanLimit) {
				break;
			}
		}
		return matches.length > resultLimit ? matches.slice(-resultLimit) : matches;
	}
}

export function create(): ChatFindRegexWorker {
	return new ChatFindRegexWorker();
}
