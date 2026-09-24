import { MeshGradientView } from 'expo-mesh-gradient';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { palette } from '../theme';
import { ActionButton, ActionRow, DataRow, Note, Panel } from '../ui';

const POINTS = [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [0.5, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]];
const SHIFTED = POINTS.map((point, index) => index === 4 ? [0.25, 0.7] : point);
const COLORS = ['#FF7064', '#FFB000', '#FFE79B', '#C36BF0', '#FFFFFF', '#51D88A', '#7B61FF', '#72D8FF', '#007AFF'];
const REVERSED = [...COLORS].reverse();
const RECTANGLE = [[0, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [1, 1]];
const OPAQUE = ['#FF7064', '#FFB000', '#7B61FF', '#51D88A', '#007AFF', '#72D8FF'];
const TRANSPARENT = OPAQUE.map(color => `${color}66`);
const CORNERS = [[0, 0], [1, 0], [0, 1], [1, 1]];
const BOUNDARIES = {
  valid: { columns: 2, rows: 2, points: CORNERS, colors: OPAQUE.slice(0, 4), label: '正常网格' },
  invalid: { columns: 2, rows: 2, points: CORNERS.slice(0, 3), colors: OPAQUE.slice(0, 4), label: '点数不足，应清空渐变' },
  empty: { columns: 0, rows: 0, points: [], colors: [], label: '空网格，应保留子内容' },
};

export function MeshGradientDemo() {
  const [shifted, setShifted] = useState(false);
  const [reversed, setReversed] = useState(false);
  const [resolution, setResolution] = useState(8);
  const [clicks, setClicks] = useState(0);
  const [showChildText, setShowChildText] = useState(true);
  const [transparent, setTransparent] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(true);
  const [boundary, setBoundary] = useState<keyof typeof BOUNDARIES>('valid');
  const points = shifted ? SHIFTED : POINTS;
  const colors = reversed ? REVERSED : COLORS;
  const { label, ...grid } = BOUNDARIES[boundary];

  return (
    <>
      <Panel eyebrow="网格与子视图" title="九个顶点，自由改变色彩分布">
        <MeshGradientView
          columns={3}
          rows={3}
          points={points}
          colors={colors}
          resolution={{ x: resolution, y: resolution }}
          style={styles.hero}
          testID="mesh-gradient-preview"
        >
          <Text style={styles.title}>MESH GRADIENT</Text>
          {showChildText ? <Text style={styles.copy} testID="mesh-gradient-child-text">移动色彩的边界，保留子视图的交互。</Text> : null}
          <ActionButton label={`子按钮：${clicks}`} onPress={() => setClicks(value => value + 1)} testID="mesh-gradient-child" />
        </MeshGradientView>
        <DataRow label="中心点" value={shifted ? '(0.25, 0.7)' : '(0.5, 0.5)'} />
        <DataRow label="每条边采样段数" value={`${resolution} × ${resolution}`} />
        <ActionRow>
          <ActionButton label="移动中心点" onPress={() => setShifted(value => !value)} testID="mesh-gradient-move" />
          <ActionButton label="反转颜色" onPress={() => setReversed(value => !value)} testID="mesh-gradient-colors" tone="secondary" />
          <ActionButton label="切换采样" onPress={() => setResolution(value => value === 1 ? 8 : value === 8 ? 16 : 1)} testID="mesh-gradient-resolution" tone="secondary" />
          <ActionButton label={showChildText ? '移除子文本' : '添加子文本'} onPress={() => setShowChildText(value => !value)} testID="mesh-gradient-toggle-child" tone="secondary" />
        </ActionRow>
      </Panel>

      <Panel eyebrow="颜色插值" title="相同顶点，不同过渡">
        <View style={styles.comparison}>
          <MeshGradientView columns={3} rows={3} points={SHIFTED} colors={COLORS} smoothsColors style={styles.sample} testID="mesh-gradient-smooth">
            <Text style={styles.label}>smoothsColors = true</Text>
          </MeshGradientView>
          <MeshGradientView columns={3} rows={3} points={SHIFTED} colors={COLORS} smoothsColors={false} style={styles.sample} testID="mesh-gradient-linear">
            <Text style={styles.label}>smoothsColors = false</Text>
          </MeshGradientView>
        </View>
        <Note>两侧形状相同，颜色过渡应有差异。HarmonyOS 的颜色插值遵循上游 Android 行为。</Note>
      </Panel>

      <Panel eyebrow="透明度与生命周期" title="矩形网格、尺寸变化与重新挂载">
        <View style={[styles.scene, { height: expanded ? 260 : 150 }]} testID="mesh-gradient-scene">
          <View style={styles.dark} />
          <Text style={styles.backdrop}>透明底图</Text>
          {mounted
            ? (
                <MeshGradientView
                  columns={2}
                  rows={3}
                  points={RECTANGLE}
                  colors={transparent ? TRANSPARENT : OPAQUE}
                  style={StyleSheet.absoluteFill}
                  testID="mesh-gradient-alpha"
                />
              )
            : null}
        </View>
        <DataRow label="当前状态" value={`${transparent ? '40% 不透明度' : '完全不透明'} · ${expanded ? '260' : '150'} 高 · ${mounted ? '已挂载' : '已卸载'}`} />
        <ActionRow>
          <ActionButton label="切换透明度" onPress={() => setTransparent(value => !value)} testID="mesh-gradient-opacity" />
          <ActionButton label="切换高度" onPress={() => setExpanded(value => !value)} testID="mesh-gradient-resize" tone="secondary" />
          <ActionButton label={mounted ? '卸载渐变' : '重新挂载'} onPress={() => setMounted(value => !value)} testID="mesh-gradient-mount" tone="secondary" />
        </ActionRow>
      </Panel>

      <Panel eyebrow="边界与恢复" title="无效输入之后恢复绘制">
        <MeshGradientView {...grid} style={styles.boundary} testID="mesh-gradient-boundary">
          <Text style={styles.label}>{label}</Text>
        </MeshGradientView>
        <ActionRow>
          <ActionButton label="点数不足" onPress={() => setBoundary('invalid')} testID="mesh-gradient-invalid" tone="secondary" />
          <ActionButton label="清空网格" onPress={() => setBoundary('empty')} testID="mesh-gradient-empty" tone="secondary" />
          <ActionButton label="恢复网格" onPress={() => setBoundary('valid')} testID="mesh-gradient-restore" />
        </ActionRow>
        <Note>无效网格会输出警告并清除渐变，子内容应仍然可见；恢复后应重新显示四角渐变。iOS 专属的 mask 和 ignoresSafeArea 在 HarmonyOS 上不生效。</Note>
      </Panel>
    </>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 14, gap: 12, height: 240, justifyContent: 'flex-end', overflow: 'hidden', padding: 18 },
  title: { color: palette.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.8 },
  copy: { color: palette.text, fontSize: 12, lineHeight: 18 },
  comparison: { flexDirection: 'row', gap: 12 },
  sample: { borderRadius: 12, flex: 1, height: 170, justifyContent: 'flex-end', overflow: 'hidden', padding: 8 },
  label: { backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 6, color: palette.text, fontSize: 11, fontWeight: '700', padding: 8, textAlign: 'center' },
  scene: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: palette.line, borderRadius: 12, borderWidth: 1, justifyContent: 'center', overflow: 'hidden' },
  dark: { backgroundColor: '#334155', bottom: 0, left: 0, position: 'absolute', top: 0, width: '50%' },
  backdrop: { backgroundColor: '#FFFFFF', color: '#111827', fontSize: 22, fontWeight: '800', padding: 12 },
  boundary: { backgroundColor: palette.surfaceRaised, borderRadius: 12, height: 120, justifyContent: 'center', overflow: 'hidden', padding: 16 },
});
