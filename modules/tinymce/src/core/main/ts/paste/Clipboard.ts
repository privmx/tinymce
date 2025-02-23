import { Arr, Cell, Strings, Type } from '@ephox/katamari';

import Editor from '../api/Editor';
import Env from '../api/Env';
import { BlobCache, BlobInfo } from '../api/file/BlobCache';
import { ParserArgs } from '../api/html/DomParser';
import * as Options from '../api/Options';
import Delay from '../api/util/Delay';
import { EditorEvent } from '../api/util/EventDispatcher';
import VK from '../api/util/VK';
import * as Conversions from '../file/Conversions';
import * as Whitespace from '../text/Whitespace';
import * as InternalHtml from './InternalHtml';
import * as Newlines from './Newlines';
import { PasteBin, isDefaultPasteBinContent } from './PasteBin';
import * as PasteUtils from './PasteUtils';
import * as ProcessFilters from './ProcessFilters';
import * as SmartPaste from './SmartPaste';

interface FileResult {
  readonly file: File;
  readonly uri: string;
}

export interface ClipboardContents {
  [key: string]: string;
}

const uniqueId = PasteUtils.createIdGenerator('mceclip');

const doPaste = (editor: Editor, content: string, internal: boolean, pasteAsText: boolean): void => {
  const args = ProcessFilters.process(editor, content, internal);

  if (args.cancelled === false) {
    SmartPaste.insertContent(editor, args.content, pasteAsText);
  }
};

/*
 * Pastes the specified HTML. This means that the HTML is filtered and then
 * inserted at the current selection in the editor. It will also fire paste events
 * for custom user filtering.
 */
const pasteHtml = (editor: Editor, html: string, internalFlag: boolean): void => {
  const internal = internalFlag ? internalFlag : InternalHtml.isMarked(html);
  doPaste(editor, InternalHtml.unmark(html), internal, false);
};

/*
 * Pastes the specified text. This means that the plain text is processed
 * and converted into BR and P elements. It will fire paste events for custom filtering.
 */
const pasteText = (editor: Editor, text: string): void => {
  const encodedText = editor.dom.encode(text).replace(/\r\n/g, '\n');
  const normalizedText = Whitespace.normalize(encodedText, Options.getPasteTabSpaces(editor));
  const html = Newlines.toBlockElements(normalizedText, Options.getForcedRootBlock(editor), Options.getForcedRootBlockAttrs(editor));
  doPaste(editor, html, false, true);
};

/*
 * Gets various content types out of a datatransfer object.
 */
const getDataTransferItems = (dataTransfer: DataTransfer | undefined): ClipboardContents => {
  const items: ClipboardContents = {};

  if (dataTransfer && dataTransfer.types) {
    for (let i = 0; i < dataTransfer.types.length; i++) {
      const contentType = dataTransfer.types[i];
      try { // IE11 throws exception when contentType is Files (type is present but data cannot be retrieved via getData())
        items[contentType] = dataTransfer.getData(contentType);
      } catch (ex) {
        items[contentType] = ''; // useless in general, but for consistency across browsers
      }
    }
  }

  return items;
};

const hasContentType = (clipboardContent: ClipboardContents, mimeType: string): boolean =>
  mimeType in clipboardContent && clipboardContent[mimeType].length > 0;

const hasHtmlOrText = (content: ClipboardContents): boolean =>
  hasContentType(content, 'text/html') || hasContentType(content, 'text/plain');

const extractFilename = (editor: Editor, str: string): string | null => {
  const m = str.match(/([\s\S]+?)(?:\.[a-z0-9.]+)$/i);
  return Type.isNonNullable(m) ? editor.dom.encode(m[1]) : null;
};

const createBlobInfo = (editor: Editor, blobCache: BlobCache, file: File, base64: string): BlobInfo => {
  const id = uniqueId();
  const useFileName = Options.shouldReuseFileName(editor) && Type.isNonNullable(file.name);
  const name = useFileName ? extractFilename(editor, file.name) : id;
  const filename = useFileName ? file.name : undefined;

  const blobInfo = blobCache.create(id, file, base64, name, filename);
  blobCache.add(blobInfo);
  return blobInfo;
};

