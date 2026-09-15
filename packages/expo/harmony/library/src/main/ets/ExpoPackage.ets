import { RNPackage } from '@rnoh/react-native-openharmony';

export class ExpoPackage extends RNPackage {
  override getDebugName(): string { return '@expo-harmony/expo'; }
}
