import { Image } from 'react-native';

// RNOH exposes its resolver and transformer hooks through Image. Expo's native
// AssetSources only needs AssetSourceResolver.pickScale, also exposed here.
const resolveAssetSource = Image.resolveAssetSource;

export default resolveAssetSource;
export const { pickScale, setCustomSourceTransformer } = resolveAssetSource;