const pasteImage = (editor: Editor, imageItem: FileResult): void => {
  const { data: base64, type } = Conversions.parseDataUri(imageItem.uri);
  const file = imageItem.file;

  // TODO: Move the bulk of the cache logic to EditorUpload
  const blobCache = editor.editorUpload.blobCache;
  const existingBlobInfo = blobCache.getByData(base64, type);
  const blobInfo = existingBlobInfo ?? createBlobInfo(editor, blobCache, file, base64);

  pasteHtml(editor, `<img src="${blobInfo.blobUri()}">`, false);
};

const isClipboardEvent = (event: Event): event is ClipboardEvent =>
  event.type === 'paste';

const readFilesAsDataUris = (items: File[]): Promise<FileResult[]> =>
  Promise.all(Arr.map(items, (file) => {
    return Conversions.blobToDataUri(file).then((uri) => ({ file, uri }));
  }));

const isImage = (editor: Editor) => {
  const allowedExtensions = Options.getAllowedImageFileTypes(editor);
  return (file: File): boolean => Strings.startsWith(file.type, 'image/') && Arr.exists(allowedExtensions, (extension) => {
    return PasteUtils.getImageMimeType(extension) === file.type;
  });
};

const getImagesFromDataTransfer = (editor: Editor, dataTransfer: DataTransfer): File[] => {
  const items = dataTransfer.items ? Arr.bind(Arr.from(dataTransfer.items), (item) => {
    return item.kind === 'file' ? [ item.getAsFile() ] : [];
  }) : [];
  const files = dataTransfer.files ? Arr.from(dataTransfer.files) : [];
  return Arr.filter(items.length > 0 ? items : files, isImage(editor));
};

/*
 * Checks if the clipboard contains image data if it does it will take that data
 * and convert it into a data url image and paste that image at the caret location.
 */
const pasteImageData = (editor: Editor, e: ClipboardEvent | DragEvent, rng: Range | undefined): boolean => {
  const dataTransfer = isClipboardEvent(e) ? e.clipboardData : e.dataTransfer;

  if (Options.shouldPasteDataImages(editor) && dataTransfer) {
    const images = getImagesFromDataTransfer(editor, dataTransfer);

    if (images.length > 0) {
      e.preventDefault();

      readFilesAsDataUris(images).then((fileResults) => {
        if (rng) {
          editor.selection.setRng(rng);
        }

        Arr.each(fileResults, (result) => {
          pasteImage(editor, result);
        });
      });

      return true;
    }
  }

  return false;
};

// Chrome on Android doesn't support proper clipboard access so we have no choice but to allow the browser default behavior.
const isBrokenAndroidClipboardEvent = (e: ClipboardEvent): boolean =>
  Env.os.isAndroid() && e.clipboardData?.items?.length === 0;

// Ctrl+V or Shift+Insert
const isKeyboardPasteEvent = (e: KeyboardEvent): boolean =>
  (VK.metaKeyPressed(e) && e.keyCode === 86) || (e.shiftKey && e.keyCode === 45);

