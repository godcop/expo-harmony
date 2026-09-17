import type { HarmonySymbolName } from '@expo-harmony/expo-symbols/src';
import { SymbolView, unstable_getMaterialSymbolSourceAsync } from 'expo-symbols';
import type { SymbolType, SymbolWeight } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { palette } from '../theme';
import { ActionButton, ActionRow, DataRow, Field, Note, Panel, ResultPanel, useAsyncResult } from '../ui';

const folder = { ios: 'folder.badge.plus', android: 'create_new_folder', web: 'create_new_folder', harmony: 'ohos_folder_badge_plus' } as const;
const types: SymbolType[] = ['monochrome', 'hierarchical', 'palette', 'multicolor'];
const weights: SymbolWeight[] = ['ultraLight', 'regular', 'black'];

export function SymbolsDemo() {
  const [name, setName] = useState('house_fill');
  const [size, setSize] = useState(64);
  const [weight, setWeight] = useState<SymbolWeight>('regular');
  const [mounted, setMounted] = useState(true);
  const [layout, setLayout] = useState('等待 onLayout');
  const [type, setType] = useState<SymbolType>('palette');
  const [tint, setTint] = useState<string>();
  const [colors, setColors] = useState<string[]>(['#007AFF', '#FF9500', '#34C759']);
  const action = useAsyncResult();

  const symbol: HarmonySymbolName = { ios: 'house.fill', android: 'home', web: 'home', harmony: name };

  return (
    <>
      <Panel eyebrow="SymbolView" title="名称与动态属性">
        <View style={styles.preview}>
          {mounted
            ? (
                <SymbolView
                  accessibilityLabel="系统图标预览"
                  fallback={<Text style={styles.fallback} testID="symbols-fallback">图标不可用</Text>}
                  name={symbol}
                  onLayout={({ nativeEvent }) => setLayout(`${nativeEvent.layout.width} × ${nativeEvent.layout.height}`)}
                  size={size}
                  testID="symbols-preview"
                  tintColor={palette.signal}
                  weight={weight}
                />
              )
            : <Text style={styles.fallback}>组件已卸载</Text>}
        </View>
        <Field label="name.harmony" onChangeText={setName} value={name} testID="symbols-name" />
        <ActionRow>
          <ActionButton label="房屋" onPress={() => setName('house_fill')} testID="symbols-home" />
          <ActionButton label="Wi-Fi" onPress={() => setName('ohos_wifi')} testID="symbols-wifi" tone="secondary" />
          <ActionButton label="不存在的名称" onPress={() => setName('missing_symbol_for_demo')} testID="symbols-missing" tone="secondary" />
        </ActionRow>
        <DataRow label="size / weight" value={`${size} / ${weight}`} />
        <DataRow label="onLayout" value={layout} />
        <ActionRow>
          <ActionButton label="切换尺寸" onPress={() => setSize(value => value === 64 ? 96 : value === 96 ? 0 : 64)} testID="symbols-size" tone="secondary" />
          <ActionButton label="切换字重" onPress={() => setWeight(value => weights[(weights.indexOf(value) + 1) % weights.length]!)} testID="symbols-weight" tone="secondary" />
          <ActionButton label={mounted ? '卸载组件' : '挂载组件'} onPress={() => setMounted(value => !value)} testID="symbols-mount" tone="secondary" />
        </ActionRow>
        <Note>尺寸依次为 64、96、0；0 隐藏图形。不存在的名称应显示 fallback，切回房屋应恢复；切换图标与字重无需重新挂载。</Note>
      </Panel>

      <Panel eyebrow="Colors" title="配色与属性重置">
        <View style={styles.preview}>
          <SymbolView
            accessibilityLabel="多色文件夹"
            colors={colors}
            fallback={<Text style={styles.fallback}>系统缺少文件夹图标</Text>}
            name={folder}
            size={88}
            testID="symbols-colors-preview"
            tintColor={tint}
            type={type}
          />
        </View>
        <DataRow label="type" value={type} />
        <DataRow label="tintColor" value={tint ?? '系统默认'} />
        <DataRow label="colors" value={colors.join(', ') || '未设置'} />
        <ActionRow>
          {types.map(value => <ActionButton key={value} label={value} onPress={() => setType(value)} testID={`symbols-type-${value}`} tone="secondary" />)}
        </ActionRow>
        <ActionRow>
          <ActionButton label="红色覆盖" onPress={() => setTint('#FF3B30')} testID="symbols-tint" />
          <ActionButton label="全透明" onPress={() => setTint('transparent')} testID="symbols-transparent" tone="secondary" />
          <ActionButton label="移除 tint" onPress={() => setTint(undefined)} testID="symbols-reset-tint" tone="secondary" />
        </ActionRow>
        <ActionRow>
          <ActionButton label="三色调色板" onPress={() => setColors(['#007AFF', '#FF9500', '#34C759'])} testID="symbols-palette" tone="secondary" />
          <ActionButton label="单色调色板" onPress={() => setColors(['#FF9500'])} testID="symbols-single-color" tone="secondary" />
          <ActionButton label="移除 colors" onPress={() => setColors([])} testID="symbols-reset-colors" tone="secondary" />
        </ActionRow>
        <Note>tint 优先于调色板，全透明时图形应完全消失。移除 tint 后恢复调色板；少于两个颜色时恢复系统配色。分层模式保留不同层次的透明度。</Note>
      </Panel>

      <Panel eyebrow="Fallback" title="显式选择鸿蒙名称">
        <DataRow label="SF 字符串" value={<SymbolView name="house.fill" fallback={<Text style={styles.fallback} testID="symbols-string-fallback">fallback</Text>} />} />
        <DataRow label="仅 iOS" value={<SymbolView name={{ ios: 'house.fill' }} fallback={<Text style={styles.fallback} testID="symbols-ios-fallback">fallback</Text>} />} />
        <DataRow label="仅 Android" value={<SymbolView name={{ android: 'home' }} fallback={<Text style={styles.fallback} testID="symbols-android-fallback">fallback</Text>} />} />
        <DataRow label="仅 Web" value={<SymbolView name={{ web: 'home' }} fallback={<Text style={styles.fallback} testID="symbols-web-fallback">fallback</Text>} />} />
        <Note>在 HarmonyOS 上，以上四项都应显示 fallback。库不会自动转换或复用其他平台的名称。</Note>
      </Panel>

      <Panel eyebrow="Platform" title="平台能力边界">
        <ActionButton
          label="生成 Material 图片"
          onPress={() => void action.run(async () => {
            const source = await unstable_getMaterialSymbolSourceAsync('home', 24, '#007AFF');

            return `unstable_getMaterialSymbolSourceAsync() → ${JSON.stringify(source)}`;
          })}
          testID="symbols-material-source"
        />
        <ResultPanel state={action.state} />
        <Note>HarmonyOS 返回 null；scale、resizeMode 与 animationSpec 当前不生效，图标按固定字号居中静态显示。</Note>
      </Panel>
    </>
  );
}

const styles = StyleSheet.create({
  preview: { alignItems: 'center', backgroundColor: palette.surfaceRaised, borderRadius: 12, height: 136, justifyContent: 'center' },
  fallback: { color: palette.muted, fontSize: 13 },
});
