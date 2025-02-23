import { Assertions, Cursors } from '@ephox/agar';
import { describe, it } from '@ephox/bedrock-client';
import { Arr } from '@ephox/katamari';
import { Hierarchy, Html, Remove, Replication, SelectorFilter, SugarElement } from '@ephox/sugar';
import { McEditor, TinyAssertions, TinyDom, TinySelections } from '@ephox/wrap-mcagar';
import { assert } from 'chai';

import Editor from 'tinymce/core/api/Editor';
import {
  Bookmark, isIdBookmark, isIndexBookmark, isPathBookmark, isRangeBookmark, isStringPathBookmark
} from 'tinymce/core/bookmark/BookmarkTypes';
import * as GetBookmark from 'tinymce/core/bookmark/GetBookmark';
import * as ResolveBookmark from 'tinymce/core/bookmark/ResolveBookmark';

describe('browser.tinymce.core.bookmark.BookmarksTest', () => {

  const bookmarkTest = (runTests: (editor: Editor) => void) => async () => {
    const editor = await McEditor.pFromSettings<Editor>({
      menubar: false,
      toolbar: false,
      statusbar: false,
      base_url: '/project/tinymce/js/tinymce'
    });
    runTests(editor);
    McEditor.remove(editor);
  };

  const getBookmark = (editor: Editor, type: number, normalized: boolean) =>
    GetBookmark.getBookmark(editor.selection, type, normalized);

  const getFilledPersistentBookmark = (editor: Editor, _type: number, _normalized: boolean) =>
    GetBookmark.getPersistentBookmark(editor.selection, true);

  const assertRawRange = (element: SugarElement<Node>, rng: Range, startPath: number[], startOffset: number, endPath: number[], endOffset: number) => {
    const startContainer = Hierarchy.follow(element, startPath).getOrDie();
    const endContainer = Hierarchy.follow(element, endPath).getOrDie();

    Assertions.assertDomEq('Should be expected start container', startContainer, SugarElement.fromDom(rng.startContainer));
    assert.equal(rng.startOffset, startOffset, 'Should be expected start offset');
    Assertions.assertDomEq('Should be expected end container', endContainer, SugarElement.fromDom(rng.endContainer));
    assert.equal(rng.endOffset, endOffset, 'Should be expected end offset');
  };

  const setupEditor = (editor: Editor, content: string, startPath: number[], startOffset: number, endPath: number[], endOffset: number, forward: boolean = true) => {
    editor.setContent(content);

    const body = TinyDom.body(editor);
    const start = Cursors.calculateOne(body, startPath);
    const end = Cursors.calculateOne(body, startPath);

    const range = editor.getDoc().createRange();
    range.setStart(start.dom, startOffset);
    range.setEnd(end.dom, endOffset);

    editor.selection.setRng(range, forward);
  };

  const resolveBookmark = (editor: Editor, bookmark: Bookmark) => {
    const { range, forward } = ResolveBookmark.resolve(editor.selection, bookmark).getOrDie('Should be resolved');
    editor.selection.setRng(range, forward);
  };

  const assertRangeBookmark = (editor: Editor, bookmark: Bookmark, spath: number[], soffset: number, fpath: number[], foffset: number, forward: boolean) => {
    const rangeBookmark = isRangeBookmark(bookmark) ? bookmark : assert.fail('Not a range bookmark');
    assert.equal(rangeBookmark.forward, forward, 'Should match selection direction');
    assertRawRange(TinyDom.body(editor), rangeBookmark.rng, spath, soffset, fpath, foffset);
  };

  const assertPathBookmark = (bookmark: Bookmark, expectedStart: number[], expectedEnd: number[], forward: boolean) => {
    const pathBookmark = isPathBookmark(bookmark) ? bookmark : assert.fail('Not a path bookmark');
    assert.deepEqual(pathBookmark.start, expectedStart, 'Should be expected start path');
    assert.deepEqual(pathBookmark.end, expectedEnd, 'Should be expected end path');
    assert.equal(pathBookmark.forward, forward, 'Should match selection direction');
  };

  const assertIndexBookmark = (bookmark: Bookmark, expectedName: string, expectedIndex: number) => {
    const indexBookmark = isIndexBookmark(bookmark) ? bookmark : assert.fail('Not a index bookmark');
    assert.equal(indexBookmark.name, expectedName, 'Should be expected name');
    assert.equal(indexBookmark.index, expectedIndex, 'Should be expected index');
  };

  const assertStringPathBookmark = (bookmark: Bookmark, expectedStart: string, expectedEnd: string, forward: boolean) => {
    const stringPathBookmark = isStringPathBookmark(bookmark) ? bookmark : assert.fail('Not a string path bookmark');
    assert.equal(stringPathBookmark.start, expectedStart, 'Should be expected start');
    assert.equal(stringPathBookmark.end, expectedEnd, 'Should be expected end');
    assert.equal(stringPathBookmark.forward, forward, 'Should match selection direction');
  };

  const assertIdBookmark = (bookmark: Bookmark) => {
    assert.isTrue(isIdBookmark(bookmark), 'Should be an id bookmark');
  };

  const assertApproxRawContent = (editor: Editor, expectedHtml: string) => {
    const elm = Replication.deep(TinyDom.body(editor));
    Arr.each(SelectorFilter.descendants(elm, '*[data-mce-bogus="all"]'), Remove.remove);
    const actualHtml = Html.get(elm);
    Assertions.assertHtmlStructure('Should expected structure', `<body>${expectedHtml}</body>`, `<body>${actualHtml}</body>`);
  };

  it('Range bookmark', bookmarkTest((editor) => {
    setupEditor(editor, '<p>a</p>', [ 0, 0 ], 0, [ 0, 0 ], 1);
    const bookmark = getBookmark(editor, 1, false);
    assertRangeBookmark(editor, bookmark, [ 0, 0 ], 0, [ 0, 0 ], 1, true);
    TinySelections.setCursor(editor, [ 0, 0 ], 0);
    resolveBookmark(editor, bookmark);
    TinyAssertions.assertSelection(editor, [ 0, 0 ], 0, [ 0, 0 ], 1);
  }));

  it('TINY-8599: Range bookmark backwards', bookmarkTest((editor) => {
    setupEditor(editor, '<p>a</p>', [ 0, 0 ], 0, [ 0, 0 ], 1, false);
    const bookmark = getBookmark(editor, 1, false);
    assertRangeBookmark(editor, bookmark, [ 0, 0 ], 0, [ 0, 0 ], 1, false);
    TinySelections.setCursor(editor, [ 0, 0 ], 0);
    resolveBookmark(editor, bookmark);
    TinyAssertions.assertSelection(editor, [ 0, 0 ], 0, [ 0, 0 ], 1);
    assert.isFalse(editor.selection.isForward(), 'Should be backwards');
  }));

  it('Get path bookmark', bookmarkTest((editor) => {
    setupEditor(editor, '<p>a</p>', [ 0, 0 ], 0, [ 0, 0 ], 1);
    const bookmark = getBookmark(editor, 2, false);
    assertPathBookmark(bookmark, [ 0, 0, 0 ], [ 1, 0, 0 ], true);
    TinySelections.setCursor(editor, [ 0, 0 ], 0);
    resolveBookmark(editor, bookmark);
    TinyAssertions.assertSelection(editor, [ 0, 0 ], 0, [ 0, 0 ], 1);
  }));

  it('TINY-8599: Get path bookmark backwards', bookmarkTest((editor) => {
    setupEditor(editor, '<p>a</p>', [ 0, 0 ], 0, [ 0, 0 ], 1, false);
    const bookmark = getBookmark(editor, 2, false);
    assertPathBookmark(bookmark, [ 0, 0, 0 ], [ 1, 0, 0 ], false);
    TinySelections.setCursor(editor, [ 0, 0 ], 0);
    resolveBookmark(editor, bookmark);
    TinyAssertions.assertSelection(editor, [ 0, 0 ], 0, [ 0, 0 ], 1);
    assert.isFalse(editor.selection.isForward(), 'Should be backwards');
  }));

  it('Get id bookmark', bookmarkTest((editor) => {
    setupEditor(editor, '<p><img src="about:blank"></p>', [ 0 ], 0, [ 0 ], 1);
    const bookmark = getBookmark(editor, 2, false);
    assertIndexBookmark(bookmark, 'IMG', 0);
    TinySelections.setCursor(editor, [ 0, 0 ], 0);
    resolveBookmark(editor, bookmark);
    TinyAssertions.assertSelection(editor, [ 0 ], 0, [ 0 ], 1);
  }));

  it('Get string path bookmark', bookmarkTest((editor) => {
    setupEditor(editor, '<p>a</p>', [ 0, 0 ], 0, [ 0, 0 ], 1);
    const bookmark = getBookmark(editor, 3, false);
    assertStringPathBookmark(bookmark, 'p[0]/text()[0],0', 'p[0]/text()[0],1', true);
    TinySelections.setCursor(editor, [ 0, 0 ], 0);
    resolveBookmark(editor, bookmark);
    TinyAssertions.assertSelection(editor, [ 0, 0 ], 0, [ 0, 0 ], 1);
  }));

  it('TINY-8599: Get string path bookmark backwards', bookmarkTest((editor) => {
    setupEditor(editor, '<p>a</p>', [ 0, 0 ], 0, [ 0, 0 ], 1, false);
    const bookmark = getBookmark(editor, 3, false);
    assertStringPathBookmark(bookmark, 'p[0]/text()[0],0', 'p[0]/text()[0],1', false);
    TinySelections.setCursor(editor, [ 0, 0 ], 0);
    resolveBookmark(editor, bookmark);
    TinyAssertions.assertSelection(editor, [ 0, 0 ], 0, [ 0, 0 ], 1);
    assert.isFalse(editor.selection.isForward(), 'Should be backwards');
  }));

  it('Get persistent bookmark on element indexes', bookmarkTest((editor) => {
    setupEditor(editor, '<p><img src="about:blank"></p>', [ 0 ], 0, [ 0 ], 1);
    const bookmark = getBookmark(editor, 0, false);
    assertApproxRawContent(editor, '<p><img src="about:blank"></p>');
    assertIndexBookmark(bookmark, 'IMG', 0);
    TinySelections.setCursor(editor, [ 0, 0 ], 0);
    resolveBookmark(editor, bookmark);
    assertApproxRawContent(editor, '<p><img src="about:blank"></p>');
    TinyAssertions.assertSelection(editor, [ 0 ], 0, [ 0 ], 1);
  }));

  it('Get persistent bookmark marker spans on text offsets', bookmarkTest((editor) => {
    setupEditor(editor, '<p>abc</p>', [ 0, 0 ], 1, [ 0, 0 ], 2);
    const bookmark = getBookmark(editor, 0, false);
    assertApproxRawContent(editor, '<p>a<span data-mce-type="bookmark" id="mce_1_start"></span>b<span id="mce_1_end"></span>c</p>');
    TinyAssertions.assertSelection(editor, [ 0, 2 ], 0, [ 0, 2 ], 1);
    assertIdBookmark(bookmark);
    TinySelections.setCursor(editor, [ 0, 1 ], 0);
    resolveBookmark(editor, bookmark);
    assertApproxRawContent(editor, '<p>abc</p>');
    TinyAssertions.assertSelection(editor, [ 0, 0 ], 1, [ 0, 0 ], 2);
  }));

  it('TINY-8599: Get persistent bookmark marker spans on text offsets backwards', bookmarkTest((editor) => {
    setupEditor(editor, '<p>abc</p>', [ 0, 0 ], 1, [ 0, 0 ], 2, false);
    const bookmark = getBookmark(editor, 0, false);
    assertApproxRawContent(editor, '<p>a<span data-mce-type="bookmark" id="mce_1_start"></span>b<span id="mce_1_end"></span>c</p>');
    TinyAssertions.assertSelection(editor, [ 0, 2 ], 0, [ 0, 2 ], 1);
    assert.isFalse(editor.selection.isForward(), 'Should be backwards');
    assertIdBookmark(bookmark);
    TinySelections.setCursor(editor, [ 0, 1 ], 0);
    resolveBookmark(editor, bookmark);
    assertApproxRawContent(editor, '<p>abc</p>');
    TinyAssertions.assertSelection(editor, [ 0, 0 ], 1, [ 0, 0 ], 2);
    assert.isFalse(editor.selection.isForward(), 'Should be backwards');
  }));

  it('Get persistent bookmark marker spans on element indexes', bookmarkTest((editor) => {
    setupEditor(editor, '<p><input><input></p>', [ 0 ], 0, [ 0 ], 2);
    const bookmark = getBookmark(editor, 0, false);
    assertApproxRawContent(editor, '<p><span data-mce-type="bookmark" id="mce_1_start"></span><input><input><span id="mce_1_end"></span></p>');
    TinyAssertions.assertSelection(editor, [ 0 ], 1, [ 0 ], 3);
    assertIdBookmark(bookmark);
    TinySelections.setCursor(editor, [ 0 ], 2);
    resolveBookmark(editor, bookmark);
    assertApproxRawContent(editor, '<p><input><input></p>');
    TinyAssertions.assertSelection(editor, [ 0 ], 0, [ 0 ], 2);
  }));

  it('Get persistent bookmark filled with marker spans on text offsets', bookmarkTest((editor) => {
    setupEditor(editor, '<p>abc</p>', [ 0, 0 ], 1, [ 0, 0 ], 2);
    const bookmark = getFilledPersistentBookmark(editor, 0, true);
    assertApproxRawContent(editor, '<p>a<span data-mce-type="bookmark" id="mce_1_start">\ufeff</span>b<span id="mce_1_end">\ufeff</span>c</p>');
    TinyAssertions.assertSelection(editor, [ 0, 1, 0 ], 1, [ 0, 3, 0 ], 1);
    assertIdBookmark(bookmark);
    TinySelections.setCursor(editor, [ 0, 1 ], 0);
    resolveBookmark(editor, bookmark);
    assertApproxRawContent(editor, '<p>abc</p>');
    TinyAssertions.assertSelection(editor, [ 0, 0 ], 1, [ 0, 0 ], 2);
  }));
});