const insertClipboardContent = (editor: Editor, clipboardContent: ClipboardContents, html: string, plainTextMode: boolean): void => {
  let content = PasteUtils.trimHtml(html);

  const isInternal = hasContentType(clipboardContent, InternalHtml.internalHtmlMime()) || InternalHtml.isMarked(html);
  const isPlainTextHtml = !isInternal && Newlines.isPlainText(content);
  const isAbsoluteUrl = SmartPaste.isAbsoluteUrl(content);

  // If the paste bin is empty try using plain text mode since that is better than nothing right?
  // Also if we got nothing from clipboard API/pastebin or the content is a plain text (with only
  // some BRs, Ps or DIVs as newlines) then we fallback to plain/text
  if (isDefaultPasteBinContent(content) || !content.length || (isPlainTextHtml && !isAbsoluteUrl)) {
    plainTextMode = true;
  }

  // Grab plain text from Clipboard API or convert existing HTML to plain text
  if (plainTextMode || isAbsoluteUrl) {
    // Use plain text contents from Clipboard API unless the HTML contains paragraphs then
    // we should convert the HTML to plain text since works better when pasting HTML/Word contents as plain text
    if (hasContentType(clipboardContent, 'text/plain') && isPlainTextHtml) {
      content = clipboardContent['text/plain'];
    } else {
      content = PasteUtils.innerText(content);
    }
  }

  // If the content is the paste bin default HTML then it was impossible to get the clipboard data out.
  if (isDefaultPasteBinContent(content)) {
    return;
  }

  if (plainTextMode) {
    pasteText(editor, content);
  } else {
    // Remove base64 data that is useless, but takes a lot of space
    content = content.replace(/o:gfxdata="[^"]*"/g, '');

    // Convert ms word lists to <ul> and <ol>
    content = content.replace(/<!\[if !supportLists\]>(.|[\r\n])*?<!\[endif\]>/g, (str) => {
      return str.includes('mso-bidi-theme-font') ? '<begin-ol-li />' : '<begin-ul-li />';
    });
    content = content.replace(/<p class=MsoListParagraph\b[^>]*(level[0-9]+\b)[^>]*><begin-ol-li \/>((.|[\r\n])*?)<\/p>/g, '<ol><li $1>$2</li></ol>');
    content = content.replace(/<p class=MsoListParagraph\b[^>]*(level[0-9]+\b)[^>]*><begin-ul-li \/>((.|[\r\n])*?)<\/p>/g, '<ul><li $1>$2</li></ul>');
    content = content.replace(/<p class=MsoListParagraphCxSpFirst[^>]*(level[0-9]+\b)[^>]*><begin-ol-li \/>((.|[\r\n])*?)<\/p>/g, '<custom-ol><li $1>$2</li>');
    content = content.replace(/<p class=MsoListParagraphCxSpFirst[^>]*(level[0-9]+\b)[^>]*><begin-ul-li \/>((.|[\r\n])*?)<\/p>/g, '<custom-ul><li $1>$2</li>');
    content = content.replace(/<p class=MsoListParagraphCxSpLast[^>]*(level[0-9]+\b)[^>]*><begin-ol-li \/>((.|[\r\n])*?)<\/p>/g, '<li $1>$2</li></custom-ol>');
    content = content.replace(/<p class=MsoListParagraphCxSpLast[^>]*(level[0-9]+\b)[^>]*><begin-ul-li \/>((.|[\r\n])*?)<\/p>/g, '<li $1>$2</li></custom-ul>');
    content = content.replace(/<p class=MsoListParagraphCxSpMiddle[^>]*(level[0-9]+\b)[^>]*><begin-ul-li \/>((.|[\r\n])*?)<\/p>/g, '<li $1>$2</li>');
    content = content.replace(/<p class=MsoListParagraphCxSpMiddle[^>]*(level[0-9]+\b)[^>]*><begin-ol-li \/>((.|[\r\n])*?)<\/p>/g, '<li $1>$2</li>');
    content = content.replace(/<span(\s)lang=EN-US style='mso-ansi-language:EN-US'>/g, '');
    content = content.replace(/<o:p><\/o:p><\/span>/g, '');
    let currLevel = 1;
    content = content.replace(/<custom-(u|o)l>((.|[\r\n])*?)<\/custom-(u|o)l>/g, (_str, type, inner) => {
      const lis = inner.split('</li>').filter((s) => s.trim().length > 0).map((s) => {
        s = s.trim() + '</li>';
        const level = parseInt(s.replace(/^((.|[\r\n])*?)level([0-9]+)\b((.|[\r\n])*?)$/g, '$3'), 10);
        const liStr = s.replace(/ level[0-9]+\b/g, '');
        if (level > currLevel) {
          currLevel = level;
          return `<${type}l>${liStr}`;
        }
        if (level < currLevel) {
          currLevel = level;
          return `${liStr}</${type}l>`;
        }
        return liStr;
      });
      return `<${type}l>${lis.join('\n')}</${type}l>`;
    });

    pasteHtml(editor, content, isInternal);
  }
};

