import { AlloyBehaviourRecord } from '../../api/behaviour/Behaviour';
import { SketchBehaviours } from '../../api/component/SketchBehaviours';
import { AlloySpec, LooseSpec, RawDomSchema } from '../../api/component/SpecTypes';
import { SingleSketch, SingleSketchDetail, SingleSketchSpec } from '../../api/ui/Sketcher';
import { AlloyComponent } from 'ephox/alloy/api/component/ComponentApi';
import { Option } from '@ephox/katamari';
import { MenuSpec } from './MenuTypes';

export interface TieredMenuDetail extends SingleSketchDetail {
  uid: () => string;
  // FIX: Completed DOM tpye.
  dom: () => any;
  components: () => AlloySpec[ ];
  tmenuBehaviours: () => SketchBehaviours;

  fakeFocus: () => boolean;
  onHighlight: () => (comp: AlloyComponent, target: AlloyComponent) => void;

  markers: () => {
    item: () => string;
    menu: () => string;
    backgroundMenu: () => string;
    selectedMenu: () => string;
    selectedItem: () => string;
  }

  onEscape: () => (comp: AlloyComponent, item: AlloyComponent) => Option<boolean>;
  onExecute: () => (comp: AlloyComponent, item: AlloyComponent) => Option<boolean>;
  onOpenMenu: () => (comp: AlloyComponent, menu: AlloyComponent) => void;
  onOpenSubmenu: () => (comp: AlloyComponent, item: AlloyComponent, activeMenu: AlloyComponent) => void;
  onCollapseMenu: () => (comp: AlloyComponent, item: AlloyComponent, activeMenu: AlloyComponent) => void;
  onHover: () => (comp: AlloyComponent, item: AlloyComponent) => void;

  navigateOnHover: () => boolean;
  openImmediately: () => boolean;

  stayInDom: () => boolean;

  eventOrder: () => Record<string, string[]>;


  data: () => {
    primary: () => string;
    expansions: () => Record<string, string>;
    menus: () => Record<string, PartialMenuSpec>;
  }
}

export interface TieredMenuSpec extends SingleSketchSpec {
  uid?: string;
  dom: RawDomSchema;
  components?: AlloySpec[];
  tmenuBehaviours?: AlloyBehaviourRecord;

  markers: {
    item: string;
    selectedItem: string;
  }
}

export type TieredMenuRecord = Record<string, PartialMenuSpec>;

export interface TieredData {
  primary: string;
  menus: TieredMenuRecord;
  expansions: Record<string, string>;
}

export type ItemSpec = { value: string; text: string };

export type PartialMenuSpec = Partial<MenuSpec>;

export interface TieredMenuSketcher extends SingleSketch<TieredMenuSpec, TieredMenuDetail> {
  collapseMenu: (menu: any) => void;
  tieredData: (primary: string, menus, expansions: Record<string, string>) => TieredData;
  singleData: (name: string, menu: PartialMenuSpec) => TieredData;
  collapseItem: (text: string) => ItemSpec;
}