import type { ReactRootViewContext } from '@expo-harmony/expo-modules-core';
import { DevLauncherController, DevLauncherViewState } from './DevLauncherController';
import { DiscoveredServer } from './DevServerDiscovery';
import { RecentApp } from './RecentApps';
@Builder
export function buildExpoDevLauncherRoot(context: ReactRootViewContext): void {
  if (context.ready) {
    context.defaultRoot.builder(context);
  } else {
    ExpoDevLauncherView({ controller: DevLauncherController.get(context.core.uiAbilityContext.getApplicationContext()) });
  }
}
@Component
export struct ExpoDevLauncherView {
  @Require public controller!: DevLauncherController;
  @State private state: DevLauncherViewState = new DevLauncherViewState(false, 0, undefined, [], []);
  @State private address: string = '';
  private unsubscribe?: () => void;

  aboutToAppear(): void {
    this.unsubscribe = this.controller.subscribe((state: DevLauncherViewState): void => {
      this.state = state;
    });
  }

  aboutToDisappear(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  private open(url: string): void {
    this.address = url;
    this.controller.load(url).catch((): void => {});
  }

  build(): void {
    Scroll() {
      Column({ space: 16 }) {
        Text('Expo Dev Launcher')
          .fontSize(30)
          .fontWeight(FontWeight.Bold)
          .fontColor('#111827')
          .width('100%')
        Text('Open a Harmony development server or a compatible published update.')
          .fontSize(15)
          .fontColor('#6B7280')
          .width('100%')

        Row({ space: 8 }) {
          TextInput({ text: this.address, placeholder: 'http://192.168.1.2:8081' })
            .onChange((value: string): void => {
              this.address = value;
            })
            .enabled(!this.state.loading)
            .layoutWeight(1)
            .height(48)
          Button('Open')
            .enabled(!this.state.loading && this.address.trim().length > 0)
            .onClick((): void => this.open(this.address))
        }.width('100%')

        Button('Scan QR code', { type: ButtonType.Normal })
          .width('100%')
          .enabled(!this.state.loading)
          .onClick((): void => {
            this.controller.scan().catch((): void => {});
          })

        if (this.state.loading) {
          Column({ space: 8 }) {
            Text('Loading project…')
              .fontSize(14)
              .fontColor('#374151')
            Progress({ value: Math.round(this.state.progress * 100), total: 100, type: ProgressType.Linear }).width('100%')
          }
          .padding(16)
          .borderRadius(12)
          .backgroundColor('#F3F4F6')
          .width('100%');
        }

        if (this.state.error !== undefined) {
          Text(this.state.error)
            .fontSize(14)
            .fontColor('#B91C1C')
            .backgroundColor('#FEF2F2')
            .borderRadius(12)
            .padding(16)
            .width('100%');
        }

        if (this.state.servers.length > 0) {
          Text('Development servers')
            .fontSize(18)
            .fontWeight(FontWeight.Medium)
            .width('100%');
          ForEach(
            this.state.servers,
            (server: DiscoveredServer): void => {
              Button(`${server.name}\n${server.url}`, { type: ButtonType.Normal })
                .width('100%')
                .enabled(!this.state.loading)
                .onClick((): void => this.open(server.url));
            },
            (server: DiscoveredServer): string => server.id,
          );
        }

        if (this.state.recent.length > 0) {
          Row() {
            Text('Recently opened')
              .fontSize(18)
              .fontWeight(FontWeight.Medium)
              .layoutWeight(1)
            Button('Clear', { type: ButtonType.Normal })
              .enabled(!this.state.loading)
              .onClick((): void => {
                this.controller.clearHistory().catch((): void => {});
              })
          }.width('100%');
          ForEach(
            this.state.recent,
            (app: RecentApp): void => {
              Button(`${app.name}\n${app.url}`, { type: ButtonType.Normal })
                .width('100%')
                .enabled(!this.state.loading)
                .onClick((): void => this.open(app.url));
            },
            (app: RecentApp): string => app.url,
          );
        }
      }
      .width('100%')
      .padding({ left: 24, right: 24, top: 48, bottom: 48 })
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#FFFFFF');
  }
}
