import { ExpoModuleError, ExpoView, ExpoViewContext, ExpoViewContentContext } from '@expo-harmony/expo-modules-core';
import { common } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { VideoObserver, VideoPlayer } from './VideoPlayer';

export interface FullscreenOptions {
  enable?: boolean;
  orientation?: string;
  autoExitOnRotate?: boolean;
}

export interface ButtonOptions {
  showNext?: boolean;
  showPrevious?: boolean;
  showSeekForward?: boolean;
  showSeekBackward?: boolean;
  showSubtitles?: boolean | null;
  showSettings?: boolean;
  showPlayPause?: boolean;
  showBottomBar?: boolean;
}

export interface ContentPosition {
  dx?: number;
  dy?: number;
}

export class VideoScreenOn {
  private holders: Set<VideoView> = new Set<VideoView>();
  private tail: Promise<void> = Promise.resolve();
  private target?: window.Window;
  private original: boolean = false;
  private retry: boolean = false;
  private readonly context: common.UIAbilityContext;

  constructor(context: common.UIAbilityContext) {
    this.context = context;
  }

  update(view: VideoView, enabled: boolean): void {
    if (this.holders.has(view) === enabled && !this.retry) return;

    this.retry = false;
    if (enabled) this.holders.add(view);
    else this.holders.delete(view);

    this.tail = this.tail
      .then(async (): Promise<void> => {
        this.retry = false;
        if (this.holders.size > 0 && !this.target) {
          const target = await window.getLastWindow(this.context);
          const original = target.getWindowProperties().isKeepScreenOn;
          this.target = target;
          this.original = original;
        }
        if (!this.target) return;

        const held = this.holders.size > 0;
        await this.target.setWindowKeepScreenOn(held || this.original);

        // A holder may disappear during the await. Keep the window until the queued
        // update has actually restored its original setting.
        if (!held) this.target = undefined;
      })
      .catch((error: Error): void => {
        this.retry = true;
        console.warn(`ExpoVideo: keep-screen-on failed: ${error.message}`);
      });
  }
}

@Observed
export class VideoView extends ExpoView implements VideoObserver {
  player: VideoPlayer | null = null;
  nativeControls: boolean = true;
  contentFit: string = 'contain';
  contentPosition: ContentPosition = {};
  fullscreenOptions: FullscreenOptions = { enable: true };
  buttonOptions: ButtonOptions = {};
  requiresLinearPlayback: boolean = false;
  showsTimecodes: boolean = true;
  fullscreen: boolean = false;
  playing: boolean = false;
  position: number = 0;
  duration: number = 0;
  isLive: boolean = false;
  subtitle: string = '';
  videoWidth: number = 0;
  videoHeight: number = 0;
  private surface?: string;
  private destroyed: boolean = false;
  private announced: boolean = false;
  private readonly screen: VideoScreenOn;

  constructor(context: ExpoViewContext, screen: VideoScreenOn) {
    super(context);
    this.screen = screen;
  }

  setPlayer(player: VideoPlayer | null): void {
    if (player === this.player) return;

    // Attaching can fail; keep the current player connected until it succeeds.
    if (this.surface) player?.attachSurface(this, this.surface);
    if (this.surface) this.player?.detachSurface(this, this.surface);
    this.player?.removeObserver(this);
    this.player = player;
    player?.addObserver(this);

    this.update();
  }

  update(): void {
    if (this.destroyed) return;

    this.playing = this.player?.playing ?? false;
    this.position = this.player?.currentTime ?? 0;
    this.duration = this.player?.duration ?? 0;
    this.isLive = this.player?.isLive ?? false;
    this.subtitle = this.player?.subtitle ?? '';
    this.videoWidth = this.player?.width ?? 0;
    this.videoHeight = this.player?.height ?? 0;

    this.screen.update(this, this.playing && (this.player?.keepScreenOnWhilePlaying ?? false));
  }

  firstFrame(): void {
    if (!this.destroyed) this.sendEvent('onFirstFrameRender');
  }

  attach(surface: string): void {
    if (this.destroyed) return;

    this.surface = surface;
    this.player?.attachSurface(this, surface);
  }

