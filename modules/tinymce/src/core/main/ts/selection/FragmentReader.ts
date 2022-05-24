import { Arr, Fun, Obj, Optional, Strings } from '@ephox/katamari';
import { Compare, Css, Insert, Replication, SelectorFind, SugarElement, SugarFragment, SugarNode, Traverse } from '@ephox/sugar';

import { Editor } from '../api/PublicApi';
import * as ElementType from '../dom/ElementType';
import * as Parents from '../dom/Parents';
import * as SelectionUtils from './SelectionUtils';
import * as SimpleTableModel from './SimpleTableModel';
import * as TableCellSelection from './TableCellSelection';

const findParentListContainer = (parents: SugarElement[]): Optional<SugarElement<HTMLLIElement | HTMLOListElement>> =>
  Arr.find(parents, (elm) => SugarNode.name(elm) === 'ul' || SugarNode.name(elm) === 'ol');

const getFullySelectedListWrappers = (parents: SugarElement<Node>[], rng: Range) =>
  Arr.find(parents, (elm) => SugarNode.name(elm) === 'li' && SelectionUtils.hasAllContentsSelected(elm, rng)).fold(
    Fun.constant([]),
    (_li) =>
      findParentListContainer(parents).map((listCont) => {
        const listElm = SugarElement.fromTag(SugarNode.name(listCont));
        // Retain any list-style* styles when generating the new fragment
        const listStyles = Obj.filter(Css.getAllRaw(listCont), (_style, name) => Strings.startsWith(name, 'list-style'));
        Css.setAll(listElm, listStyles);
        return [
          SugarElement.fromTag('li'),
          listElm
        ];
      }).getOr([])
  );

const wrap = (innerElm: SugarElement<Node>, elms: SugarElement<Node>[]) => {
  const wrapped = Arr.foldl(elms, (acc, elm) => {
    Insert.append(elm, acc);
    return elm;
  }, innerElm);
  return elms.length > 0 ? SugarFragment.fromElements([ wrapped ]) : wrapped;
};

const directListWrappers = (commonAnchorContainer: SugarElement<Node>) => {
  if (ElementType.isListItem(commonAnchorContainer)) {
    return Traverse.parent(commonAnchorContainer).filter(ElementType.isList).fold(
      Fun.constant([]),
      (listElm) => [ commonAnchorContainer, listElm ]
    );
  } else {
    return ElementType.isList(commonAnchorContainer) ? [ commonAnchorContainer ] : [ ];
  }
};

const getWrapElements = (editor: Editor, rootNode: SugarElement<Node>, rng: Range) => {
  const commonAnchorContainer = SugarElement.fromDom(rng.commonAncestorContainer);
  const parents = Parents.parentsAndSelf(commonAnchorContainer, rootNode);

  const allowedElements = Arr.foldl(editor.formatter.get('preserve_on_copy'), (acc, formatter: any) =>
    acc.concat(formatter.selector.split(','))
  , []);
  const wrapElements = Arr.filter(parents, (elm) => ElementType.isInList(allowedElements, elm) || ElementType.isInline(elm) || ElementType.isHeading(elm));

  const listWrappers = getFullySelectedListWrappers(parents, rng);
  const allWrappers = wrapElements.concat(listWrappers.length ? listWrappers : directListWrappers(commonAnchorContainer));
  return Arr.map(allWrappers, Replication.shallow);
};

const emptyFragment = () => SugarFragment.fromElements([]);

const getFragmentFromRange = (editor: Editor, rootNode: SugarElement<Node>, rng: Range) =>
  wrap(SugarElement.fromDom(rng.cloneContents()), getWrapElements(editor, rootNode, rng));

const getParentTable = (rootElm: SugarElement<Node>, cell: SugarElement<HTMLTableCellElement>): Optional<SugarElement<HTMLTableElement>> =>
  SelectorFind.ancestor(cell, 'table', Fun.curry(Compare.eq, rootElm));

const getTableFragment = (rootNode: SugarElement<Node>, selectedTableCells: SugarElement<HTMLTableCellElement>[]) =>
  getParentTable(rootNode, selectedTableCells[0]).bind((tableElm) => {
    const firstCell = selectedTableCells[0];
    const lastCell = selectedTableCells[selectedTableCells.length - 1];
    const fullTableModel = SimpleTableModel.fromDom(tableElm);

    return SimpleTableModel.subsection(fullTableModel, firstCell, lastCell).map((sectionedTableModel) =>
      SugarFragment.fromElements([ SimpleTableModel.toDom(sectionedTableModel) ])
    );
  }).getOrThunk(emptyFragment);

const getSelectionFragment = (editor: Editor, rootNode: SugarElement<Node>, ranges: Range[]) =>
  ranges.length > 0 && ranges[0].collapsed ? emptyFragment() : getFragmentFromRange(editor, rootNode, ranges[0]);

const read = (editor: Editor, rootNode: SugarElement<Node>, ranges: Range[]) => {
  const selectedCells = TableCellSelection.getCellsFromElementOrRanges(ranges, rootNode);
  return selectedCells.length > 0 ? getTableFragment(rootNode, selectedCells) : getSelectionFragment(editor, rootNode, ranges);
};

export {
  read
};
