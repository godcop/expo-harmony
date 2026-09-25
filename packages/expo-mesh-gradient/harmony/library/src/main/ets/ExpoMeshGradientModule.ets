import { drawing } from '@kit.ArkGraphics2D';
import { DrawContext, FrameNode, NodeController, RenderNode, Size, UIContext } from '@kit.ArkUI';
import {
  ExpoModule,
  ExpoModuleContext,
  ExpoModuleDefinition,
  ExpoValueTypes,
  ExpoView,
  ExpoViewContext,
  ExpoViewDefinition,
} from '@expo-harmony/expo-modules-core';
import type { ExpoViewContentContext } from '@expo-harmony/expo-modules-core';
import { createMesh, DEFAULT_RESOLUTION, MeshGradientData } from './MeshGradientData';

@Observed
class ExpoMeshGradientView extends ExpoView {
  columns: number = 0;
  rows: number = 0;
  points: number[][] = [];
  colors: number[] = [];
  resolution: Record<string, number> = {};
  smoothsColors: boolean = true;
  mesh?: MeshGradientData;
  redraw?: () => void;

  constructor(context: ExpoViewContext) {
    super(context);
  }

  update(): void {
    try {
      this.mesh = createMesh(
        this.columns,
        this.rows,
        this.points,
        this.colors,
        this.resolution['x'] ?? DEFAULT_RESOLUTION,
        this.resolution['y'] ?? DEFAULT_RESOLUTION,
        this.smoothsColors,
      );
    } catch (error) {
      this.mesh = undefined;
      console.warn(`ExpoMeshGradient cleared an invalid mesh: ${String(error)}`);
    }

    this.redraw?.();
  }
}

class MeshRenderNode extends RenderNode {
  mesh?: MeshGradientData;
  private brush: drawing.Brush = new drawing.Brush();

  override draw(context: DrawContext): void {
    const mesh = this.mesh;
    if (mesh === undefined) return;

    const size = context.sizeInPixel;
    if (size.width <= 0 || size.height <= 0) return;

    const canvas = context.canvas;
    canvas.save();
    canvas.scale(size.width, size.height);
    canvas.attachBrush(this.brush);

    try {
      // DST selects vertex colors; the brush still composites them with SRC_OVER.
      canvas.drawVertices(
        drawing.VertexMode.TRIANGLES_VERTEXMODE,
        mesh.positions.length,
        mesh.positions,
        mesh.positions,
        mesh.colors,
        mesh.indices.length,
        mesh.indices,
        drawing.BlendMode.DST,
      );
    } catch (error) {
      console.warn(`ExpoMeshGradient could not draw the mesh: ${String(error)}`);
    } finally {
      canvas.detachBrush();
      canvas.restore();
    }
  }
}

class MeshNodeController extends NodeController {
  private frame?: FrameNode;
  private node?: MeshRenderNode;
  private mesh?: MeshGradientData;

  override makeNode(context: UIContext): FrameNode {
    if (this.frame === undefined) {
      this.frame = new FrameNode(context);
      this.node = new MeshRenderNode();

      this.node.mesh = this.mesh;
      this.node.clipToFrame = true;
      this.frame.getRenderNode()?.appendChild(this.node);
    }

    return this.frame;
  }

  override aboutToResize(size: Size): void {
    const root = this.frame?.getRenderNode();
    if (root !== undefined && root !== null) root.size = size;

    if (this.node !== undefined) {
      this.node.size = size;
      this.node.invalidate();
    }
  }

  update(mesh: MeshGradientData | undefined): void {
    this.mesh = mesh;

    if (this.node !== undefined) {
      this.node.mesh = mesh;
      this.node.invalidate();
    }
  }

  dispose(): void {
    this.frame?.getRenderNode()?.clearChildren();
    this.node?.dispose();
    this.frame?.dispose();

    this.node = undefined;
    this.frame = undefined;
    this.mesh = undefined;
  }
}

@Component
struct ExpoMeshGradientContent {
  @ObjectLink view: ExpoMeshGradientView;
  private controller: MeshNodeController = new MeshNodeController();

  aboutToAppear(): void {
    this.view.redraw = (): void => this.controller.update(this.view.mesh);
    this.controller.update(this.view.mesh);
  }

  aboutToDisappear(): void {
    this.view.redraw = undefined;
    this.controller.dispose();
  }

  build(): void {
    NodeContainer(this.controller)
      .width('100%')
      .height('100%')
      .hitTestBehavior(HitTestMode.None);
  }
}

@Builder
function buildMeshGradient(context: ExpoViewContentContext): void {
  ExpoMeshGradientContent({ view: context.nativeView as ExpoMeshGradientView });
}

export class ExpoMeshGradientModule extends ExpoModule {
  constructor(context: ExpoModuleContext) {
    super(context);
  }

  override definition(): ExpoModuleDefinition {
    const view = new ExpoViewDefinition<ExpoMeshGradientView>(
      'MeshGradientView',
      (context: ExpoViewContext): ExpoMeshGradientView => new ExpoMeshGradientView(context),
      wrapBuilder(buildMeshGradient),
    )
      .groupView()
      .prop(
        'columns',
        ExpoValueTypes.number(),
        (view: ExpoMeshGradientView, value: number): void => {
          view.columns = value;
        },
        0,
      )
      .prop(
        'rows',
        ExpoValueTypes.number(),
        (view: ExpoMeshGradientView, value: number): void => {
          view.rows = value;
        },
        0,
      )
      .prop(
        'points',
        ExpoValueTypes.array(ExpoValueTypes.array(ExpoValueTypes.number())),
        (view: ExpoMeshGradientView, value: number[][]): void => {
          view.points = value;
        },
        [],
      )
      .prop(
        'colors',
        ExpoValueTypes.array(ExpoValueTypes.number()),
        (view: ExpoMeshGradientView, value: number[]): void => {
          view.colors = value;
        },
        [],
      )
      .prop(
        'resolution',
        ExpoValueTypes.record(ExpoValueTypes.number()),
        (view: ExpoMeshGradientView, value: Record<string, number>): void => {
          view.resolution = value;
        },
        {},
      )
      .prop(
        'smoothsColors',
        ExpoValueTypes.boolean(),
        (view: ExpoMeshGradientView, value: boolean): void => {
          view.smoothsColors = value;
        },
        true,
      )
      .prop('mask', ExpoValueTypes.boolean(), (_view: ExpoMeshGradientView, _value: boolean): void => {}, false)
      .prop('ignoresSafeArea', ExpoValueTypes.boolean(), (_view: ExpoMeshGradientView, _value: boolean): void => {}, true)
      .onDidUpdateProps((view: ExpoMeshGradientView): void => view.update())
      .onDestroy((view: ExpoMeshGradientView): void => {
        view.redraw = undefined;
        view.mesh = undefined;
      });

    return new ExpoModuleDefinition().name('ExpoMeshGradient').view(view);
  }
}