  detach(surface: string): void {
    this.player?.detachSurface(this, surface);
    if (this.surface === surface) this.surface = undefined;
  }

  enterFullscreen(): void {
    if (this.destroyed) throw new ExpoModuleError('ERR_VIDEO_VIEW_DESTROYED', 'The VideoView has been destroyed.');
    if (this.fullscreenOptions.enable === false) throw new ExpoModuleError('ERR_VIDEO_FULLSCREEN_DISABLED', 'Fullscreen is disabled.');

    this.fullscreen = true;
  }

  exitFullscreen(): void {
    this.fullscreen = false;
  }

  didEnterFullscreen(): void {
    if (this.destroyed || this.announced) return;

    this.announced = true;
    this.sendEvent('onFullscreenEnter');
  }

  didExitFullscreen(): void {
    this.fullscreen = false;
    if (!this.announced) return;
    this.announced = false;
    if (!this.destroyed) this.sendEvent('onFullscreenExit');
  }

  setButtonOptions(value: ButtonOptions): void {
    if (value.showNext || value.showPrevious || value.showSubtitles || value.showSettings)
      throw new ExpoModuleError(
        'ERR_VIDEO_UNSUPPORTED',
        'Next/previous, subtitle and settings buttons are not supported by expo-video on HarmonyOS.',
      );

    this.buttonOptions = value;
  }

  setFullscreenOptions(value: FullscreenOptions): void {
    if (value.orientation && value.orientation !== 'default')
      throw new ExpoModuleError('ERR_VIDEO_UNSUPPORTED', 'Forced fullscreen orientation is not supported by expo-video on HarmonyOS.');
    if (value.autoExitOnRotate === true)
      throw new ExpoModuleError('ERR_VIDEO_UNSUPPORTED', 'autoExitOnRotate is not supported by expo-video on HarmonyOS.');

    this.fullscreenOptions = value;
  }

  destroy(): void {
    if (this.destroyed) return;

    this.destroyed = true;
    if (this.surface) this.player?.detachSurface(this, this.surface);
    this.player?.removeObserver(this);
    this.player = null;
    this.fullscreen = false;

    this.screen.update(this, false);
  }
}
@Builder
export function buildVideoView(context: ExpoViewContentContext) {
  VideoViewContent({ state: context.nativeView as VideoView });
}

@Component
struct VideoViewContent {
  @ObjectLink state: VideoView;

  @Builder fullscreenContent() {
    VideoSurface({ state: this.state, inFullscreen: true })
      .onAppear((): void => this.state.didEnterFullscreen())
      .onDisAppear((): void => this.state.didExitFullscreen());
  }

