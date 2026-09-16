import { common } from '@kit.AbilityKit';
import { ComponentContent } from '@kit.ArkUI';
import { ExpoUpdatesError, Json } from './UpdatesProtocol';
import { isRecord } from './UpdatesJson';

class ReloadAppearance {
  color: string = '#ffffff';
  image: string = '';
  width: number | string = '100%';
  height: number | string = '100%';
  fit: ImageFit = ImageFit.Contain;
  spinner: boolean = true;
  tint: string = '#007aff';
  size: number = 48;
  opacity: number = 1;
  fullscreen: boolean = false;
  failed?: () => void;

  constructor(options: Json) {
    if (
      (options.backgroundColor != null && typeof options.backgroundColor !== 'string') ||
      (options.imageFullScreen != null && typeof options.imageFullScreen !== 'boolean') ||
      (options.fade != null && typeof options.fade !== 'boolean') ||
      (options.imageResizeMode != null && !['contain', 'cover', 'center', 'stretch'].includes(options.imageResizeMode))
    ) {
      throw new ExpoUpdatesError('ERR_UPDATES_ARGUMENT', 'Invalid reload screen appearance.');
    }
    if (
      options.image != null &&
      (!isRecord(options.image) ||
        (options.image.url != null && typeof options.image.url !== 'string') ||
        ['width', 'height', 'scale'].some((key: string): boolean => options.image[key] != null && !Number.isFinite(options.image[key])))
    ) {
      throw new ExpoUpdatesError('ERR_UPDATES_ARGUMENT', 'A reload image requires a URL string and finite dimensions.');
    }
    if (
      options.spinner != null &&
      (!isRecord(options.spinner) ||
        (options.spinner.enabled != null && typeof options.spinner.enabled !== 'boolean') ||
        (options.spinner.color != null && typeof options.spinner.color !== 'string') ||
        (options.spinner.size != null && !['small', 'medium', 'large'].includes(options.spinner.size)))
    ) {
      throw new ExpoUpdatesError('ERR_UPDATES_ARGUMENT', 'Invalid reload spinner configuration.');
    }

    this.color = options.backgroundColor ?? '#ffffff';
    const image: ESObject = options.image;
    this.image = image?.url ?? '';
    this.fullscreen = options.imageFullScreen === true;
    if (!this.fullscreen && image?.width > 0 && image?.height > 0) {
      this.width = image.width * (image.scale ?? 1);
      this.height = image.height * (image.scale ?? 1);
    }
    this.fit =
      options.imageResizeMode === 'cover'
        ? ImageFit.Cover
        : options.imageResizeMode === 'center'
          ? ImageFit.None
          : options.imageResizeMode === 'stretch'
            ? ImageFit.Fill
            : ImageFit.Contain;
    this.spinner = options.spinner?.enabled ?? image == null;
    this.tint = options.spinner?.color ?? '#007aff';
    this.size = options.spinner?.size === 'small' ? 24 : options.spinner?.size === 'large' ? 72 : 48;
  }
}

@Builder
function reloadContent(value: ReloadAppearance) {
  Stack() {
    if (value.image.length > 0) {
      Image(value.image)
        .width(value.width)
        .height(value.height)
        .objectFit(value.fit)
        .onError((): void => value.failed?.());
    }
    if (value.spinner) {
      LoadingProgress()
        .width(value.size)
        .height(value.size)
        .color(value.tint);
    }
  }
  .width('100%')
  .height('100%')
  .backgroundColor(value.fullscreen && value.image.length > 0 ? Color.Transparent : value.color)
  .opacity(value.opacity)
  .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM]);
}

class ReloadOverlay {
  readonly content: ComponentContent<ReloadAppearance>;
  readonly appearance: ReloadAppearance;
  readonly fade: boolean;

  constructor(content: ComponentContent<ReloadAppearance>, appearance: ReloadAppearance, fade: boolean) {
    this.content = content;
    this.appearance = appearance;
    this.fade = fade;
  }
}

export class UpdatesReloadScreen {
  private static readonly overlays = new Map<common.UIAbilityContext, ReloadOverlay>();

  static show(context: common.UIAbilityContext, options: Json): void {
    if (UpdatesReloadScreen.overlays.has(context)) return;
    const appearance = new ReloadAppearance(options);

    const ui = context.windowStage.getMainWindowSync().getUIContext();
    const content = new ComponentContent<ReloadAppearance>(ui, wrapBuilder(reloadContent), appearance);
    const overlay = new ReloadOverlay(content, appearance, options.fade === true);
    appearance.failed = (): void => {
      if (UpdatesReloadScreen.overlays.get(context) !== overlay) return;
      appearance.image = '';
      appearance.spinner = true;
      content.update(appearance);
    };
    try {
      ui.getOverlayManager().addComponentContent(content);
      UpdatesReloadScreen.overlays.set(context, overlay);
    } catch (error) {
      content.dispose();
      throw new ExpoUpdatesError('ERR_UPDATES_RELOAD_SCREEN', `Unable to show the reload screen: ${String(error)}`);
    }
  }

  static hide(context: common.UIAbilityContext): void {
    const overlay = UpdatesReloadScreen.overlays.get(context);
    if (!overlay) return;
    if (!overlay.fade) {
      UpdatesReloadScreen.remove(context);
      return;
    }

    context.windowStage
      .getMainWindowSync()
      .getUIContext()
      .animateTo(
        {
          duration: 300,
          onFinish: (): void => {
            if (UpdatesReloadScreen.overlays.get(context) === overlay) UpdatesReloadScreen.remove(context);
          },
        },
        (): void => {
          overlay.appearance.opacity = 0;
          overlay.content.update(overlay.appearance);
        },
      );
  }

  private static remove(context: common.UIAbilityContext): void {
    const overlay = UpdatesReloadScreen.overlays.get(context);
    if (!overlay) return;
    try {
      context.windowStage.getMainWindowSync().getUIContext().getOverlayManager().removeComponentContent(overlay.content);
    } finally {
      overlay.content.dispose();
      UpdatesReloadScreen.overlays.delete(context);
    }
  }
}
