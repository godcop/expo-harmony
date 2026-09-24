import { Image } from 'react-native';

const resolveAssetSource = Image.resolveAssetSource;

export default resolveAssetSource;
export const { pickScale, setCustomSourceTransformer } = resolveAssetSource;