  build() {
    Stack() {
      if (!this.state.fullscreen) {
        VideoSurface({ state: this.state });
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor(Color.Black)
    .bindContentCover(this.state.fullscreen, this.fullscreenContent, {
      modalTransition: ModalTransition.NONE,
      onWillDismiss: (action: DismissContentCoverAction): void => {
        this.state.exitFullscreen();
        action.dismiss();
      },
      onDisappear: (): void => this.state.didExitFullscreen(),
    });
  }
}

@Component
struct VideoSurface {
  @ObjectLink state: VideoView;
  inFullscreen: boolean = false;
  private controller: XComponentController = new XComponentController();
  private surface: string = '';
  @State areaWidth: number = 0;
  @State areaHeight: number = 0;
  @State seeking: boolean = false;
  @State seekValue: number = 0;

  private surfaceWidth(): number {
    if (!this.state.videoWidth || !this.state.videoHeight) return this.areaWidth;

    const ratio = this.state.videoWidth / this.state.videoHeight;

    return this.state.contentFit === 'cover' ? Math.max(this.areaWidth, this.areaHeight * ratio) : Math.min(this.areaWidth, this.areaHeight * ratio);
  }

  private surfaceHeight(): number {
    if (!this.state.videoWidth || !this.state.videoHeight) return this.areaHeight;

    return (this.surfaceWidth() * this.state.videoHeight) / this.state.videoWidth;
  }

  private timecode(seconds: number): string {
    const time = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(time / 60);

    return `${minutes}:${String(time % 60).padStart(2, '0')}`;
  }

  aboutToDisappear(): void {
    if (this.surface) this.state.detach(this.surface);
  }

  build() {
    Stack({ alignContent: Alignment.Bottom }) {
      Stack({ alignContent: Alignment.Center }) {
        XComponent({ type: XComponentType.SURFACE, controller: this.controller })
          .width(this.surfaceWidth())
          .height(this.surfaceHeight())
          .scale({
            x: this.state.contentFit === 'fill' && this.surfaceWidth() > 0 ? this.areaWidth / this.surfaceWidth() : 1,
            y: this.state.contentFit === 'fill' && this.surfaceHeight() > 0 ? this.areaHeight / this.surfaceHeight() : 1,
          })
          .translate({ x: this.state.contentPosition.dx ?? 0, y: this.state.contentPosition.dy ?? 0 })
          .onLoad((): void => {
            this.surface = this.controller.getXComponentSurfaceId();
            this.state.attach(this.surface);
          })
          .onDestroy((): void => this.state.detach(this.surface))
      }
      .width('100%')
      .height('100%')
      .clip(true)

      if (this.state.subtitle) {
        Text(this.state.subtitle)
          .fontColor(Color.White)
          .fontSize(18)
          .textAlign(TextAlign.Center)
          .backgroundColor('#99000000')
          .padding(8)
          .margin({ bottom: this.state.nativeControls ? 76 : 16 });
      }

      if (this.state.nativeControls && (this.state.buttonOptions.showBottomBar !== false || this.inFullscreen)) {
        Column({ space: 4 }) {
          Row({ space: 12 }) {
            if (this.state.buttonOptions.showPlayPause !== false) {
              Button(this.state.playing ? 'Ⅱ' : '▶')
                .accessibilityText(this.state.playing ? 'Pause' : 'Play')
                .onClick((): void => {
                  if (this.state.playing) this.state.player?.pause();
                  else this.state.player?.play();
                });
            }
            if (!this.state.requiresLinearPlayback && this.state.buttonOptions.showSeekBackward !== false) {
              Button('↶')
                .accessibilityText('Seek backward')
                .enabled(!this.state.isLive && this.state.duration > 0)
                .onClick((): void => this.state.player?.seekBy(-(this.state.player?.seekBackwardIncrement ?? 10)));
            }
            if (!this.state.requiresLinearPlayback && this.state.buttonOptions.showSeekForward !== false) {
              Button('↷')
                .accessibilityText('Seek forward')
                .enabled(!this.state.isLive && this.state.duration > 0)
                .onClick((): void => this.state.player?.seekBy(this.state.player?.seekForwardIncrement ?? 10));
            }
            Blank()
            if (this.state.fullscreenOptions.enable !== false) {
              Button(this.inFullscreen ? '↙' : '⛶')
                .accessibilityText(this.inFullscreen ? 'Exit fullscreen' : 'Fullscreen')
                .onClick((): void => {
                  if (this.inFullscreen) this.state.exitFullscreen();
                  else this.state.enterFullscreen();
                });
            }
          }.width('100%')

          Row({ space: 8 }) {
            if (this.state.showsTimecodes) {
              Text(this.timecode(this.state.position))
                .fontColor(Color.White)
                .fontSize(12);
            }
            Slider({ value: this.seeking ? this.seekValue : this.state.position, min: 0, max: Math.max(1, this.state.duration), step: 0.1 })
              .layoutWeight(1)
              .enabled(!this.state.requiresLinearPlayback && !this.state.isLive && this.state.duration > 0)
              .onChange((value: number, mode: SliderChangeMode): void => {
                this.seekValue = value;
                this.seeking = mode === SliderChangeMode.Begin || mode === SliderChangeMode.Moving;
                if (mode === SliderChangeMode.End || mode === SliderChangeMode.Click) this.state.player?.seek(value);
              })
            if (this.state.showsTimecodes) {
              Text(this.timecode(this.state.duration))
                .fontColor(Color.White)
                .fontSize(12);
            }
          }
        }
        .padding(12)
        .width('100%')
        .backgroundColor('#99000000');
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor(Color.Black)
    .onAreaChange((_old: Area, area: Area): void => {
      this.areaWidth = Number(area.width);
      this.areaHeight = Number(area.height);
    });
  }
}
