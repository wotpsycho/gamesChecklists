import { VALUE } from "../../utilities";
import { RootNode } from "./RootNode";

/**
 * CheckedRootNode - Root node for items that start as CHECKED/INITIAL
 * Always controlled and available
 */
export class CheckedRootNode extends RootNode {
  toControlledFormula() {
    return VALUE.TRUE;
  }

  isControlled() {
    return true;
  }
}