const registerEventHandlers = (editor: Editor, pasteBin: PasteBin, pasteFormat: Cell<string>): void => {
  let keyboardPastePlainTextState: boolean;

  const getLastRng = (): Range =>
    pasteBin.getLastRng() || editor.selection.getRng();

  editor.on('keydown', (e) => {
    if (isKeyboardPasteEvent(e) && !e.isDefaultPrevented()) {
      keyboardPastePlainTextState = e.shiftKey && e.keyCode === 86;
    }
  });

  editor.on('paste', async (e: EditorEvent<ClipboardEvent>) => {
    if (e.isDefaultPrevented() || isBrokenAndroidClipboardEvent(e)) {
      return;
    }

    const plainTextMode = pasteFormat.get() === 'text' || keyboardPastePlainTextState;
    keyboardPastePlainTextState = false;
    const overrideGetClipboardData = typeof (Options.overrideGetClipboardData(editor)) === 'function' ? Options.overrideGetClipboardData(editor) : undefined;
    const clipboardContent = overrideGetClipboardData ? (await overrideGetClipboardData(e)) : getDataTransferItems(e.clipboardData);

    if (!hasHtmlOrText(clipboardContent) && pasteImageData(editor, e, getLastRng())) {
      return;
    }

    // If the clipboard API has HTML then use that directly
    if (hasContentType(clipboardContent, 'text/html')) {
      e.preventDefault();
      insertClipboardContent(editor, clipboardContent, clipboardContent['text/html'], plainTextMode);
    } else {
      // We can't extract the HTML content from the clipboard so we need to allow the paste
      // to run via the pastebin and then extract from there
      pasteBin.create();
      Delay.setEditorTimeout(editor, () => {
        // Get the pastebin content and then remove it so the selection is restored
        const html = pasteBin.getHtml();
        pasteBin.remove();
        insertClipboardContent(editor, clipboardContent, html, plainTextMode);
      }, 0);
    }
  });
};

const registerDataImageFilter = (editor: Editor) => {
  const isWebKitFakeUrl = (src: string): boolean => Strings.startsWith(src, 'webkit-fake-url');
  const isDataUri = (src: string): boolean => Strings.startsWith(src, 'data:');
  const isPasteInsert = (args: ParserArgs): boolean => args.data?.paste === true;

  // Remove all data images from paste for example from Gecko
  // except internal images like video elements
  editor.parser.addNodeFilter('img', (nodes, name, args) => {
    if (!Options.shouldPasteDataImages(editor) && isPasteInsert(args)) {
      for (const node of nodes) {
        const src = node.attr('src');
        if (Type.isString(src) && !node.attr('data-mce-object') && src !== Env.transparentSrc) {
          // Safari on Mac produces webkit-fake-url see: https://bugs.webkit.org/show_bug.cgi?id=49141
          if (isWebKitFakeUrl(src)) {
            node.remove();
          } else if (!Options.shouldAllowHtmlDataUrls(editor) && isDataUri(src)) {
            node.remove();
          }
        }
      }
    }
  });
};

/*
 * This class contains logic for getting HTML contents out of the clipboard.
 *
 * This by default will attempt to use the W3C clipboard API to get HTML content.
 * If that can't be used then fallback to letting the browser paste natively with
 * some logic to clean up what the browser generated, as it can mutate the content.
 *
 * Current implementation steps:
 *  1. On keydown determine if we should paste as plain text.
 *  2. Wait for the browser to fire a "paste" event and get the contents out of clipboard.
 *  3. If no content is available, then attach the paste bin and change the selection to be inside the bin.
 *  4. Extract the contents from the bin in the next event loop.
 *  5. If no HTML is found or we're using plain text paste mode then convert the HTML or lookup the clipboard to get the plain text.
 *  6. Process the content from the clipboard or pastebin and insert it into the editor.
 */

const registerEventsAndFilters = (editor: Editor, pasteBin: PasteBin, pasteFormat: Cell<string>): void => {
  registerEventHandlers(editor, pasteBin, pasteFormat);
  registerDataImageFilter(editor);
};

export {
  registerEventsAndFilters,
  pasteHtml,
  pasteText,
  pasteImageData,
  getDataTransferItems,
  hasHtmlOrText,
  hasContentType
};
