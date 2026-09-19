export const REGISTERED_CALLBACK_EVENT: string = 'registeredCallbackFired';

export class DevMenuCallback {
  readonly name: string;
  readonly shouldCollapse: boolean;

  constructor(name: string, shouldCollapse: boolean) {
    this.name = name;
    this.shouldCollapse = shouldCollapse;
  }
}

export type DevMenuAction = () => void | Promise<void>;

export class DevMenuDialogItem {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly shouldCollapse: boolean;
  readonly action: DevMenuAction;
  readonly enabled: boolean;

  constructor(id: string, title: string, detail: string, shouldCollapse: boolean, action: DevMenuAction, enabled: boolean = true) {
    this.id = id;
    this.title = title;
    this.detail = detail;
    this.shouldCollapse = shouldCollapse;
    this.action = action;
    this.enabled = enabled;
  }
}
