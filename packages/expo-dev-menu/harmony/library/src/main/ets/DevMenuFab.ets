import { ExpoModuleError } from '@expo-harmony/expo-modules-core';
import { ComponentContent, UIContext, window } from '@kit.ArkUI';
import { DevMenuFabModel } from './DevMenuFabModel';
import { FabBounds, FabInsets, FabPoint } from './DevMenuFabGeometry';
import { DevMenuPreferences } from './DevMenuPreferences';

@Component
struct DevMenuFabView {
  @ObjectLink model: DevMenuFabModel;
  onArea: (area: Area) => void = (_area: Area): void => {};

  build(): void {
    Stack({ alignContent: Alignment.TopStart }) {
      if (this.model.rendered) {
        Button({ type: ButtonType.Normal, stateEffect: false }) {
          Column() {
            Stack() {
              Stack()
                .width(44)
                .height(44)
                .backgroundColor(this.model.blue)
                .borderRadius(22)
              Image($r('app.media.expo_dev_menu_gear_fill'))
                .width(26)
                .height(26)
                .objectFit(ImageFit.Contain)
                .draggable(false)
            }
            .width(52)
            .height(52)
            .border({ width: 4, color: this.model.blueBorder, radius: 26 })
            .shadow({ radius: 8, color: '#66000000', offsetX: 0, offsetY: 4 })
            Text('Tools')
              .fontSize(11)
              .fontWeight(600)
              .fontColor(Color.Black)
              .padding({ left: 10, right: 10, top: 4, bottom: 4 })
              .backgroundColor(Color.White)
              .borderRadius(50)
              .margin({ top: 6 })
              .shadow({ radius: 4, color: '#33000000', offsetX: 0, offsetY: 2 })
              .opacity(this.model.labelAlpha)
              .scale({ x: this.model.labelScale, y: this.model.labelScale })
              .accessibilityLevel('no')
          }
          .width(72)
          .height(94)
          .scale({ x: this.model.scale, y: this.model.scale })
          .opacity(this.model.idleAlpha)
        }
        .id('expo-dev-menu-fab-hit-area')
        .width(72)
        .height(94)
        .padding(0)
        .backgroundColor(Color.Transparent)
        .borderRadius(0)
        .clip(false)
        .accessibilityText('Tools')
        .accessibilityDescription('Open development menu')
        .position({ x: this.model.x + 16, y: this.model.y + 16 })
        .opacity(this.model.alpha)
        .hitTestBehavior(this.model.interactive ? HitTestMode.Default : HitTestMode.None)
        .accessibilityLevel(this.model.interactive ? 'yes' : 'no-hide-descendants')
        .onTouch((event: TouchEvent): void => this.model.touch(event))
        .onClick((event: ClickEvent): void => this.model.click(event));
      }
    }
    .width('100%')
    .height('100%')
    .hitTestBehavior(HitTestMode.Transparent)
    .onAreaChange((_old: Area, area: Area): void => this.onArea(area));
  }
}

class DevMenuFabViewProps {
  readonly model: DevMenuFabModel;
  readonly onArea: (area: Area) => void;
  constructor(model: DevMenuFabModel, onArea: (area: Area) => void) {
    this.model = model;
    this.onArea = onArea;
  }
}

@Builder
function buildDevMenuFab(props: DevMenuFabViewProps): void {
  // Both full-screen nodes must pass through touches outside the FAB's 72x94 hit area.
  DevMenuFabView({ model: props.model, onArea: props.onArea }).hitTestBehavior(HitTestMode.Transparent);
}

export class DevMenuFab {
  private readonly model: DevMenuFabModel;
  private content?: ComponentContent<DevMenuFabViewProps>;
  private ui?: UIContext;
  private window?: window.Window;
  private area?: Area;
  private readonly avoidChanged = (): void => this.updateBounds();

  constructor(preferences: DevMenuPreferences, open: () => void) {
    this.model = new DevMenuFabModel(preferences, open);
  }

  attach(ui: UIContext): void {
    if (this.content !== undefined) return;

    const name = ui.getWindowName();
    if (name === undefined) throw new Error('Expo Dev Menu FAB requires a mounted window.');
    this.ui = ui;
    this.model.ui = ui;
    this.model.onHidden = (): void => {
      if (this.content !== undefined) this.ui?.getOverlayManager().hideComponentContent(this.content);
    };
    try {
      this.window = window.findWindow(name);
      this.window.on('avoidAreaChange', this.avoidChanged);

      const content = new ComponentContent<DevMenuFabViewProps>(
        ui,
        wrapBuilder(buildDevMenuFab),
        new DevMenuFabViewProps(this.model, (area: Area): void => {
          this.area = area;
          this.updateBounds();
        }),
      );
      // Own the node before attaching so failures at any later step can release it.
      this.content = content;
      ui.getOverlayManager().addComponentContent(content);
      ui.getOverlayManager().hideComponentContent(content);
    } catch (error) {
      try {
        this.dispose();
      } catch (failure) {
        console.warn(`Expo Dev Menu FAB cleanup failed: ${String(failure)}`);
      }
      throw new ExpoModuleError(
        error instanceof ExpoModuleError ? error.code : 'ERR_DEV_MENU_WINDOW',
        error instanceof Error ? error.message : String(error),
        error as Object,
      );
    }
  }

  setVisible(visible: boolean, menuOpen: boolean = false): void {
    // Keep the overlay mounted for exit animations. Empty/full-screen wrappers remain transparent.
    if (visible && this.content !== undefined) this.ui?.getOverlayManager().showComponentContent(this.content);
    this.model.setVisible(visible, menuOpen);
  }

  private updateBounds(): void {
    const ui = this.ui;
    const target = this.window;
    const area = this.area;
    if (ui === undefined || target === undefined || area === undefined) return;

    const rect = target.getWindowProperties().windowRect;
    const origin = new FabPoint(Number(area.globalPosition.x) - ui.px2vp(rect.left), Number(area.globalPosition.y) - ui.px2vp(rect.top));
    const width = Number(area.width);
    const height = Number(area.height);
    const insets = new FabInsets();
    for (const type of [window.AvoidAreaType.TYPE_SYSTEM, window.AvoidAreaType.TYPE_CUTOUT, window.AvoidAreaType.TYPE_NAVIGATION_INDICATOR]) {
      const avoid = target.getWindowAvoidArea(type);
      insets.top = Math.max(insets.top, ui.px2vp(avoid.topRect.height) - origin.y);
      insets.left = Math.max(insets.left, ui.px2vp(avoid.leftRect.width) - origin.x);
      insets.bottom = Math.max(insets.bottom, ui.px2vp(avoid.bottomRect.height) - (ui.px2vp(rect.height) - origin.y - height));
      insets.right = Math.max(insets.right, ui.px2vp(avoid.rightRect.width) - (ui.px2vp(rect.width) - origin.x - width));
    }
    this.model.origin = origin;
    this.model.updateBounds(new FabBounds(width, height, insets));
  }

  updateConfiguration(): void {
    this.content?.updateConfiguration();
    this.updateBounds();
  }

  dispose(): void {
    this.model.detach();

    const content = this.content;
    this.content = undefined;
    try {
      this.window?.off('avoidAreaChange', this.avoidChanged);
    } finally {
      this.window = undefined;
      try {
        if (content !== undefined) this.ui?.getOverlayManager().removeComponentContent(content);
      } finally {
        content?.dispose();
        this.ui = undefined;
        this.area = undefined;
      }
    }
  }
}
