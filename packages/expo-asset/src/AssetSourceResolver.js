import Resolver from 'react-native/Libraries/Image/AssetSourceResolver';
import { pickScale } from 'react-native/Libraries/Image/AssetUtils';

export default class AssetSourceResolver extends Resolver {
  static pickScale = pickScale;
}
