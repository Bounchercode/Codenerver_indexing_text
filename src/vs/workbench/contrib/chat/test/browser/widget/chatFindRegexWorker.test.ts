/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ChatFindRegexWorker } from '../../../browser/widget/chatFind/chatFindRegexWorker.js';

suite('ChatFindRegexWorker', () => {
	test('returns bounded matches with their original occurrence indexes', () => {
		const matches = new ChatFindRegexWorker().$scan('foo1 foo2 foo3', 'foo\\d', 'g', 2, 100);
		assert.deepStrictEqual(matches.map(match => ({ occurrenceIndex: match.occurrenceIndex, text: match.text })), [
			{ occurrenceIndex: 1, text: 'foo2' },
			{ occurrenceIndex: 2, text: 'foo3' }
		]);
	});

	test('caps the scan independently of the returned match count', () => {
		const matches = new ChatFindRegexWorker().$scan('aaaaa', 'a', 'g', 2, 3);
		assert.deepStrictEqual(matches.map(match => match.occurrenceIndex), [1, 2]);
	});
});
